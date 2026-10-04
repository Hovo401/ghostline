package app.ghostline.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** "Завершить" and "Микрофон" on the ongoing-call notification: handed to the page as `callCommand`. */
class OngoingCallActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_HANGUP -> CallSession.sendCommand(context, CallCommand.Hangup)
            ACTION_TOGGLE_MUTE -> CallSession.sendCommand(context, CallCommand.ToggleMute)
        }
    }

    companion object {
        const val ACTION_HANGUP = "app.ghostline.action.CALL_HANGUP"
        const val ACTION_TOGGLE_MUTE = "app.ghostline.action.CALL_TOGGLE_MUTE"

        fun intent(context: Context, action: String): Intent =
            Intent(context, OngoingCallActionReceiver::class.java).setAction(action)
    }
}
