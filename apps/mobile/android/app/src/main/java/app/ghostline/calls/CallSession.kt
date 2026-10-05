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
 * The page sends the state on every change, so [reconcile] is idempotent. A ringing incoming call is
 * [IncomingCallService]'s until the user answers; the page only starts it (an `incoming` state its push did not
 * start already), hands it over (the call went on: [RingEnd.Answered]) or ends it (`ended`/`null`), see [pageRingAction].
 */
object CallSession {
    private var state: NativeCallState? = null
    private var ongoingUp = false
    private val answerWatchdog = AnswerWatchdog()
    private val main = Handler(Looper.getMainLooper())

    /** The id of a call the page dialled: its Telecom entry is outgoing, whatever phase we first hear about. */
    private var outgoingCallId: String? = null

    /**
     * [MainActivity]'s picture-in-picture hook: told about every change of the call state, on the main thread.
     * The activity sets it in `onStart` and clears it in `onDestroy`, so the session never outlives it.
     */
    @Volatile
    var stateListener: ((NativeCallState?) -> Unit)? = null

    /** The call the system has on hold (T-087); native's own, the page only hears `hold`/`resume`. */
    private var heldCallId: String? = null

    @Synchronized
    fun current(): NativeCallState? = state

    fun reconcile(context: Context, reported: NativeCallState?) {
        val changed = apply(context, reported)
        if (changed) notifyListener()
    }

    private fun notifyListener() {
        main.post { stateListener?.invoke(current()) }
    }

    /** `true` when the state changed (the early return of an identical state is not a change). */
    @Synchronized
    private fun apply(context: Context, reported: NativeCallState?): Boolean {
        val next = reported?.copy(held = reported.callId == heldCallId)
        // A page that reloaded during a hold reports the call as if nothing happened: tell it again.
        val resendHold = shouldResendHold(reported, heldCallId)
        if (next == state) {
            if (resendHold) sendCommand(context, CallCommand.Hold)
            return false
        }
        applyChange(context, next, resendHold)
        return true
    }

    private fun applyChange(context: Context, next: NativeCallState?, resendHold: Boolean) {
        val app = context.applicationContext
        val previous = state
        if (previous != null && next != null && previous.callId != next.callId) {
            TelecomBridge.end(previous.callId, DisconnectCause.LOCAL)
        }
        // The page is also a source for the ring (T-094): it starts it, hands it over on an answer, ends it.
        val ringCallId = next?.callId ?: previous?.callId
        val ringAction = if (ringCallId == null) {
            PageRingAction.None
        } else {
            pageRingAction(next?.phase, IncomingCallService.isRinging(ringCallId))
        }
        if (next == null || next.phase == CallPhase.Ended) {
            state = null
            outgoingCallId = null
            heldCallId = null
            AudioRouter.end()
            // Declined, cancelled or answered elsewhere, as the page's socket heard it. After `state = null`,
            // so the stop's onClosed does not come back here.
            if (ringAction == PageRingAction.Closed && ringCallId != null) {
                IncomingCallService.stopFor(app, ringCallId, RingEnd.Closed)
            }
            (next?.callId ?: previous?.callId)?.let { TelecomBridge.end(it, DisconnectCause.LOCAL) }
            if (ongoingUp || OngoingCallService.running) {
                OngoingCallService.stop(app)
                ongoingUp = false
            }
            return
        }
        state = next
        if (ringAction == PageRingAction.Answered) {
            // Answered on the page (or the native answer came back as its state): the ring is over, the call
            // lives on, and the later `answered-elsewhere` push of our own answer must not end it.
            IncomingCallService.stopFor(app, next.callId, RingEnd.Answered)
            answerWatchdog.confirm(next.callId)
        }
        if (next.phase == CallPhase.Connecting || next.phase == CallPhase.Active) answerWatchdog.confirm(next.callId)
        when (next.phase) {
            CallPhase.Incoming -> {
                // Quiet or loud by visibility, decided by the service; nothing of the page's screen is mirrored.
                if (ringAction == PageRingAction.Start) IncomingCallService.startFromPage(app, next)
                // The page shows it now: with the app on screen native may go quiet (T-094).
                IncomingCallService.onPageReportedIncoming()
                return
            }
            CallPhase.Ended -> return
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
        AudioRouter.begin(app, next.callId, next.video)
        ongoingUp = OngoingCallService.show(app, next, running = ongoingUp || OngoingCallService.running) || ongoingUp
        if (resendHold) sendCommand(app, CallCommand.Hold)
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

    /**
     * The system put call [callId] on hold (a GSM call came in) or gave it back — from Telecom's `onSetInactive` /
     * `onSetActive`, or from the audio focus when Telecom is not in play. The page mutes and shows it; the
     * notification says "На удержании". What changes nothing is decided by [shouldApplyHold].
     */
    @Synchronized
    fun onSystemHold(context: Context, callId: String, hold: Boolean) {
        val current = state
        if (current == null || !shouldApplyHold(current, heldCallId, callId, hold)) return
        heldCallId = if (hold) callId else null
        val next = current.copy(held = hold)
        state = next
        notifyListener()
        if (ongoingUp || OngoingCallService.running) {
            OngoingCallService.show(context.applicationContext, next, running = true)
        }
        sendCommand(context, if (hold) CallCommand.Hold else CallCommand.Resume)
    }

    /**
     * "Продолжить": the user takes the held call back by hand, for when the system never reports that the
     * other call ended. [onResult] is `false` if nothing is on hold or Telecom refused.
     */
    fun resumeHeld(context: Context, onResult: (Boolean) -> Unit) {
        val callId = synchronized(this) { heldCallId } ?: return onResult(false)
        // Without a Telecom entry (the audio-focus fallback) there is nobody to ask: the user's word is enough.
        if (TelecomBridge.resume(context, callId, onResult)) return
        onSystemHold(context, callId, false)
        onResult(true)
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

    /**
     * "Отклонить" on a ringing call that has no `declineToken` (started from the page's state, T-094): the page
     * declines it (`{type: "decline", callId}`, `NativeCallCommand`). With no page to take it the ring has
     * stopped already and the server's own 45 s timeout ends the call.
     */
    fun sendDecline(callId: String) {
        if (!emit(JSObject().put("type", "decline").put("callId", callId))) {
            Log.w(PushNotifier.LOG_TAG, "no page to take the decline command")
        }
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
