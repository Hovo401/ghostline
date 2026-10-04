package app.ghostline.calls

import android.content.Context
import android.net.Uri
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallControlResult
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallsManager
import app.ghostline.push.PushNotifier
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

/**
 * Registers Ghostline calls with Telecom (ADR-0019) so the system knows about them. The media stays in the
 * WebView; Telecom is told only the life cycle: added (ringing or dialling), answered, active, ended.
 *
 * One coroutine per call, in the application scope, inside `CallsManager.addCall` (which blocks for the whole
 * call); commands reach it through a channel, so they are safe to send before Telecom has accepted the call
 * and from any thread. A failing `addCall` (a GSM call in progress, a missing permission) is logged and the
 * call carries on without Telecom.
 */
object TelecomBridge {
    private sealed interface Command {
        data object Answer : Command
        data object SetActive : Command
        data class End(val cause: Int) : Command
    }

    private class Entry(val incoming: Boolean) {
        val commands = Channel<Command>(Channel.UNLIMITED)
        var active = false
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

    /** Ends the Telecom entry; [cause] is a `DisconnectCause` code (LOCAL, REMOTE, REJECTED, MISSED). */
    @Synchronized
    fun end(callId: String, cause: Int) {
        entries[callId]?.commands?.trySend(Command.End(cause))
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
            } finally {
                remove(callId, entry)
            }
        }
    }

    @Synchronized
    private fun remove(callId: String, entry: Entry) {
        entry.commands.close()
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
        // TODO(T-087): hold / audio routes / headset button (onSetInactive, onDisconnect from the system, endpoints)
        calls.addCall(
            attributes,
            onAnswer = {},
            onDisconnect = {},
            onSetActive = {},
            onSetInactive = {},
        ) {
            // Not a child of the addCall scope: that one would wait for this loop after the system ended the
            // call. The loop ends with its channel, which register() closes when addCall returns.
            val control = this
            this@TelecomBridge.scope.launch { drive(control, entry, attributes.callType) }
        }
    }

    private suspend fun drive(control: CallControlScope, entry: Entry, callType: Int) {
        for (command in entry.commands) {
            try {
                val result = when (command) {
                    Command.Answer -> control.answer(callType)
                    Command.SetActive -> control.setActive()
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
