package app.ghostline.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import app.ghostline.messages.NotificationActionApi
import app.ghostline.push.PushNotifier
import com.getcapacitor.CapConfig
import java.util.concurrent.Executors

/**
 * "Отклонить" on the incoming call (notification button and the full-screen screen). It silences
 * the ring at once and tells the server in the background — no WebView, authorized by the push's
 * `declineToken`. Answering is done by [IncomingCallActivity] itself: it has to open the app,
 * which a receiver started from a notification is not allowed to.
 */
class CallActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DECLINE) return
        val call = IncomingCall.from(intent) ?: return
        IncomingCallService.stopFor(context, call.callId, RingEnd.Declined)
        if (call.isTest) return
        val pending = goAsync()
        EXECUTOR.execute {
            try {
                val serverUrl = CapConfig.loadDefault(context).serverUrl
                val declined = serverUrl != null &&
                    NotificationActionApi.declineCall(NotificationActionApi.apiBase(serverUrl), call.callId, call.declineToken)
                if (!declined) Log.w(PushNotifier.LOG_TAG, "decline from the call screen failed")
            } catch (e: Exception) {
                // The class only: an exception message could carry the request URL with its token.
                Log.w(PushNotifier.LOG_TAG, "decline from the call screen failed: ${e.javaClass.simpleName}")
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_DECLINE = "app.ghostline.action.CALL_DECLINE"

        private val EXECUTOR = Executors.newSingleThreadExecutor()

        fun intent(context: Context, action: String, call: IncomingCall): Intent =
            call.putInto(Intent(context, CallActionReceiver::class.java).setAction(action))
    }
}
