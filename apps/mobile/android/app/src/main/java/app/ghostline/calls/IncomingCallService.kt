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
import app.ghostline.AppVisibility
import app.ghostline.GhostlinePlugin
import app.ghostline.MainActivity
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
 *
 * It runs for every incoming call, on screen or not (T-094), in one of two [RingMode]s. [RingMode.Quiet]
 * (app on screen): the CallStyle entry on the low-importance `incoming_calls_quiet` channel, no full-screen
 * intent, no ringer, no Telecom entry — the page rings itself. [RingMode.Loud]: the full treatment. The mode
 * follows [AppVisibility] for as long as the call rings ([reevaluateMode], [ringChange]); the service
 * is already a foreground service when the app leaves the screen, so no new foreground start is needed.
 */
class IncomingCallService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var call: IncomingCall? = null
    private var notification: Notification? = null
    private var lastStartId = 0
    private var mode = RingMode.Loud
    private var createdAtMs = 0L
    private var graceUntilMs = 0L
    private val recheck = Runnable { reevaluateMode() }
    private val visibilityListener: () -> Unit = { handler.post { reevaluateMode() } }
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
        AppVisibility.onChanged = visibilityListener
        running = this
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
            // A duplicate: keep ringing, but this start request still owes a startForeground.
            pendingCallId = null
            val current = call
            if (current != null && adoptsDeclineToken(current.declineToken, incoming.declineToken)) {
                // The page started this call without a token; now the push brought one, so "Отклонить" can go
                // straight to the server. Same ring, same mode: only the notification's buttons are rebuilt.
                val withToken = current.copy(declineToken = incoming.declineToken)
                call = withToken
                val remaining = remainingRingMs(System.currentTimeMillis(), this.createdAtMs).coerceAtLeast(1)
                notification = buildNotification(withToken, remaining, mode)
                IncomingCallState.set(withToken)
            }
            notification?.let { enterForeground(it) }
            return
        }
        resetRinging()
        val remainingMs = remainingRingMs(System.currentTimeMillis(), createdAtMs).coerceAtLeast(1)
        this.createdAtMs = createdAtMs
        // The push usually beats the page's own socket event: give the page a moment before native gives up ringing.
        graceUntilMs = System.currentTimeMillis() + PAGE_GRACE_MS
        mode = ringModeFor(AppVisibility.foreground, incoming.isTest, pageRings(incoming.callId))
        handler.postDelayed(recheck, PAGE_GRACE_MS + 50)
        val built = buildNotification(incoming, remainingMs, mode)
        if (!canShowCall(mode)) {
            // Nothing to see or decline with: ringing would be a sound from nowhere.
            Log.w(PushNotifier.LOG_TAG, "incoming call notifications are off, not ringing")
            enterForeground(built)
            finishCall()
            return
        }
        call = incoming
        notification = built
        // A quiet call has no Telecom entry yet: with the page ringing, a ringing entry would only make the
        // system think a call is being offered. It is registered on escalation, or by CallSession when answered.
        if (mode == RingMode.Loud) registerTelecom(incoming)
        // Published first: the full-screen activity launched by the notification closes itself
        // when the state no longer names its call.
        IncomingCallState.set(incoming)
        pendingCallId = null
        if (!enterForeground(built)) {
            postWithoutForeground(incoming, built, remainingMs)
            return
        }
        if (mode == RingMode.Loud) Ringer.start(this)
        handler.postDelayed(timeout, remainingMs)
    }

    private fun registerTelecom(incoming: IncomingCall) {
        if (!incoming.isTest) {
            TelecomBridge.registerIncoming(this, incoming.callId, incoming.chatId, incoming.callerName, incoming.video)
        }
    }

    /**
     * The app left the screen (escalate: loud channel + full-screen intent + ringer for what is left of the
     * window) or came back (quieten: low channel, ringer off). The notification is updated in place through
     * `startForeground` on the running service — a fresh foreground start from the background is not needed,
     * and not allowed on Android 12+.
     */
    private fun reevaluateMode() {
        val ringing = call ?: return
        val remainingMs = remainingRingMs(System.currentTimeMillis(), createdAtMs)
        val target = ringModeFor(AppVisibility.foreground, ringing.isTest, pageRings(ringing.callId))
        when (val change = ringChange(mode, target, remainingMs)) {
            RingChange.None -> Unit
            is RingChange.Escalate -> {
                // The loud channel may be switched off by the user: then stay as we are, quiet.
                if (!canShowCall(RingMode.Loud)) return
                mode = RingMode.Loud
                registerTelecom(ringing)
                // Not alert-once: the entry exists already, and the update has to make noise and fire the intent.
                val built = buildNotification(ringing, change.remainingMs, mode, alertAgain = true)
                notification = built
                enterForeground(built)
                Ringer.start(this)
            }
            RingChange.Quieten -> {
                mode = RingMode.Quiet
                Ringer.stop()
                val built = buildNotification(ringing, remainingMs.coerceAtLeast(1), mode)
                notification = built
                enterForeground(built)
            }
        }
    }

    /** The page shows this call (it reported `incoming` for it) or, right after the push, has not had its grace yet. */
    private fun pageRings(callId: String): Boolean {
        val reported = CallSession.current()?.let { it.callId == callId && it.phase == CallPhase.Incoming } == true
        return pageShowsCall(reported, System.currentTimeMillis(), graceUntilMs)
    }

    private fun canShowCall(mode: RingMode): Boolean {
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return false
        val channel = getSystemService(NotificationManager::class.java).getNotificationChannel(channelFor(mode))
        return channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    private fun channelFor(mode: RingMode) =
        if (mode == RingMode.Loud) PushNotifier.CHANNEL_INCOMING_CALLS else PushNotifier.CHANNEL_INCOMING_CALLS_QUIET

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

    private fun buildNotification(
        incoming: IncomingCall,
        remainingMs: Long,
        mode: RingMode,
        alertAgain: Boolean = false,
    ): Notification {
        PushNotifier.ensureCallChannels(this)
        val loud = mode == RingMode.Loud
        val person = Person.Builder().setName(incoming.callerName).setImportant(true).build()
        val screen = PendingIntent.getActivity(
            this, 0, incoming.putInto(Intent(this, IncomingCallActivity::class.java)), PENDING_FLAGS,
        )
        val decline = PendingIntent.getBroadcast(
            this, 0, CallActionReceiver.intent(this, CallActionReceiver.ACTION_DECLINE, incoming), PENDING_FLAGS,
        )
        // An activity, not a broadcast: answering opens the app, and Android 12+ blocks that from
        // a receiver a notification tap started. Loud: the call screen does the answering itself. Quiet: the
        // app is on screen, so the answer goes straight to MainActivity (the page picks it up as `answer`) and
        // the ring ends when the page reports the call as connecting.
        val answer = if (loud) {
            PendingIntent.getActivity(
                this,
                1,
                incoming.putInto(Intent(this, IncomingCallActivity::class.java)).setAction(IncomingCallActivity.ACTION_ANSWER),
                PENDING_FLAGS,
            )
        } else {
            PendingIntent.getActivity(
                this,
                2,
                LaunchAction.Answer(incoming.callId, incoming.chatId, incoming.video)
                    .putInto(Intent(this, MainActivity::class.java)),
                PENDING_FLAGS,
            )
        }
        val builder = NotificationCompat.Builder(this, channelFor(mode))
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentText(callSubtitle(incoming.video))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(if (loud) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(!alertAgain)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer).setIsVideo(incoming.video))
            .setTimeoutAfter(remainingMs)
        if (loud) {
            builder.setContentIntent(screen).setFullScreenIntent(screen, true)
        } else {
            builder.setContentIntent(PushNotifier.openIntent(this, incoming.chatId))
        }
        return builder.build()
    }

    /** Ringer, timer and state of the current call; the service itself keeps running. */
    private fun resetRinging() {
        handler.removeCallbacks(timeout)
        handler.removeCallbacks(recheck)
        Ringer.stop()
        IncomingCallState.set(null)
    }

    private fun finishCall() {
        resetRinging()
        call = null
        notification = null
        pendingCallId = null
        mode = RingMode.Loud
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf(lastStartId)
    }

    override fun onDestroy() {
        if (AppVisibility.onChanged === visibilityListener) AppVisibility.onChanged = null
        if (running === this) running = null
        handler.removeCallbacks(timeout)
        handler.removeCallbacks(recheck)
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

        /** The live service, so the page's `incoming` report can make it re-check its mode (T-094). */
        @Volatile
        private var running: IncomingCallService? = null

        /** The page reported the call (`incoming`): if the app is on screen, native may now go quiet. */
        fun onPageReportedIncoming() {
            val service = running ?: return
            service.handler.post { service.reevaluateMode() }
        }
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
            if (!isTest && (recentlyClosed.contains(callId, now) || recentlyAnswered.contains(callId, now))) {
                Log.i(PushNotifier.LOG_TAG, "incoming call was closed before its push arrived, not ringing")
                return
            }
            // The push and the page's state both start a call; whichever comes second is the same call.
            if (isDuplicateStart(isRinging(callId), declineToken)) return
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

        /** The call is up, on its way up, or shown as a plain notification. */
        fun isRinging(callId: String): Boolean =
            IncomingCallState.call.value?.callId == callId || pendingCallId == callId || fallbackCallId == callId

        /**
         * The page reported an `incoming` call (T-094), for when the push is late or never came. There is no
         * `declineToken` on this road, so "Отклонить" is handed to the page (`decline` command). An older page
         * sends no `createdAt`: without it the ring window is unknown, so native stays out.
         */
        fun startFromPage(context: Context, state: NativeCallState) {
            val createdAt = state.createdAt ?: return
            start(
                context,
                state.callId,
                state.chatId,
                state.peerName,
                state.callerAvatarUrl,
                state.video,
                declineToken = "",
                createdAtMs = createdAt,
            )
        }

        /**
         * Answers the ringing call [callId] natively, from the call screen or the system (a headset button,
         * through Telecom): the ring stops and the page gets the answer. A listening page is told directly and the app
         * is only brought up; without one the action waits in [LaunchActionStore] and rides the intent, so a
         * background start the system refuses still leaves the answer for the page that opens later
         * ([planAnswer]). [openPage] is false for the test call, which has no page to open.
         */
        fun answer(context: Context, callId: String, chatId: String, video: Boolean, openPage: Boolean = true) {
            stopFor(context, callId, RingEnd.Answered)
            if (!openPage) return
            val action = LaunchAction.Answer(callId, chatId, video)
            val plan = planAnswer(GhostlinePlugin.instance?.emitCommand(action.toJson()) ?: false)
            if (plan.keepInStore) LaunchActionStore.shared.put(action, System.currentTimeMillis())
            val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(
                    if (plan.carryAction) action.putInto(intent) else intent.putExtra(MainActivity.EXTRA_OPEN_CALL, true),
                )
            } catch (e: RuntimeException) {
                Log.w(PushNotifier.LOG_TAG, "could not open the app for an answered call", e)
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
            val ringingHere = isRinging(callId) && !recentlyAnswered.contains(callId, now)
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
