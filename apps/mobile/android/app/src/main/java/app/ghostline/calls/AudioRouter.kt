package app.ghostline.calls

import android.Manifest
import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.telecom.CallControlResult
import androidx.core.telecom.CallEndpointCompat
import app.ghostline.GhostlinePlugin
import app.ghostline.push.PushNotifier
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Where the call's sound goes (T-087, ADR-0022): one interface over two sources. The call's Telecom entry
 * reports its endpoints and takes a request to change them ([TelecomBridge] feeds the `onTelecom…`
 * functions); when Telecom refused the call, [AudioFallback] does the same through `AudioManager`.
 * Every change of the list or the current route is published to the page as an `audioRoutes` event.
 *
 * The router picks a route when the call starts and when the device list changes ([pickRoute]); a route the
 * user chose with [select] is not overridden while that device is connected.
 */
object AudioRouter {
    private class TelecomLeg(val request: suspend (CallEndpointCompat) -> CallControlResult) {
        var current: CallEndpointCompat? = null
        var available: List<CallEndpointCompat> = emptyList()
    }

    private class Session(val callId: String, val video: Boolean) {
        var userChoice: AudioRoute? = null
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val main = Handler(Looper.getMainLooper())
    private val legs = HashMap<String, TelecomLeg>()
    private val telecomFailed = HashSet<String>()
    private val published = MutableStateFlow(AudioRoutes.NONE)

    private var app: Context? = null
    private var session: Session? = null
    private var fallback: AudioFallback? = null
    private var bluetoothAsked = false

    /** The routes the page was last told about; [OngoingCallService] watches the current one for the proximity lock. */
    val routes: StateFlow<AudioRoutes> = published

    /** A call the page reported is on its way: from here its sound is ours to route. Idempotent per call. */
    @Synchronized
    fun begin(context: Context, callId: String, video: Boolean) {
        if (session?.callId == callId) return
        end()
        app = context.applicationContext
        telecomFailed.retainAll { it == callId }
        session = Session(callId, video)
        setVolumeKeys(true)
        if (callId in telecomFailed) startFallback()
        reconcile()
        publish()
    }

    @Synchronized
    fun end() {
        val ended = session ?: return
        session = null
        telecomFailed.remove(ended.callId)
        fallback?.stop()
        fallback = null
        setVolumeKeys(false)
        publish()
    }

    @Synchronized
    fun snapshot(): AudioRoutes = published.value

    /** The user's pick. `false` when that route is not connected right now. */
    @Synchronized
    fun select(route: AudioRoute): Boolean {
        val s = session ?: return false
        if (visible().none { it.route == route }) return false
        s.userChoice = route
        val done = request(route)
        publish()
        return done
    }

    @Synchronized
    fun onTelecomAttached(callId: String, request: suspend (CallEndpointCompat) -> CallControlResult) {
        legs[callId] = TelecomLeg(request)
    }

    @Synchronized
    fun onTelecomDetached(callId: String) {
        legs.remove(callId)
        if (session?.callId == callId) publish()
    }

    /** `addCall` failed: the call goes on, with `AudioManager` doing the routing. */
    @Synchronized
    fun onTelecomFailed(callId: String) {
        telecomFailed.add(callId)
        if (session?.callId == callId) {
            startFallback()
            reconcile()
            publish()
        }
    }

    @Synchronized
    fun onTelecomCurrent(callId: String, endpoint: CallEndpointCompat) {
        legs[callId]?.current = endpoint
        if (session?.callId == callId) publish()
    }

    @Synchronized
    fun onTelecomAvailable(callId: String, endpoints: List<CallEndpointCompat>) {
        legs[callId]?.available = endpoints
        if (session?.callId == callId) {
            reconcile()
            publish()
        }
    }

    private fun startFallback() {
        val context = app ?: return
        val callId = session?.callId ?: return
        if (fallback != null) return
        askForBluetoothIfNeeded()
        fallback = AudioFallback(
            context,
            onDevices = {
                synchronized(this) {
                    reconcile()
                    publish()
                }
            },
            onRoute = { synchronized(this) { publish() } },
            onFocusLoss = { lost -> CallSession.onSystemHold(context, callId, lost) },
        ).also { it.start() }
    }

