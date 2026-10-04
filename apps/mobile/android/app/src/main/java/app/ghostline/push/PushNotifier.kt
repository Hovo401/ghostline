package app.ghostline.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.ghostline.MainActivity
import app.ghostline.R
import app.ghostline.calls.IncomingCallService
import app.ghostline.calls.MissedCallNotifier
import app.ghostline.messages.MessageNotifier
import com.getcapacitor.CapConfig

/**
 * Routes a decrypted push to its notification. Messages are [MessageNotifier] (T-084); a ringing
 * call is [IncomingCallService] and a missed one [MissedCallNotifier] (T-085). Tags match the
 * web's (`chat:<id>`, `call:<id>`, see `sw-notifications.ts`), so a newer push replaces an older
 * one and `chat:read` can dismiss it.
 */
object PushNotifier {
    const val LOG_TAG = "GhostlinePush"
    const val CHANNEL_MESSAGES = "messages"
    const val CHANNEL_INCOMING_CALLS = "incoming_calls"
    const val CHANNEL_MISSED_CALLS = "missed_calls"
    private const val NOTIFICATION_ID = 0

    fun handle(context: Context, push: NativePush) {
        when (push) {
            is NativePush.Message -> MessageNotifier.show(context, push)
            is NativePush.CallIncoming -> IncomingCallService.start(
                context,
                push.callId,
                push.chatId,
                push.callerName,
                push.callerAvatarUrl,
                push.video,
                push.declineToken,
                push.createdAt,
            )
            is NativePush.CallClosed -> IncomingCallService.stopFor(context, push.callId)
            is NativePush.CallMissed -> {
                IncomingCallService.stopFor(context, push.callId)
                MissedCallNotifier.show(context, push.callId, push.chatId, push.callerName, push.video)
            }
            is NativePush.ChatRead -> MessageNotifier.onChatRead(context, push.chatId, push.readSeq)
            NativePush.Test -> show(context, "Ghostline", "Тестовое уведомление — push работает", "test", null)
            is NativePush.TestCall -> IncomingCallService.start(
                context,
                callId = "test",
                chatId = "",
                callerName = push.callerName,
                callerAvatarUrl = null,
                video = false,
                declineToken = "",
                createdAtMs = System.currentTimeMillis(),
                isTest = true,
            )
        }
    }

    private fun show(
        context: Context,
        title: String,
        body: String,
        tag: String,
        chatId: String?,
    ) {
        ensureChannel(context)
        val builder = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openIntent(context, chatId))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        try {
            NotificationManagerCompat.from(context).notify(tag, NOTIFICATION_ID, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted: nothing to show.
            Log.w(LOG_TAG, "notification not permitted", e)
        }
    }

    /** Opens the chat through the App Link path T-080a already handles (`/app?chat=<id>`). */
    fun openIntent(context: Context, chatId: String?): PendingIntent = PendingIntent.getActivity(
        context,
        (chatId ?: "").hashCode(),
        openChatIntent(context, chatId),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** The raw intent behind [openIntent]; a null or blank [chatId] just opens the app. */
    fun openChatIntent(context: Context, chatId: String?): Intent {
        val base = CapConfig.loadDefault(context).serverUrl
        val intent = Intent(context, MainActivity::class.java)
        if (!chatId.isNullOrBlank() && base != null) {
            intent.action = Intent.ACTION_VIEW
            intent.data = Uri.parse("$base?chat=$chatId")
        } else {
            intent.action = Intent.ACTION_MAIN
        }
        return intent
    }

    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL_MESSAGES, "Сообщения", NotificationManager.IMPORTANCE_HIGH)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun ensureCallChannels(context: Context) {
        // No channel sound or vibration: the ring is played by Ringer, so it follows the ringer mode and DND.
        val incoming = NotificationChannel(CHANNEL_INCOMING_CALLS, "Входящие звонки", NotificationManager.IMPORTANCE_HIGH)
            .apply {
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
        val missed = NotificationChannel(CHANNEL_MISSED_CALLS, "Пропущенные", NotificationManager.IMPORTANCE_DEFAULT)
        context.getSystemService(NotificationManager::class.java).createNotificationChannels(listOf(incoming, missed))
    }
}
