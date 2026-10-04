package app.ghostline.calls

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.ghostline.R
import app.ghostline.push.PushNotifier

/** Why a ring ended, which decides what happens to the call's Telecom entry. */
enum class RingEnd(val telecomCause: Int?) {
    /** The user picked up: the call lives on, so does its Telecom entry (see [CallSession.watchAnswer]). */
    Answered(null),
    Declined(DisconnectCause.REJECTED),

    /** `call:closed` / `call:missed`: the other side hung up, or someone else answered. */
    Closed(DisconnectCause.REMOTE),
    ;
}

/**
 * Foreground service (`phoneCall`) for the ringing phase of an incoming call: the CallStyle
 * notification with a full-screen intent to [IncomingCallActivity], the ringtone ([Ringer]) and a
 * local 45 s timeout. It lives only while the call rings; a picked-up call goes on in the page, with
 * [OngoingCallService] and the Telecom entry (registered here, see [TelecomBridge]) following its state.
 */
class IncomingCallService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var call: IncomingCall? = null
    private var notification: Notification? = null
    private var lastStartId = 0
    private var screenOffRegistered = false
    private val timeout = Runnable {
        call?.let { TelecomBridge.end(it.callId, DisconnectCause.MISSED) }
        finishCall()
    }

    // The power button silences the ringer; the screen and the call stay.
    private val screenOff = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = Ringer.stop()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        // Without the full-screen intent the screen may go off by timeout rather than the power
        // button, and silencing then would mute a call nobody has seen yet.
        val fullScreenAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
        if (fullScreenAllowed) {
            ContextCompat.registerReceiver(
                this, screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            screenOffRegistered = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // stopSelf(lastStartId) is a no-op while a newer start is queued, so ending call X can't
        // kill the service right before call Y's startForeground.
        lastStartId = startId
        if (intent?.action == ACTION_STOP) {
            // Only the call that is ringing: a stale "closed" for an older call must not end this one.
            if (call == null || intent.getStringExtra(EXTRA_STOP_CALL_ID) == call?.callId) finishCall()
        } else {
            val incoming = intent?.let(IncomingCall::from)
            if (incoming == null) {
                // Started by startForegroundService, so it still owes a startForeground.
                enterForeground(stubNotification())
                finishCall()
            } else {
                begin(incoming, intent.getLongExtra(EXTRA_CREATED_AT, 0L))
            }
        }
        return START_NOT_STICKY
    }

    private fun begin(incoming: IncomingCall, createdAtMs: Long) {
        if (call?.callId == incoming.callId) {
            // A duplicate push: keep ringing, but this start request still owes a startForeground.
            pendingCallId = null
            notification?.let { enterForeground(it) }
            return
        }
        resetRinging()
        val remainingMs = remainingRingMs(System.currentTimeMillis(), createdAtMs).coerceAtLeast(1)
        val built = buildNotification(incoming, remainingMs)
        if (!canShowCall()) {
            // Nothing to see or decline with: ringing would be a sound from nowhere.
            Log.w(PushNotifier.LOG_TAG, "incoming call notifications are off, not ringing")
            enterForeground(built)
            finishCall()
            return
        }
        call = incoming
        notification = built
        if (!incoming.isTest) {
            TelecomBridge.registerIncoming(this, incoming.callId, incoming.chatId, incoming.callerName, incoming.video)
        }
        // Published first: the full-screen activity launched by the notification closes itself
        // when the state no longer names its call.
        IncomingCallState.set(incoming)
        pendingCallId = null
        if (!enterForeground(built)) {
            postWithoutForeground(incoming, built, remainingMs)
            return
        }
        Ringer.start(this)
        handler.postDelayed(timeout, remainingMs)
    }

    private fun canShowCall(): Boolean {
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return false
        val channel = getSystemService(NotificationManager::class.java)
            .getNotificationChannel(PushNotifier.CHANNEL_INCOMING_CALLS)
        return channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    /**
     * The system refused a foreground service: show the call as a plain notification (no ring, but
     * the user sees it and can answer or decline), kept until it times out or is acted on.
     */
    private fun postWithoutForeground(incoming: IncomingCall, built: Notification, remainingMs: Long) {
        try {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, built)
        } catch (e: SecurityException) {
            Log.w(PushNotifier.LOG_TAG, "notification not permitted", e)
        }
        handler.removeCallbacks(timeout)
        call = null
        notification = null
        fallbackCallId = incoming.callId
        MAIN.postDelayed({
            if (fallbackCallId == incoming.callId) TelecomBridge.end(incoming.callId, DisconnectCause.MISSED)
            clearFallback(incoming.callId)
        }, remainingMs)
        stopSelf(lastStartId)
    }

    private fun enterForeground(built: Notification): Boolean = try {
        ServiceCompat.startForeground(this, NOTIFICATION_ID, built, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
        true
    } catch (e: IllegalStateException) {
        // ForegroundServiceStartNotAllowedException (API 31+) is one; the push was not high enough priority.
        Log.w(PushNotifier.LOG_TAG, "incoming call service could not start in the foreground", e)
        false
    } catch (e: SecurityException) {
        Log.w(PushNotifier.LOG_TAG, "incoming call service lacks a permission", e)
        false
    }

    private fun stubNotification(): Notification {
        PushNotifier.ensureCallChannels(this)
        return NotificationCompat.Builder(this, PushNotifier.CHANNEL_INCOMING_CALLS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentText("Ghostline")
            .build()
    }

    private fun buildNotification(incoming: IncomingCall, remainingMs: Long): Notification {
        PushNotifier.ensureCallChannels(this)
        val person = Person.Builder().setName(incoming.callerName).setImportant(true).build()
        val screen = PendingIntent.getActivity(
            this, 0, incoming.putInto(Intent(this, IncomingCallActivity::class.java)), PENDING_FLAGS,
        )
        val decline = PendingIntent.getBroadcast(
            this, 0, CallActionReceiver.intent(this, CallActionReceiver.ACTION_DECLINE, incoming), PENDING_FLAGS,
        )
        // An activity, not a broadcast: answering opens the app, and Android 12+ blocks that from
        // a receiver a notification tap started. The screen does the answering itself.
        val answer = PendingIntent.getActivity(
            this,
            1,
            incoming.putInto(Intent(this, IncomingCallActivity::class.java)).setAction(IncomingCallActivity.ACTION_ANSWER),
            PENDING_FLAGS,
        )
        return NotificationCompat.Builder(this, PushNotifier.CHANNEL_INCOMING_CALLS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentText(callSubtitle(incoming.video))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer).setIsVideo(incoming.video))
            .setContentIntent(screen)
            .setFullScreenIntent(screen, true)
            .setTimeoutAfter(remainingMs)
            .build()
    }

    /** Ringer, timer and state of the current call; the service itself keeps running. */
    private fun resetRinging() {
        handler.removeCallbacks(timeout)
        Ringer.stop()
        IncomingCallState.set(null)
    }

    private fun finishCall() {
        resetRinging()
        call = null
        notification = null
        pendingCallId = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf(lastStartId)
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        Ringer.stop()
        // A call posted without foreground (see postWithoutForeground) outlives the service.
        if (call != null) IncomingCallState.set(null)
        if (screenOffRegistered) unregisterReceiver(screenOff)
        super.onDestroy()
    }

    companion object {
        private const val NOTIFICATION_ID = 8501
        private const val ACTION_STOP = "app.ghostline.action.STOP_INCOMING_CALL"
        private const val EXTRA_STOP_CALL_ID = "stopCallId"
        private const val EXTRA_CREATED_AT = "createdAt"
        private const val PENDING_FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        /** Set between [start] and the service publishing the call, so [stopFor] can reach a call that isn't up yet. */
        @Volatile
        private var pendingCallId: String? = null

        /** A call shown as a plain notification because no foreground service could start. */
        @Volatile
        private var fallbackCallId: String? = null

        private val MAIN = Handler(Looper.getMainLooper())
        private val recentlyClosed = RecentlyClosed()

        /** Calls answered on this phone: their own `answered-elsewhere` push is not a reason to end them. */
        private val recentlyAnswered = RecentlyClosed()

        fun callSubtitle(video: Boolean) = if (video) "Видеозвонок Ghostline" else "Аудиозвонок Ghostline"

        fun start(
            context: Context,
            callId: String,
            chatId: String,
            callerName: String,
            callerAvatarUrl: String?,
            video: Boolean,
            declineToken: String,
            createdAtMs: Long,
            isTest: Boolean = false,
        ) {
            val now = System.currentTimeMillis()
            if (remainingRingMs(now, createdAtMs) <= 0) {
                Log.i(PushNotifier.LOG_TAG, "incoming call already over, not ringing")
                return
            }
            if (!isTest && recentlyClosed.contains(callId, now)) {
                Log.i(PushNotifier.LOG_TAG, "incoming call was closed before its push arrived, not ringing")
                return
            }
            val intent = IncomingCall(callId, chatId, callerName, callerAvatarUrl, video, declineToken, isTest)
                .putInto(Intent(context, IncomingCallService::class.java))
                .putExtra(EXTRA_CREATED_AT, createdAtMs)
            pendingCallId = callId
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: IllegalStateException) {
                // ForegroundServiceStartNotAllowedException: the system won't let this push start a service.
                pendingCallId = null
                Log.w(PushNotifier.LOG_TAG, "incoming call service not allowed to start", e)
            }
        }

        /**
         * Ends the ring for [callId] ([end] says why); a no-op if it isn't ringing. Unless the call was
         * [RingEnd.Answered] — then it goes on — this also ends its Telecom entry and ongoing notification,
         * but only per [shouldEndCallOnClose]: our own answer comes back as `answered-elsewhere`.
         */
        fun stopFor(context: Context, callId: String, end: RingEnd = RingEnd.Closed, answeredElsewhere: Boolean = false) {
            val now = System.currentTimeMillis()
            recentlyClosed.add(callId, now)
            val ringingHere = (IncomingCallState.call.value?.callId == callId || pendingCallId == callId ||
                fallbackCallId == callId) && !recentlyAnswered.contains(callId, now)
            if (end == RingEnd.Answered) {
                recentlyAnswered.add(callId, now)
                CallSession.watchAnswer(callId, now)
            } else if (shouldEndCallOnClose(ringingHere, answeredElsewhere)) {
                end.telecomCause?.let { TelecomBridge.end(callId, it) }
                CallSession.onClosed(context, callId)
            }
            if (fallbackCallId == callId) {
                NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
                clearFallback(callId)
                return
            }
            if (IncomingCallState.call.value?.callId != callId && pendingCallId != callId) return
            val intent = Intent(context, IncomingCallService::class.java)
                .setAction(ACTION_STOP)
                .putExtra(EXTRA_STOP_CALL_ID, callId)
            try {
                context.startService(intent)
            } catch (e: IllegalStateException) {
                Log.w(PushNotifier.LOG_TAG, "could not stop the incoming call service", e)
            }
        }

        private fun clearFallback(callId: String) {
            if (fallbackCallId != callId) return
            fallbackCallId = null
            if (IncomingCallState.call.value?.callId == callId) IncomingCallState.set(null)
        }
    }
}
