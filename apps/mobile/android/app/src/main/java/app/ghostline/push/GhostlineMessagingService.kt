package app.ghostline.push

import android.util.Log
import app.ghostline.AppVisibility
import app.ghostline.GhostlinePlugin
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives the backend's data-only FCM messages (`{v, iv, ct}` — see `NativePushEnvelopeSchema`),
 * decrypts them with this device's key and hands them to [PushNotifier].
 */
class GhostlineMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // The page re-registers on this event; if the WebView is dead it fetches the token next launch.
        GhostlinePlugin.instance?.emitTokenChanged(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val iv = data["iv"]
        val ct = data["ct"]
        if (data["v"] != "1" || iv == null || ct == null) {
            Log.w(PushNotifier.LOG_TAG, "ignoring a push with an unknown envelope")
            return
        }
        val store = DeviceKeyStore.get(this)
        val push = try {
            NativePush.parse(PushCrypto.decrypt(iv, ct, store.deviceKey(), store.deviceId()))
        } catch (e: Exception) {
            // Wrong key (reinstalled, Keystore reset) — the page re-registers on its next launch.
            Log.w(PushNotifier.LOG_TAG, "could not decrypt a push", e)
            return
        }
        if (push == null) {
            Log.w(PushNotifier.LOG_TAG, "ignoring a push of an unknown kind")
            return
        }
        // The open app already got this over its socket; only the settings test must always show.
        if (AppVisibility.foreground && push != NativePush.Test) return
        PushNotifier.handle(this, push)
    }
}
