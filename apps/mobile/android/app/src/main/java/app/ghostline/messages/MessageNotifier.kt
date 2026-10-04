package app.ghostline.messages

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import app.ghostline.R
import app.ghostline.push.NativePush
import app.ghostline.push.PushNotifier

/**
 * One notification per chat (tag `chat:<id>`, the web's tag too): a MessagingStyle over the last
 * lines kept in [MessageHistoryStore], with inline reply and "Прочитано". The server decides what
 * the text is (preview off → "Новое сообщение"), so this never looks at settings.
 */
object MessageNotifier {
    private const val NOTIFICATION_ID = 0

    fun tag(chatId: String) = "chat:$chatId"

    fun show(context: Context, push: NativePush.Message) {
        val store = MessageHistoryStore.get(context)
        val thread = store.get(push.chatId)?.withMessage(push) ?: ChatThread.start(push)
        store.put(push.chatId, thread)
        render(context, push.chatId, thread, alert = true)
    }

    /** The chat was read on some device: drop what it covered, keep (silently) anything newer. */
    fun onChatRead(context: Context, chatId: String, readSeq: Long) {
        val store = MessageHistoryStore.get(context)
        val rest = store.get(chatId)?.readUpTo(readSeq)
        if (rest == null) {
            dismiss(context, chatId)
        } else {
            store.put(chatId, rest)
            render(context, chatId, rest, alert = false)
        }
    }

    /** Keeps the lines and shows the reply that didn't go out; "Ответить" stays for another try. */
    fun onReplyFailed(context: Context, chatId: String, text: String) {
        val store = MessageHistoryStore.get(context)
        val thread = store.get(chatId)?.withFailedReply(text, System.currentTimeMillis()) ?: return
        store.put(chatId, thread)
        render(context, chatId, thread, alert = false)
    }

    fun dismiss(context: Context, chatId: String) {
        MessageHistoryStore.get(context).remove(chatId)
        NotificationManagerCompat.from(context).cancel(tag(chatId), NOTIFICATION_ID)
    }

    /** Logout: another account's texts must not stay in the shade with a working "Ответить". */
    fun clearAll(context: Context) {
        val store = MessageHistoryStore.get(context)
        store.chatIds().forEach { NotificationManagerCompat.from(context).cancel(tag(it), NOTIFICATION_ID) }
        store.clear()
    }

    private fun render(context: Context, chatId: String, thread: ChatThread, alert: Boolean) {
        PushNotifier.ensureChannel(context)
        val sender = Person.Builder().setName(thread.title).build()
        val style = NotificationCompat.MessagingStyle(Person.Builder().setName("Вы").build())
        thread.lines.forEach { style.addMessage(it.text, it.sentAt, if (it.outgoing) null else sender) }

        val reply = NotificationCompat.Action.Builder(
            R.drawable.ic_stat_notify,
            "Ответить",
            actionIntent(context, MessageActionReceiver.ACTION_REPLY, chatId, mutable = true),
        )
            .addRemoteInput(RemoteInput.Builder(MessageActionReceiver.KEY_REPLY).setLabel("Сообщение").build())
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .build()
        val read = NotificationCompat.Action.Builder(
            R.drawable.ic_stat_notify,
            "Прочитано",
            actionIntent(context, MessageActionReceiver.ACTION_READ, chatId, mutable = false),
        )
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
            .setShowsUserInterface(false)
            .build()

        val notification = NotificationCompat.Builder(context, PushNotifier.CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOnlyAlertOnce(!alert)
            .setAutoCancel(true)
            .setWhen(thread.lines.lastOrNull()?.sentAt ?: System.currentTimeMillis())
            .setContentIntent(PushNotifier.openIntent(context, chatId))
            .setDeleteIntent(actionIntent(context, MessageActionReceiver.ACTION_DISMISSED, chatId, mutable = false))
            .addAction(reply)
            .addAction(read)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(tag(chatId), NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted: nothing to show.
            Log.w(PushNotifier.LOG_TAG, "notification not permitted", e)
        }
    }

    // A RemoteInput result is written into the PendingIntent's intent, so reply must be mutable.
    private fun actionIntent(context: Context, action: String, chatId: String, mutable: Boolean): PendingIntent {
        val intent = Intent(context, MessageActionReceiver::class.java)
            .setAction(action)
            .putExtra(MessageActionReceiver.EXTRA_CHAT_ID, chatId)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (mutable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_IMMUTABLE
            }
        return PendingIntent.getBroadcast(context, (action + chatId).hashCode(), intent, flags)
    }
}
