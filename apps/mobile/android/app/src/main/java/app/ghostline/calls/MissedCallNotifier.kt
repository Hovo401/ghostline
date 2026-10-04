package app.ghostline.calls

import android.app.PendingIntent
import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.ghostline.R
import app.ghostline.push.PushNotifier

/** The "Пропущенный звонок" notification (tag `call:<id>`, like the web's). */
object MissedCallNotifier {
    private const val NOTIFICATION_ID = 0

    fun show(context: Context, callId: String, chatId: String, callerName: String, video: Boolean) {
        PushNotifier.ensureCallChannels(context)
        val title = if (video) "Пропущенный видеозвонок" else "Пропущенный аудиозвонок"
        // TODO(T-086): start the call directly instead of opening the chat
        val callBack = PendingIntent.getActivity(
            context,
            "callback:$callId".hashCode(),
            PushNotifier.openChatIntent(context, chatId),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, PushNotifier.CHANNEL_MISSED_CALLS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(callerName)
            .setContentText(title)
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setAutoCancel(true)
            .setContentIntent(PushNotifier.openIntent(context, chatId))
            .addAction(0, "Перезвонить", callBack)
            .build()
        try {
            NotificationManagerCompat.from(context).notify("call:$callId", NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted: nothing to show.
            Log.w(PushNotifier.LOG_TAG, "notification not permitted", e)
        }
    }
}