    private fun rawOptions(): List<RouteOption> {
        val s = session ?: return emptyList()
        val leg = legs[s.callId]
        if (leg != null) {
            return leg.available.mapNotNull { endpoint ->
                routeOfEndpointType(endpoint.type)?.let { RouteOption(it, externalName(it, endpoint.name.toString())) }
            }
        }
        return fallback?.options().orEmpty()
    }

    private fun rawCurrent(): AudioRoute? {
        val s = session ?: return null
        val leg = legs[s.callId]
        if (leg != null) return leg.current?.let { routeOfEndpointType(it.type) }
        return fallback?.current()
    }

    private fun visible(): List<RouteOption> = visibleRoutes(rawOptions(), null, bluetoothAllowed()).available

    // Telecom lists and names its Bluetooth endpoints itself; the permission matters to the AudioManager path only.
    private fun bluetoothAllowed(): Boolean {
        val s = session ?: return false
        return legs.containsKey(s.callId) || app?.let(AudioFallback::bluetoothGranted) ?: false
    }

    // Built-in outputs are labelled by the page; only a headset's own name is worth showing.
    private fun externalName(route: AudioRoute, name: String) =
        if (route == AudioRoute.Bluetooth || route == AudioRoute.Wired) name else ""

    /** Moves the sound to what [pickRoute] wants, if it is not there already. */
    private fun reconcile() {
        val s = session ?: return
        val decision = decideRoute(s.video, visible().map { it.route }, s.userChoice, rawCurrent())
        s.userChoice = decision.userChoice
        decision.request?.let(::request)
    }

    private fun request(route: AudioRoute): Boolean {
        val s = session ?: return false
        val leg = legs[s.callId]
        if (leg == null) return fallback?.select(route) ?: false
        val endpoint = leg.available.firstOrNull { routeOfEndpointType(it.type) == route } ?: return false
        scope.launch {
            try {
                val result = leg.request(endpoint)
                if (result is CallControlResult.Error) Log.i(PushNotifier.LOG_TAG, "Telecom refused the route: ${result.errorCode}")
            } catch (e: Exception) {
                Log.i(PushNotifier.LOG_TAG, "audio route request failed: ${e.javaClass.simpleName}")
            }
        }
        return true
    }

    private fun publish() {
        val next = if (session == null) AudioRoutes.NONE else visibleRoutes(rawOptions(), rawCurrent(), bluetoothAllowed())
        if (next == published.value) return
        published.value = next
        GhostlinePlugin.instance?.emitAudioRoutes(next.toJson())
    }

    // The volume keys of a call change the call's volume, not the ringtone's.
    private fun setVolumeKeys(inCall: Boolean) {
        val activity = GhostlinePlugin.instance?.activity ?: return
        activity.runOnUiThread {
            activity.volumeControlStream = if (inCall) AudioManager.STREAM_VOICE_CALL else AudioManager.USE_DEFAULT_STREAM_TYPE
        }
    }

    /** Fallback only, Android 12+: without BLUETOOTH_CONNECT a headset can't be used or named, so ask — once, and only if one is around. */
    private fun askForBluetoothIfNeeded() {
        val context = app ?: return
        val audio = context.getSystemService(AudioManager::class.java)
        val headsetAround = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { isBluetoothDeviceType(it.type) }
        if (!shouldAskBluetoothPermission(Build.VERSION.SDK_INT, AudioFallback.bluetoothGranted(context), headsetAround, bluetoothAsked)) return
        val activity = GhostlinePlugin.instance?.activity as? ComponentActivity ?: return
        bluetoothAsked = true
        main.post {
            var launcher: ActivityResultLauncher<String>? = null
            launcher = activity.activityResultRegistry.register(
                "ghostline-bluetooth-${System.nanoTime()}",
                ActivityResultContracts.RequestPermission(),
            ) {
                launcher?.unregister()
                synchronized(this) {
                    reconcile()
                    publish()
                }
            }
            launcher.launch(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }
}

/** The `NativeAudioRoutes` wire object. */
fun AudioRoutes.toJson(): JSObject {
    val list = JSArray()
    for (option in available) list.put(JSObject().put("route", option.route.wire).put("name", option.name))
    return JSObject().put("current", current?.wire ?: JSObject.NULL).put("available", list)
}
