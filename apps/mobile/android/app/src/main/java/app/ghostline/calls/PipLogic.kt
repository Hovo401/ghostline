package app.ghostline.calls

/** A button on the picture-in-picture window; [MainActivity] turns it into a `RemoteAction`. */
enum class PipAction {
    Mute,
    Unmute,
    Hangup,
}

/** The PiP window is portrait, like the remote video of a phone-to-phone call. */
const val PIP_ASPECT_WIDTH = 9
const val PIP_ASPECT_HEIGHT = 16

/** Only a video call that is up (or briefly reconnecting) shrinks into a window; ringing/dialling does not. */
fun pipAllowed(state: NativeCallState?): Boolean =
    state != null && state.video && (state.phase == CallPhase.Active || state.phase == CallPhase.Reconnecting)

/** Buttons of the PiP window: the mic toggle (icon and label show the current mic state), then "hang up". None when PiP is not allowed. */
fun pipActions(state: NativeCallState?): List<PipAction> {
    if (state == null || !pipAllowed(state)) return emptyList()
    return listOf(if (state.muted) PipAction.Unmute else PipAction.Mute, PipAction.Hangup)
}

/** Dismissing the PiP window removes the task and destroys the page, so the call it showed is over. */
fun endsCallOnPipClose(wasInPip: Boolean, state: NativeCallState?): Boolean = wasInPip && state != null
