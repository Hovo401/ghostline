package app.ghostline.calls

import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallControlResult
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallsManager
import app.ghostline.push.PushNotifier
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Registers Ghostline calls with Telecom (ADR-0019) so the system knows about them. The media stays in the
 * WebView; Telecom is told only the life cycle: added (ringing or dialling), answered, active, ended.
 *
 * One coroutine per call, in the application scope, inside `CallsManager.addCall` (which blocks for the whole
 * call); commands reach it through a channel, so they are safe to send before Telecom has accepted the call
 * and from any thread. A failing `addCall` (a GSM call in progress, a missing permission) is logged and the
 * call carries on without Telecom ([AudioRouter] then routes the sound itself).
 *
 * What the system asks of the call comes back through `addCall`'s callbacks (T-087): hold and resume (a GSM
 * call) go to [CallSession.onSystemHold], a headset-button answer of a ringing call takes the same road as the
 * "Ответить" button ([IncomingCallService.answer]), a disconnect by the system hangs up. The endpoint flows
 * feed [AudioRouter].
 */
object TelecomBridge {
    private const val RESUME_POLL_MS = 3_000L
    private const val RESUME_TIMEOUT_MS = 5_000L

    private sealed interface Command {
        data object Answer : Command
        data object SetActive : Command

        /** Take the call back from hold; [result] is whether Telecom accepted. */
        data class Resume(val result: CompletableDeferred<Boolean>) : Command
        data class End(val cause: Int) : Command
    }

    private class Entry(val incoming: Boolean) {
        val commands = Channel<Command>(Channel.UNLIMITED)
        var active = false

        /** Set when the app ended the entry itself, so the system's echo of it is not taken for a user's hang-up. */
        var ending = false

        /** The system has the call on hold (its `onSetInactive`); native's own flag, not [active]. */
        @Volatile
        var held = false

        /** The "ask for the call back" loop of the current hold; one at a time. */
        var resumeLoop: Job? = null

        /** The endpoint collectors; cancelled with the entry, because the flows may outlive the call. */
        val collectors = ArrayList<Job>()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val entries = HashMap<String, Entry>()

    private var manager: CallsManager? = null
    private var registered = false

    fun registerIncoming(context: Context, callId: String, chatId: String, peerName: String, video: Boolean) =
        register(context, callId, chatId, peerName, video, incoming = true)

    fun registerOutgoing(context: Context, callId: String, chatId: String, peerName: String, video: Boolean) =
        register(context, callId, chatId, peerName, video, incoming = false)

    /** The user picked an incoming call up. A no-op for an outgoing call, an unknown id or a call already answered. */
    @Synchronized
    fun answer(callId: String) {
        val entry = entries[callId] ?: return
        if (!entry.incoming || entry.active) return
        entry.active = true
        entry.commands.trySend(Command.Answer)
    }

    /** Media is flowing. Answering an incoming call already makes it active; an outgoing one is set active here. */
    @Synchronized
    fun setActive(callId: String) {
        val entry = entries[callId] ?: return
        if (entry.active) return
        entry.active = true
        entry.commands.trySend(if (entry.incoming) Command.Answer else Command.SetActive)
    }

    /**
     * The user asked to take [callId] back from hold ("Продолжить"). `false` at once when there is no Telecom entry
     * to ask; otherwise [onResult] says whether Telecom accepted — and then the call is no longer held.
     */
    fun resume(context: Context, callId: String, onResult: (Boolean) -> Unit): Boolean {
        val entry = synchronized(this) { entries[callId] } ?: return false
        scope.launch { onResult(resumeEntry(context.applicationContext, callId, entry)) }
        return true
    }

    /** Ends the Telecom entry; [cause] is a `DisconnectCause` code (LOCAL, REMOTE, REJECTED, MISSED). */
    @Synchronized
    fun end(callId: String, cause: Int) {
        val entry = entries[callId] ?: return
        entry.ending = true
        entry.commands.trySend(Command.End(cause))
    }

    @Synchronized
    private fun register(
        context: Context,
        callId: String,
        chatId: String,
        peerName: String,
        video: Boolean,
        incoming: Boolean,
    ) {
        if (callId in entries) return
        val entry = Entry(incoming)
        entries[callId] = entry
        val app = context.applicationContext
        scope.launch {
            try {
                run(app, callId, chatId, peerName, video, entry)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The class only: the message of a Telecom error is for the system log, not ours.
                Log.w(PushNotifier.LOG_TAG, "call runs without Telecom: ${e.javaClass.simpleName}")
                AudioRouter.onTelecomFailed(callId)
            } finally {
                remove(callId, entry)
            }
        }
    }

    @Synchronized
    private fun remove(callId: String, entry: Entry) {
        entry.commands.close()
        entry.collectors.forEach { it.cancel() }
        entry.resumeLoop?.cancel()
        AudioRouter.onTelecomDetached(callId)
        if (entries[callId] === entry) entries.remove(callId)
    }

