package app.ghostline

import android.content.Intent
import android.net.Uri
import android.os.Bundle
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
    }

    override fun onStart() {
        super.onStart()
        AppVisibility.foreground = true
    }

    override fun onStop() {
        AppVisibility.foreground = false
        super.onStop()
    }
}
