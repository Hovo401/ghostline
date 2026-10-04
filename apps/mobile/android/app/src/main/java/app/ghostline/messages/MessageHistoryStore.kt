package app.ghostline.messages

import android.content.Context

/**
 * Chat threads on disk (keyed by chat id): the FCM service is killed between two pushes, and the
 * second message must still show the first. Called from the FCM thread, receiver executors and
 * main, so every access is serialized.
 */
class MessageHistoryStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    @Synchronized
    fun get(chatId: String): ChatThread? = prefs.getString(chatId, null)?.let(ChatThread::fromJson)

    @Synchronized
    fun put(chatId: String, thread: ChatThread) {
        prefs.edit().putString(chatId, thread.toJson()).commit()
    }

    @Synchronized
    fun remove(chatId: String) {
        prefs.edit().remove(chatId).commit()
    }

    @Synchronized
    fun chatIds(): Set<String> = prefs.all.keys.toSet()

    @Synchronized
    fun clear() {
        prefs.edit().clear().commit()
    }

    companion object {
        private const val FILE = "message_notifications"

        @Volatile
        private var instance: MessageHistoryStore? = null

        fun get(context: Context): MessageHistoryStore =
            instance ?: synchronized(this) {
                instance ?: MessageHistoryStore(context).also { instance = it }
            }
    }
}