    private suspend fun run(
        context: Context,
        callId: String,
        chatId: String,
        peerName: String,
        video: Boolean,
        entry: Entry,
    ) {
        val calls = callsManager(context)
        val attributes = CallAttributesCompat(
            displayName = peerName.ifBlank { "Ghostline" },
            address = Uri.fromParts("ghostline", chatId.ifEmpty { callId }, null),
            direction = if (entry.incoming) CallAttributesCompat.DIRECTION_INCOMING else CallAttributesCompat.DIRECTION_OUTGOING,
            callType = if (video) CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
        )
        calls.addCall(
            attributes,
            onAnswer = { answeredBySystem(context, callId, chatId, video, entry) },
            onDisconnect = { disconnectedBySystem(context, callId, entry) },
            onSetActive = { heldBySystem(context, callId, entry, held = false) },
            onSetInactive = { heldBySystem(context, callId, entry, held = true) },
        ) {
            // Not a child of the addCall scope: that one would wait for this loop after the system ended the
            // call. The loop ends with its channel, which register() closes when addCall returns.
            val control = this
            AudioRouter.onTelecomAttached(callId) { endpoint -> control.requestEndpointChange(endpoint) }
            val bridge = this@TelecomBridge
            synchronized(bridge) {
                entry.collectors += bridge.scope.launch {
                    control.currentCallEndpoint.collect { AudioRouter.onTelecomCurrent(callId, it) }
                }
                entry.collectors += bridge.scope.launch {
                    control.availableEndpoints.collect { AudioRouter.onTelecomAvailable(callId, it) }
                }
            }
            bridge.scope.launch { drive(control, entry, attributes.callType) }
        }
    }

    // The user pressed the headset button (or the car's, the watch's) on a ringing call: same as "Ответить".
    @Synchronized
    private fun answeredBySystem(context: Context, callId: String, chatId: String, video: Boolean, entry: Entry) {
        if (!entry.incoming || entry.active) return
        entry.active = true
        IncomingCallService.answer(context, callId, chatId, video)
    }

    // The system put the call on hold (a GSM call) or gave it back. No `onSetActive` is promised when the other
    // call ends, so while held we ask for the call back ourselves, once nothing else is in a call.
    private fun heldBySystem(context: Context, callId: String, entry: Entry, held: Boolean) {
        synchronized(this) {
            entry.held = held
            if (!held) entry.resumeLoop?.cancel()
        }
        CallSession.onSystemHold(context, callId, held)
        if (!held) return
        val app = context.applicationContext
        synchronized(this) {
            entry.resumeLoop?.cancel()
            entry.resumeLoop = scope.launch {
                val audio = app.getSystemService(AudioManager::class.java)
                while (entry.held) {
                    delay(RESUME_POLL_MS)
                    if (entry.held && canTryResume(audio.mode)) resumeEntry(app, callId, entry)
                }
            }
        }
    }

    private suspend fun resumeEntry(context: Context, callId: String, entry: Entry): Boolean {
        val result = CompletableDeferred<Boolean>()
        if (!entry.commands.trySend(Command.Resume(result)).isSuccess) return false
        val accepted = withTimeoutOrNull(RESUME_TIMEOUT_MS) { result.await() } ?: false
        // Still queued behind something slow? Then it must not run later, long after the caller gave up.
        result.cancel()
        if (accepted) {
            synchronized(this) { entry.held = false }
            CallSession.onSystemHold(context, callId, false)
        }
        return accepted
    }

    // The system ended the call: the headset button during a call, or the user rejected a ringing one there.
    private fun disconnectedBySystem(context: Context, callId: String, entry: Entry) {
        val action = synchronized(this) {
            disconnectAction(entry.incoming, entry.active, entry.ending).also { if (it != DisconnectAction.Ignore) entry.ending = true }
        }
        when (action) {
            DisconnectAction.Ignore -> Unit
            DisconnectAction.Hangup -> CallSession.sendCommand(context, CallCommand.Hangup)
            // Still ringing: decline it the way the screen's button does (the page knows nothing of it yet).
            DisconnectAction.Decline -> IncomingCallState.call.value?.takeIf { it.callId == callId }?.let {
                context.sendBroadcast(CallActionReceiver.intent(context, CallActionReceiver.ACTION_DECLINE, it))
            }
        }
    }

    private suspend fun drive(control: CallControlScope, entry: Entry, callType: Int) {
        for (command in entry.commands) {
            try {
                val result = when (command) {
                    Command.Answer -> control.answer(callType)
                    Command.SetActive -> control.setActive()
                    is Command.Resume ->
                        if (command.result.isActive) control.setActive().also { command.result.complete(it is CallControlResult.Success) } else null
                    is Command.End -> control.disconnect(DisconnectCause(command.cause))
                }
                if (result is CallControlResult.Error) {
                    Log.i(PushNotifier.LOG_TAG, "Telecom refused $command: ${result.errorCode}")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The call is already gone on the system's side.
                Log.i(PushNotifier.LOG_TAG, "Telecom command failed: ${e.javaClass.simpleName}")
                if (command is Command.Resume) command.result.complete(false)
            }
            if (command is Command.End) return
        }
    }

    @Synchronized
    private fun callsManager(context: Context): CallsManager {
        val existing = manager
        if (existing != null && registered) return existing
        val created = existing ?: CallsManager(context)
        created.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE or CallsManager.CAPABILITY_SUPPORTS_VIDEO_CALLING)
        manager = created
        registered = true
        return created
    }
}
