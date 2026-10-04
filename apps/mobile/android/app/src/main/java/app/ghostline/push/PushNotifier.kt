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
import app.ghostline.messages.MessageNotifier
import com.getcapacitor.CapConfig

/**
 * Routes a decrypted push to its notification. Messages are [MessageNotifier] (T-084); calls are
 * still T-083b's plain notification until T-085 replaces them with the ringing full-screen screen.
 * Tags match the web's (`chat:<id>`, `call:<id>`, see `sw-notifications.ts`), so a newer push
 * replaces an older one and `chat:read` / `call:closed` can dismiss it.
 */
object PushNotifier {
    const val LOG_TAG = "GhostlinePush"
    const val CHANNEL_MESSAGES = "messages"
    private const val CALL_TIMEOUT_MS = 45_000L
    private const val NOTIFICATION_ID = 0

    fun handle(context: Context, push: NativePush) {
        when (push) {
            is NativePush.Message -> MessageNotifier.show(context, push)
            is NativePush.CallIncoming -> show(
                context,
                push.callerName,
                if (push.video) "Входящий видеозвонок" else "Входящий аудиозвонок",
                "call:${push.callId}",
                push.chatId,
                call = true,
            )
            is NativePush.CallMissed -> show(
                context, push.callerName, "Пропущенный звонок", "call:${push.callId}", push.chatId,
            )
            is NativePush.CallClosed -> cancel(context, "call:${push.callId}")
            is NativePush.ChatRead -> MessageNotifier.onChatRead(context, push.chatId, push.readSeq)
            NativePush.Test -> show(context, "Ghostline", "Тестовое уведомление — push работает", "test", null)
            // The test call screen is T-085; until then the push only proves delivery.
            is NativePush.TestCall -> Log.i(LOG_TAG, "test-call received (screen: T-085)")
        }
    }

    private fun cancel(context: Context, tag: String) {
        NotificationManagerCompat.from(context).cancel(tag, NOTIFICATION_ID)
    }

    private fun show(
        context: Context,
        title: String,
        body: String,
        tag: String,
        chatId: String?,
        call: Boolean = false,
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
        if (call) {
            builder.setCategory(NotificationCompat.CATEGORY_CALL).setTimeoutAfter(CALL_TIMEOUT_MS)
        } else {
            builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
        }
        try {
            NotificationManagerCompat.from(context).notify(tag, NOTIFICATION_ID, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted: nothing to show.
            Log.w(LOG_TAG, "notification not permitted", e)
        }
    }

    /** Opens the chat through the App Link path T-080a already handles (`/app?chat=<id>`). */
    fun openIntent(context: Context, chatId: String?): PendingIntent {
        val base = CapConfig.loadDefault(context).serverUrl
        val intent = Intent(context, MainActivity::class.java)
        if (chatId != null && base != null) {
            intent.action = Intent.ACTION_VIEW
            intent.data = Uri.parse("$base?chat=$chatId")
        } else {
            intent.action = Intent.ACTION_MAIN
        }
        return PendingIntent.getActivity(
            context,
            (chatId ?: "").hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL_MESSAGES, "Сообщения", NotificationManager.IMPORTANCE_HIGH)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
