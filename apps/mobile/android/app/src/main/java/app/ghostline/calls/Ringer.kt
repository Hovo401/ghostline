package app.ghostline.calls

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import app.ghostline.push.PushNotifier

sealed interface RingPolicy {
    data object Ring : RingPolicy
    data object VibrateOnly : RingPolicy
    data object Silent : RingPolicy
}

/** The system ringtone plus a repeating vibration, following the user's ringer mode and DND. */
object Ringer {
    private val VIBRATION_PATTERN = longArrayOf(0, 800, 800)
    private const val REPEAT_FROM_START = 0

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    /** Silent and DND win over everything; DND "priority only" and "alarms only" stay quiet too. */
    fun decide(ringerMode: Int, dndFilter: Int): RingPolicy = when {
        ringerMode == AudioManager.RINGER_MODE_SILENT -> RingPolicy.Silent
        ringerMode == AudioManager.RINGER_MODE_VIBRATE -> RingPolicy.VibrateOnly
        dndFilter == NotificationManager.INTERRUPTION_FILTER_ALL -> RingPolicy.Ring
        else -> RingPolicy.Silent
    }

    fun start(context: Context) {
        stop()
        val audio = context.getSystemService(AudioManager::class.java)
        val dnd = context.getSystemService(NotificationManager::class.java)
        val policy = decide(audio.ringerMode, dnd.currentInterruptionFilter)
        if (policy == RingPolicy.Silent) return
        // "Vibrate" ringer mode: a buzz and no sound; normal mode gets both.
        startVibration(context)
        if (policy == RingPolicy.Ring) startSound(context)
    }

    /** Stops sound and vibration; the call itself (and its screen) goes on. */
    fun stop() {
        try {
            player?.run {
                if (isPlaying) stop()
                release()
            }
        } catch (e: IllegalStateException) {
            Log.w(PushNotifier.LOG_TAG, "ringer stop", e)
        }
        player = null
        vibrator?.cancel()
        vibrator = null
    }

    private fun startSound(context: Context) {
        try {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(context, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.w(PushNotifier.LOG_TAG, "could not play the ringtone", e)
            player?.release()
            player = null
        }
    }

    @Suppress("DEPRECATION")
    private fun startVibration(context: Context) {
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            context.getSystemService(Vibrator::class.java)
        }
        if (!v.hasVibrator()) return
        val effect = VibrationEffect.createWaveform(VIBRATION_PATTERN, REPEAT_FROM_START)
        // Ringtone usage keeps the buzz going when the screen is off.
        v.vibrate(
            effect,
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build(),
        )
        vibrator = v
    }
}
