package app.ghostline.calls

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.ghostline.MainActivity
import app.ghostline.R
import app.ghostline.push.PushNotifier

/**
 * Foreground service for a call in progress: keeps the process (and the WebView's microphone) alive in the
 * background and shows "Идёт звонок · <имя>" with a timer and the "Микрофон" / "Завершить" buttons. It
 * only mirrors [NativeCallState]; [CallSession] starts, refreshes and stops it.
 */
class OngoingCallService : Service() {
    private var lastStartId = 0
    private var inForeground = false
    private var foregroundTypes = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
    }

    override fun onDestroy() {
        running = false
        CallSession.onOngoingStopped()
        super.onDestroy()
    }

    // Swiped out of Recents: the page and its media are gone, so the call notification and Telecom entry go too.
    override fun onTaskRemoved(rootIntent: Intent?) {
        CallSession.reconcile(this, null)
        super.onTaskRemoved(rootIntent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // stopSelf(lastStartId) is a no-op while a newer start is queued, so a stop for the previous call
        // can't take down the next one.
        lastStartId = startId
        if (intent?.action == ACTION_STOP) {
            leave()
            return START_NOT_STICKY
        }
        val state = intent?.let(NativeCallState::from)
        if (state == null) {
            // Started by startForegroundService, so it still owes a startForeground.
            if (!inForeground) startForeground(stubNotification(), PHONE_CALL_ONLY)
            leave()
            return START_NOT_STICKY
        }
        show(state)
        return START_NOT_STICKY
    }

    private fun show(state: NativeCallState) {
        val types = ongoingForegroundTypes(
            sdk = Build.VERSION.SDK_INT,
            micGranted = granted(Manifest.permission.RECORD_AUDIO),
            cameraGranted = granted(Manifest.permission.CAMERA),
            video = state.video,
        )
        val built = buildNotification(state)
        // Every update would otherwise re-enter foreground with microphone/camera, which Android 14+ refuses
        // from the background: a plain notify keeps the running service as it is.
        if (inForeground && types == foregroundTypes) {
            notify(built)
            return
        }
        if (startForeground(built, types)) return
        // Without the microphone/camera type the notification and the hang-up still work.
        if (!inForeground && types != PHONE_CALL_ONLY && startForeground(built, PHONE_CALL_ONLY)) return
        if (inForeground) {
            notify(built)
            return
        }
        // The system refused outright: a plain notification (CallStyle needs a foreground service) and no service.
        notify(buildFallbackNotification(state))
        stopSelf(lastStartId)
    }

    private fun leave() {
        inForeground = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf(lastStartId)
    }

    private fun startForeground(built: Notification, types: Int): Boolean = try {
        ServiceCompat.startForeground(this, NOTIFICATION_ID, built, types)
        inForeground = true
        foregroundTypes = types
        true
    } catch (e: IllegalStateException) {
        // ForegroundServiceStartNotAllowedException (API 31+) is one.
        Log.w(PushNotifier.LOG_TAG, "ongoing call service could not start in the foreground", e)
        false
    } catch (e: SecurityException) {
        Log.w(PushNotifier.LOG_TAG, "ongoing call service lacks a permission", e)
        false
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun notify(built: Notification) {
        try {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, built)
        } catch (e: SecurityException) {
            Log.w(PushNotifier.LOG_TAG, "notification not permitted", e)
        } catch (e: IllegalArgumentException) {
            // CallStyle without a foreground service, on a system that checks.
            Log.w(PushNotifier.LOG_TAG, "notification rejected", e)
        }
    }

    private fun stubNotification(): Notification {
        PushNotifier.ensureCallChannels(this)
        return NotificationCompat.Builder(this, PushNotifier.CHANNEL_ONGOING_CALL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentText("Ghostline")
            .build()
    }

    /** Not a CallStyle (the system wants a foreground service behind those): title, timer and "Завершить". */
    private fun buildFallbackNotification(state: NativeCallState): Notification {
        PushNotifier.ensureCallChannels(this)
        val hangUp = PendingIntent.getBroadcast(
            this, 0, OngoingCallActionReceiver.intent(this, OngoingCallActionReceiver.ACTION_HANGUP), PENDING_FLAGS,
        )
        val builder = NotificationCompat.Builder(this, PushNotifier.CHANNEL_ONGOING_CALL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(ongoingTitle(state.phase, state.answeredAt, state.peerName))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openIntent())
            .addAction(0, "Завершить", hangUp)
        val answeredAt = state.answeredAt
        if (answeredAt != null) {
            builder.setUsesChronometer(true).setWhen(chronometerBase(answeredAt, System.currentTimeMillis())).setShowWhen(true)
        } else {
            builder.setShowWhen(false)
        }
        return builder.build()
    }

    private fun openIntent(): PendingIntent = PendingIntent.getActivity(
        this, 2, Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_CALL, true), PENDING_FLAGS,
    )

    private fun buildNotification(state: NativeCallState): Notification {
        PushNotifier.ensureCallChannels(this)
        val person = Person.Builder().setName(state.peerName.ifBlank { "Ghostline" }).setImportant(true).build()
        val hangUp = PendingIntent.getBroadcast(
            this, 0, OngoingCallActionReceiver.intent(this, OngoingCallActionReceiver.ACTION_HANGUP), PENDING_FLAGS,
        )
        val toggleMute = PendingIntent.getBroadcast(
            this, 1, OngoingCallActionReceiver.intent(this, OngoingCallActionReceiver.ACTION_TOGGLE_MUTE), PENDING_FLAGS,
        )
        val muteIcon = if (state.muted) R.drawable.ic_mic_off else R.drawable.ic_mic
        val builder = NotificationCompat.Builder(this, PushNotifier.CHANNEL_ONGOING_CALL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(ongoingTitle(state.phase, state.answeredAt, state.peerName))
            .setContentText(ongoingStatus(state.phase, state.answeredAt))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(person, hangUp).setIsVideo(state.video))
            .setContentIntent(openIntent())
            .addAction(muteIcon, muteActionLabel(state.muted), toggleMute)
        val answeredAt = state.answeredAt
        if (answeredAt != null) {
            builder.setUsesChronometer(true).setWhen(chronometerBase(answeredAt, System.currentTimeMillis())).setShowWhen(true)
        } else {
            builder.setShowWhen(false)
        }
        return builder.build()
    }

    companion object {
        private const val NOTIFICATION_ID = 8502
        private const val PHONE_CALL_ONLY = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL

        /** Set while an instance exists; [CallSession] uses it to tell a service that stopped itself from a live one. */
        @Volatile
        var running = false
            private set

        private const val ACTION_STOP = "app.ghostline.action.STOP_ONGOING_CALL"
        private const val PENDING_FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        /**
         * Starts the service for [state], or refreshes its notification when [running] (it is [CallSession]
         * that knows). Returns whether the request went through.
         */
        fun show(context: Context, state: NativeCallState, running: Boolean): Boolean {
            val intent = state.putInto(Intent(context, OngoingCallService::class.java))
            return try {
                if (running) context.startService(intent) else ContextCompat.startForegroundService(context, intent)
                true
            } catch (e: IllegalStateException) {
                // ForegroundServiceStartNotAllowedException, or a background start of a plain service.
                Log.w(PushNotifier.LOG_TAG, "ongoing call service not allowed to start", e)
                false
            }
        }

        /** Takes the notification down and stops the service (a stop request queues behind any start). */
        fun stop(context: Context) {
            try {
                context.startService(Intent(context, OngoingCallService::class.java).setAction(ACTION_STOP))
            } catch (e: IllegalStateException) {
                Log.w(PushNotifier.LOG_TAG, "could not stop the ongoing call service", e)
            }
            // The service may be gone already (the system refused it): its notification is not.
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        }
    }
}
