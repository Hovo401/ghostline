package app.ghostline.calls

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.telecom.DisconnectCause
import android.util.Log
import app.ghostline.GhostlinePlugin
import app.ghostline.push.PushNotifier
import com.getcapacitor.JSObject

/** `NativeCallCommand.type` values that carry no payload (`answer` and `callback` are [LaunchAction]s). */
enum class CallCommand(val wire: String) {
    Hangup("hangup"),
    ToggleMute("toggleMute"),
    Open("open"),
    Hold("hold"),
    Resume("resume"),
}

/**
 * The call the page reports through `Ghostline.setCallState`, and what native does about it: the
 * ongoing-call service and notification ([OngoingCallService]) and the Telecom entry ([TelecomBridge]).
 * The page sends the state on every change, so [reconcile] is idempotent. A ringing incoming call is not
 * driven from here — [IncomingCallService] owns it until the user answers.
 */
object CallSession {
    private var state: NativeCallState? = null
    private var ongoingUp = false
    private val answerWatchdog = AnswerWatchdog()
    private val main = Handler(Looper.getMainLooper())

    /** The id of a call the page dialled: its Telecom entry is outgoing, whatever phase we first hear about. */
    private var outgoingCallId: String? = null

    @Synchronized
    fun reconcile(context: Context, next: NativeCallState?) {
        if (next == state) return
        val app = context.applicationContext
        val previous = state
        if (previous != null && next != null && previous.callId != next.callId) {
            TelecomBridge.end(previous.callId, DisconnectCause.LOCAL)
        }
        if (next == null || next.phase == CallPhase.Ended) {
            state = null
            outgoingCallId = null
            (next?.callId ?: previous?.callId)?.let { TelecomBridge.end(it, DisconnectCause.LOCAL) }
            if (ongoingUp || OngoingCallService.running) {
                OngoingCallService.stop(app)
                ongoingUp = false
            }
            return
        }
        state = next
        if (next.phase == CallPhase.Connecting || next.phase == CallPhase.Active) answerWatchdog.confirm(next.callId)
        when (next.phase) {
            // IncomingCallService rings; the page's own screen is not ours to mirror.
            CallPhase.Incoming, CallPhase.Ended -> return
            CallPhase.Outgoing -> {
                outgoingCallId = next.callId
                register(app, next)
            }
            CallPhase.Connecting -> {
                register(app, next)
                TelecomBridge.answer(next.callId)
            }
            CallPhase.Active -> {
                register(app, next)
                TelecomBridge.setActive(next.callId)
            }
            CallPhase.Reconnecting -> Unit
        }
        ongoingUp = OngoingCallService.show(app, next, running = ongoingUp || OngoingCallService.running) || ongoingUp
    }

    /**
     * The user answered a ringing call natively; its Telecom entry lives on for the page to take over. If the
     * page never reports the call, the entry is ended here.
     */
    fun watchAnswer(callId: String, nowMs: Long) {
        answerWatchdog.arm(callId, nowMs)
        main.postDelayed({
            answerWatchdog.expired(System.currentTimeMillis())?.let { TelecomBridge.end(it, DisconnectCause.LOCAL) }
        }, LaunchActionStore.TTL_MS + 1_000)
    }

    /** The ongoing-call service went away (stopped, or refused to run): it is not "up" any more. */
    @Synchronized
    fun onOngoingStopped() {
        ongoingUp = false
    }

    /** The server closed [callId] (`call:closed`): if the page is not around to say so, the call is over. */
    @Synchronized
    fun onClosed(context: Context, callId: String) {
        if (state?.callId == callId) reconcile(context, null)
    }

    /** A button of the phone's own UI, to the page. A dead page can't hang up, so the notification just goes. */
    fun sendCommand(context: Context, command: CallCommand) {
        if (emit(JSObject().put("type", command.wire))) return
        Log.w(PushNotifier.LOG_TAG, "no page to take the ${command.wire} command")
        if (command == CallCommand.Hangup) reconcile(context, null)
    }

    private fun emit(payload: JSObject): Boolean = GhostlinePlugin.instance?.emitCommand(payload) ?: false

    // Same call, another phase: the entry is already there; a new one is only for a call we first hear of here.
    private fun register(app: Context, call: NativeCallState) {
        if (call.callId == outgoingCallId) {
            TelecomBridge.registerOutgoing(app, call.callId, call.chatId, call.peerName, call.video)
        } else {
            TelecomBridge.registerIncoming(app, call.callId, call.chatId, call.peerName, call.video)
        }
    }
}
