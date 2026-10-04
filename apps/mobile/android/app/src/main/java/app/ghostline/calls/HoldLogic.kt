package app.ghostline.calls

import android.media.AudioManager

/**
 * Whether a hold/resume from the system changes anything. Only a call that is `active`/`reconnecting` can be
 * put on hold — the page ignores `hold` in any other phase, and a hold native kept anyway would never be
 * resumed by it. A resume is always allowed for the call that is held; a repeat, a call that is not ours any
 * more ([callId] differs) and no call at all change nothing.
 */
fun shouldApplyHold(state: NativeCallState?, heldCallId: String?, callId: String, hold: Boolean): Boolean {
    if (state == null || state.callId != callId) return false
    if ((heldCallId == callId) == hold) return false
    return !hold || state.phase == CallPhase.Active || state.phase == CallPhase.Reconnecting
}

/** What to do when Telecom reports that the system disconnected a call. */
enum class DisconnectAction {
    /** The app ended the entry itself: this is the echo. */
    Ignore,

    /** A ringing incoming call the user rejected on the system's side (headset, car): decline it. */
    Decline,

    /** A call in progress: the page hangs up. */
    Hangup,
}

fun disconnectAction(incoming: Boolean, answered: Boolean, ending: Boolean): DisconnectAction = when {
    ending -> DisconnectAction.Ignore
    incoming && !answered -> DisconnectAction.Decline
    else -> DisconnectAction.Hangup
}

/** What [AudioRouter] does about the route: the user's choice to keep, and the route to ask for (if any). */
data class RouteDecision(val userChoice: AudioRoute?, val request: AudioRoute?)

/**
 * A choice whose device went away is dropped. If the sound is on a route the list does not offer (the system
 * moved it to something we can't name, e.g. a headset while the Bluetooth permission is missing) it is left
 * alone — taking the call off the user's headset is worse than not applying the default.
 */
fun decideRoute(video: Boolean, connected: List<AudioRoute>, userChoice: AudioRoute?, current: AudioRoute?): RouteDecision {
    val choice = userChoice?.takeIf { it in connected }
    if (current != null && current !in connected) return RouteDecision(choice, null)
    val want = pickRoute(video, connected, choice)
    return RouteDecision(choice, want?.takeIf { it != current })
}

/**
 * Telecom promises no `onSetActive` when the call that held ours ends, so native asks for the call back — but
 * not while a GSM call is on the phone (`MODE_IN_CALL`, `MODE_RINGTONE`). `MODE_IN_COMMUNICATION` is allowed:
 * it may well be our own held call that keeps the mode there, and Telecom refuses a `setActive` it can't honour.
 */
fun canTryResume(audioMode: Int): Boolean = audioMode != AudioManager.MODE_IN_CALL && audioMode != AudioManager.MODE_RINGTONE

/**
 * The page reloaded while the call was held: native still holds it, the page does not know. Every state the
 * page reports for the held call in a phase that can be held is answered with another `hold` (idempotent there).
 */
fun shouldResendHold(reported: NativeCallState?, heldCallId: String?): Boolean =
    reported != null && reported.callId == heldCallId &&
        (reported.phase == CallPhase.Active || reported.phase == CallPhase.Reconnecting)
