package app.ghostline

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import app.ghostline.calls.CallCommand
import app.ghostline.calls.CallSession
import app.ghostline.calls.LaunchAction
import app.ghostline.calls.LaunchActionStore
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Plugins registered after super.onCreate are not picked up by the bridge.
        registerPlugin(GhostlinePlugin::class.java)
        super.onCreate(savedInstanceState)
        // Ringtone and remote call audio start without a tap (the web app plays them from sockets/LiveKit).
        bridge.webView.settings.mediaPlaybackRequiresUserGesture = false
        // A WebView drops downloads on the floor; the update banner's APK link goes to the system instead.
        bridge.webView.setDownloadListener { url, _, _, _, _ ->
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
        // Not on a re-creation or a start from Recents: that intent was acted on already.
        val fresh = savedInstanceState == null && (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0
        if (fresh) handleCallIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleCallIntent(intent)
    }

    /**
     * An answer/callback (call screen, heads-up, missed-call notification) or a tap on the ongoing-call
     * notification. If the page isn't listening yet (a cold start) the action waits in the store
     * for `consumeLaunchAction`; the page's own state decides whether it is still valid.
     */
    private fun handleCallIntent(intent: Intent) {
        LaunchAction.takeFrom(intent)?.let { action ->
            // Delivered to a listening page: not kept, a page that reloads would act on it a second time (and
            // drop the copy IncomingCallService.answer kept in case this start never happened).
            val delivered = GhostlinePlugin.instance?.emitCommand(action.toJson()) ?: false
            if (delivered) LaunchActionStore.shared.discard(action) else LaunchActionStore.shared.put(action, System.currentTimeMillis())
        }
        if (intent.getBooleanExtra(EXTRA_OPEN_CALL, false)) {
            intent.removeExtra(EXTRA_OPEN_CALL)
            CallSession.sendCommand(this, CallCommand.Open)
        }
    }

    override fun onStart() {
        super.onStart()
        AppVisibility.foreground = true
    }

    override fun onPause() {
        // The WebView writes cookies to disk lazily; a swipe from Recents or an APK update right after a
        // token refresh would leave the previous refresh cookie on disk (ADR-0021).
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onStop() {
        AppVisibility.foreground = false
        CookieManager.getInstance().flush()
        super.onStop()
    }

    companion object {
        /** Set by the ongoing-call notification's tap. */
        const val EXTRA_OPEN_CALL = "openCall"
    }
}
