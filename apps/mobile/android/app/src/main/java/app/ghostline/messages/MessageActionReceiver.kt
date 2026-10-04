package app.ghostline.messages

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import app.ghostline.push.PushNotifier
import com.getcapacitor.CapConfig
import java.util.concurrent.Executors

/**
 * "Ответить", "Прочитано" and swipe-away on a message notification. Runs with the app killed:
 * `goAsync` keeps the process alive for the one HTTP call, made off the main thread.
 */
class MessageActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val chatId = intent.getStringExtra(EXTRA_CHAT_ID) ?: return
        val replyText = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()
        val pending = goAsync()
        EXECUTOR.execute {
            try {
                when (intent.action) {
                    ACTION_REPLY -> reply(context, chatId, replyText)
                    ACTION_READ -> read(context, chatId)
                    ACTION_DISMISSED -> MessageHistoryStore.get(context).remove(chatId)
                }
            } catch (e: Exception) {
                Log.w(PushNotifier.LOG_TAG, "notification action failed", e)
            } finally {
                pending.finish()
            }
        }
    }

    private fun reply(context: Context, chatId: String, text: String?) {
        val thread = MessageHistoryStore.get(context).get(chatId)
        if (text.isNullOrBlank() || thread == null) {
            // Nothing to send or nothing left to answer; still end the "sending…" spinner.
            MessageNotifier.dismiss(context, chatId)
            return
        }
        val base = apiBase(context)
        if (base != null && NotificationActionApi.reply(base, thread.actionToken, text)) {
            // The server's chat:read for this reply would remove it a moment later anyway.
            MessageNotifier.dismiss(context, chatId)
        } else {
            MessageNotifier.onReplyFailed(context, chatId, text)
        }
    }

    private fun read(context: Context, chatId: String) {
        val thread = MessageHistoryStore.get(context).get(chatId)
        // Optimistic: the notification goes at once; a failure only leaves the chat unread in the app.
        MessageNotifier.dismiss(context, chatId)
        if (thread == null) return
        val base = apiBase(context) ?: return
        if (!NotificationActionApi.markRead(base, thread.actionToken, thread.maxSeq)) {
            Log.w(PushNotifier.LOG_TAG, "mark-read from the notification failed")
        }
    }

    private fun apiBase(context: Context): String? =
        CapConfig.loadDefault(context).serverUrl?.let(NotificationActionApi::apiBase)

    companion object {
        const val ACTION_REPLY = "app.ghostline.action.REPLY"
        const val ACTION_READ = "app.ghostline.action.READ"
        const val ACTION_DISMISSED = "app.ghostline.action.DISMISSED"
        const val EXTRA_CHAT_ID = "chatId"
        const val KEY_REPLY = "reply"

        private val EXECUTOR = Executors.newSingleThreadExecutor()
    }
}
