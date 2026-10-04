package app.ghostline.calls

import android.media.AudioDeviceInfo
import android.os.Build
import androidx.core.telecom.CallEndpointCompat

/** `NativeAudioRoute` in `apps/frontend/src/shared/native/ghostline-plugin.ts`. */
enum class AudioRoute(val wire: String) {
    Earpiece("earpiece"),
    Speaker("speaker"),
    Bluetooth("bluetooth"),
    Wired("wired"),
    ;

    companion object {
        fun parse(wire: String?): AudioRoute? = entries.firstOrNull { it.wire == wire }
    }
}

/** One entry of the route list; [name] is the device's own name for Bluetooth/wired. */
data class RouteOption(val route: AudioRoute, val name: String)

/** `NativeAudioRoutes` in `ghostline-plugin.ts`. */
data class AudioRoutes(val current: AudioRoute?, val available: List<RouteOption>) {
    companion object {
        val NONE = AudioRoutes(null, emptyList())
    }
}

/** A Telecom endpoint's route; `null` for the ones a phone call can't use (streaming, unknown). */
fun routeOfEndpointType(type: Int): AudioRoute? = when (type) {
    CallEndpointCompat.TYPE_EARPIECE -> AudioRoute.Earpiece
    CallEndpointCompat.TYPE_SPEAKER -> AudioRoute.Speaker
    CallEndpointCompat.TYPE_BLUETOOTH -> AudioRoute.Bluetooth
    CallEndpointCompat.TYPE_WIRED_HEADSET -> AudioRoute.Wired
    else -> null
}

/** An `AudioDeviceInfo` route; `null` for devices a call can't be routed to (A2DP, HDMI, telephony…). */
fun routeOfDeviceType(type: Int): AudioRoute? = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> AudioRoute.Earpiece
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> AudioRoute.Speaker
    AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET -> AudioRoute.Wired
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_HEARING_AID -> AudioRoute.Bluetooth
    else -> null
}

/** Any Bluetooth output, A2DP included: it tells that a headset is around even when it can't carry a call yet. */
fun isBluetoothDeviceType(type: Int): Boolean = routeOfDeviceType(type) == AudioRoute.Bluetooth ||
    type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP

/**
 * Where a call's sound should go: the user's own pick while that device is still there, else a connected
 * wired or Bluetooth headset, else the speaker for video and the earpiece for audio. `null` when nothing usable.
 */
fun pickRoute(video: Boolean, available: Collection<AudioRoute>, userChoice: AudioRoute?): AudioRoute? = when {
    userChoice != null && userChoice in available -> userChoice
    AudioRoute.Wired in available -> AudioRoute.Wired
    AudioRoute.Bluetooth in available -> AudioRoute.Bluetooth
    video && AudioRoute.Speaker in available -> AudioRoute.Speaker
    AudioRoute.Earpiece in available -> AudioRoute.Earpiece
    AudioRoute.Speaker in available -> AudioRoute.Speaker
    else -> null
}

/**
 * What the page is shown: one entry per route (two paired headsets are one "Bluetooth"), Bluetooth only
 * when [bluetoothAllowed] (Android 12+ needs `BLUETOOTH_CONNECT` to use and name them), and no `current`
 * that isn't in the list.
 */
fun visibleRoutes(options: List<RouteOption>, current: AudioRoute?, bluetoothAllowed: Boolean): AudioRoutes {
    val shown = options
        .filter { bluetoothAllowed || it.route != AudioRoute.Bluetooth }
        .distinctBy { it.route }
        .sortedBy { it.route.ordinal }
    return AudioRoutes(current?.takeIf { route -> shown.any { it.route == route } }, shown)
}

/** The Bluetooth permission is a runtime one from Android 12; asked once, and only when a headset is actually around. */
fun shouldAskBluetoothPermission(sdk: Int, granted: Boolean, bluetoothDevicePresent: Boolean, alreadyAsked: Boolean): Boolean =
    sdk >= Build.VERSION_CODES.S && !granted && bluetoothDevicePresent && !alreadyAsked

/** The screen goes dark at the ear only for an audio call that is on its way or running, through the earpiece. */
fun shouldHoldProximity(state: NativeCallState?, route: AudioRoute?): Boolean =
    state != null && !state.video && route == AudioRoute.Earpiece &&
        (state.phase == CallPhase.Connecting || state.phase == CallPhase.Active)
