package app.ghostline

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.Rational
import android.webkit.CookieManager
import app.ghostline.calls.CallCommand
import app.ghostline.calls.CallSession
import app.ghostline.calls.LaunchAction
import app.ghostline.calls.LaunchActionStore
import app.ghostline.calls.NativeCallState
import app.ghostline.calls.OngoingCallActionReceiver
import app.ghostline.calls.PIP_ASPECT_HEIGHT
import app.ghostline.calls.PIP_ASPECT_WIDTH
import app.ghostline.calls.PipAction
import app.ghostline.calls.muteActionLabel
import app.ghostline.calls.pipActions
import app.ghostline.calls.endsCallOnPipClose
import app.ghostline.calls.pipAllowed
import app.ghostline.push.PushNotifier
import androidx.lifecycle.Lifecycle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    /** What the page was last told through `pipModeChanged`. */
    private var pipActive = false

    private val pipSupported by lazy { packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) }

    private val pipListener: (NativeCallState?) -> Unit = ::updatePip

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
        // The call may have changed while the activity was gone (and the hook was cleared).
        CallSession.stateListener = pipListener
        updatePip(CallSession.current())
    }

    override fun onDestroy() {
        // A newer activity may have taken the hook over already.
        if (CallSession.stateListener === pipListener) CallSession.stateListener = null
        super.onDestroy()
    }

    /**
     * Pre-12 has no auto-enter: leaving with Home or Recents during a video call is the cue. Android 12+
     * enters by itself from the params set in [updatePip].
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        val call = CallSession.current()
        if (!pipSupported || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
        if (pipAllowed(call) && !isInPictureInPictureMode) {
            try {
                enterPictureInPictureMode(pipParams(call))
            } catch (e: IllegalStateException) {
                Log.w(PushNotifier.LOG_TAG, "cannot enter picture-in-picture", e)
            }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // Only the PiP window on screen: the page is not in front, so a message push should show.
        AppVisibility.foreground = !isInPictureInPictureMode
        // Dismissing the window reports "left PiP" while the activity is already going down; expanding it
        // reports it with the activity on its way to resumed.
        val dismissed = !isInPictureInPictureMode && !lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        if (dismissed) endCallOfClosedPip()
        notifyPip(isInPictureInPictureMode)
    }

    /**
     * The task of a dismissed PiP window is removed, which destroys the activity (and the page's WebView/LiveKit
     * with it); the call can't go on, so it is ended through the page while the page still exists.
     */
    private fun endCallOfClosedPip() {
        val call = CallSession.current()
        if (!endsCallOnPipClose(wasInPip = pipActive, call)) return
        CallSession.sendCommand(this, CallCommand.Hangup)
    }

    private fun notifyPip(active: Boolean) {
        if (pipActive == active) return
        pipActive = active
        GhostlinePlugin.instance?.emitPipMode(active)
    }

    private fun updatePip(call: NativeCallState?) {
        if (isDestroyed || !pipSupported) return
        // The call ended with the window still up: don't leave an empty window behind.
        if (isInPictureInPictureMode && !pipAllowed(call)) {
            moveTaskToBack(false)
            return
        }
        try {
            setPictureInPictureParams(pipParams(call))
        } catch (e: IllegalStateException) {
            Log.w(PushNotifier.LOG_TAG, "cannot update picture-in-picture params", e)
        }
    }

    private fun pipParams(call: NativeCallState?): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(PIP_ASPECT_WIDTH, PIP_ASPECT_HEIGHT))
            .setActions(pipActions(call).map(::remoteAction))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(pipAllowed(call))
        return builder.build()
    }

    // The same receiver as the ongoing-call notification's buttons: the page gets `hangup`/`toggleMute`.
    private fun remoteAction(action: PipAction): RemoteAction {
        val (icon, title, broadcast, requestCode) = when (action) {
            PipAction.Mute -> PipButton(R.drawable.ic_mic, muteActionLabel(false), OngoingCallActionReceiver.ACTION_TOGGLE_MUTE, 11)
            PipAction.Unmute -> PipButton(R.drawable.ic_mic_off, muteActionLabel(true), OngoingCallActionReceiver.ACTION_TOGGLE_MUTE, 11)
            PipAction.Hangup -> PipButton(R.drawable.ic_call_decline, "Завершить", OngoingCallActionReceiver.ACTION_HANGUP, 10)
        }
        val intent = PendingIntent.getBroadcast(
            this,
            requestCode,
            OngoingCallActionReceiver.intent(this, broadcast),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return RemoteAction(Icon.createWithResource(this, icon), title, title, intent)
    }

    private data class PipButton(val icon: Int, val title: String, val broadcast: String, val requestCode: Int)

    override fun onPause() {
        // The WebView writes cookies to disk lazily; a swipe from Recents or an APK update right after a
        // token refresh would leave the previous refresh cookie on disk (ADR-0021).
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onStop() {
        // Closing the PiP window stops the activity without always reporting the mode change. The call goes on
        // (OngoingCallService holds it); the page only needs to leave its compact layout.
        if (!isInPictureInPictureMode) {
            if (pipActive) endCallOfClosedPip()
            notifyPip(false)
        }
        AppVisibility.foreground = false
        CookieManager.getInstance().flush()
        super.onStop()
    }

    companion object {
        /** Set by the ongoing-call notification's tap. */
        const val EXTRA_OPEN_CALL = "openCall"
    }
}
