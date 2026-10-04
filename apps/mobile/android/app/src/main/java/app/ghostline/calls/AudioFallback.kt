package app.ghostline.calls

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import app.ghostline.push.PushNotifier

/**
 * Audio routing and hold detection for a call Telecom did not take (a GSM call is on, `addCall` refused):
 * the same job, done by hand with `AudioManager` (ADR-0022).
 *
 * While it lives the phone is in `MODE_IN_COMMUNICATION`, so the WebView's WebRTC audio goes where this
 * class points it; [stop] gives the mode back. Callbacks arrive on the main thread: [onDevices] when a
 * device was plugged in or out, [onRoute] when the system moved the sound, [onFocusLoss] with `true` when
 * another app (the dialer) took the audio focus and `false` when it gave it back.
 */
class AudioFallback(
    context: Context,
    private val onDevices: () -> Unit,
    private val onRoute: () -> Unit,
    private val onFocusLoss: (Boolean) -> Unit,
) {
    private val app = context.applicationContext
    private val audio = app.getSystemService(AudioManager::class.java)
    private val main = Handler(Looper.getMainLooper())

    // Before Android 12 there is no "communication device": what we set is what we remember.
    private var legacyRoute: AudioRoute? = null
    private var started = false

    private val devices = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = onDevices()

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = onDevices()
    }

    // Android 12+: the system (not only we) can move the call, e.g. a headset's own button. Created in start()
    // on those versions only (its class does not exist before) and kept as Any for the same reason.
    private var communicationDevice: Any? = null

    private val focusRequest: AudioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAcceptsDelayedFocusGain(true)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        .setOnAudioFocusChangeListener({ change ->
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> onFocusLoss(true)
                AudioManager.AUDIOFOCUS_GAIN -> onFocusLoss(false)
                // Taken for good: the call is as good as on hold. Asking again (delayed) gets it back when
                // the other app lets go, and that GAIN resumes the call.
                AudioManager.AUDIOFOCUS_LOSS -> {
                    onFocusLoss(true)
                    requestFocus()
                }
            }
        }, main)
        .build()

    // DELAYED is fine (the dialer has it and we'll hear GAIN); FAILED just means no hold detection.
    private fun requestFocus() {
        if (audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_FAILED) {
            Log.w(PushNotifier.LOG_TAG, "audio focus refused: a call on hold will not resume by itself")
        }
    }

    fun start() {
        if (started) return
        started = true
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        requestFocus()
        audio.registerAudioDeviceCallback(devices, main)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val listener = AudioManager.OnCommunicationDeviceChangedListener { onRoute() }
            communicationDevice = listener
            audio.addOnCommunicationDeviceChangedListener(ContextCompat.getMainExecutor(app), listener)
        }
    }

    fun stop() {
        if (!started) return
        started = false
        audio.unregisterAudioDeviceCallback(devices)
        audio.abandonAudioFocusRequest(focusRequest)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (communicationDevice as? AudioManager.OnCommunicationDeviceChangedListener)
                ?.let(audio::removeOnCommunicationDeviceChangedListener)
            communicationDevice = null
            audio.clearCommunicationDevice()
        } else {
            @Suppress("DEPRECATION")
            audio.isSpeakerphoneOn = false
            stopSco()
        }
        legacyRoute = null
        audio.mode = AudioManager.MODE_NORMAL
    }

    fun options(): List<RouteOption> = callDevices().mapNotNull { device ->
        routeOfDeviceType(device.type)?.let { route ->
            // The built-in outputs' product name is the phone model: the page labels those itself.
            val external = route == AudioRoute.Bluetooth || route == AudioRoute.Wired
            RouteOption(route, if (external) deviceName(device) else "")
        }
    }

    fun current(): AudioRoute? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return audio.communicationDevice?.let { routeOfDeviceType(it.type) }
        return legacyRoute ?: pickRoute(video = false, available = options().map { it.route }, userChoice = null)
    }

    /** `false` when no connected device offers [route]. */
    fun select(route: AudioRoute): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val device = callDevices().firstOrNull { routeOfDeviceType(it.type) == route } ?: return false
            return audio.setCommunicationDevice(device)
        }
        if (options().none { it.route == route }) return false
        @Suppress("DEPRECATION")
        when (route) {
            AudioRoute.Speaker -> {
                stopSco()
                audio.isSpeakerphoneOn = true
            }
            AudioRoute.Bluetooth -> {
                audio.isSpeakerphoneOn = false
                audio.startBluetoothSco()
                audio.isBluetoothScoOn = true
            }
            // The system sends the call to a plugged-in headset by itself once the speaker is off.
            AudioRoute.Earpiece, AudioRoute.Wired -> {
                stopSco()
                audio.isSpeakerphoneOn = false
            }
        }
        legacyRoute = route
        return true
    }

    private fun callDevices(): List<AudioDeviceInfo> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audio.availableCommunicationDevices
        } else {
            audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        }

    @Suppress("DEPRECATION")
    private fun stopSco() {
        if (audio.isBluetoothScoOn) {
            audio.isBluetoothScoOn = false
            audio.stopBluetoothSco()
        }
    }

    // `productName` of a Bluetooth device is only readable with BLUETOOTH_CONNECT on Android 12+.
    private fun deviceName(device: AudioDeviceInfo): String {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || bluetoothGranted(app)
        return if (allowed) device.productName?.toString().orEmpty() else ""
    }

    companion object {
        fun bluetoothGranted(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }
}
