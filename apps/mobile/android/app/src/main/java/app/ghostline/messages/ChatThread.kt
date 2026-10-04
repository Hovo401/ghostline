package app.ghostline.messages

import app.ghostline.push.NativePush
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** One line of a chat's notification. `seq` is 0 for lines that aren't server messages (a failed reply). */
data class Line(
    val messageId: String,
    val seq: Long,
    val text: String,
    val sentAt: Long,
    val outgoing: Boolean = false,
)

/**
 * What a chat's notification shows — the last few lines plus the token that authorizes
 * reply/read for this chat. Pure data so it survives the process dying between two pushes
 * ([MessageHistoryStore]) and can be unit-tested without Android.
 */
data class ChatThread(
    val title: String,
    val actionToken: String,
    val lines: List<Line> = emptyList(),
) {
    /** The highest server `seq` shown — what "Прочитано" marks read. */
    val maxSeq: Long get() = lines.maxOfOrNull { it.seq } ?: 0L

    /** A repeated push (FCM may redeliver) leaves the thread unchanged. */
    fun withMessage(push: NativePush.Message): ChatThread {
        if (lines.any { it.messageId == push.messageId }) return this
        val line = Line(push.messageId, push.seq, push.body, push.sentAt)
        return copy(
            title = push.title,
            actionToken = push.actionToken,
            lines = (lines + line).sortedWith(compareBy({ it.seq }, { it.sentAt })).takeLast(MAX_LINES),
        )
    }

    /** Drops lines the reader has seen; `null` when nothing is left to show. */
    fun readUpTo(seq: Long): ChatThread? {
        val rest = lines.filter { it.seq > seq }
        return if (rest.isEmpty()) null else copy(lines = rest)
    }

    fun withFailedReply(text: String, now: Long): ChatThread {
        val line = Line("failed:$now", 0L, "Не отправлено: $text", now, outgoing = true)
        return copy(lines = (lines + line).takeLast(MAX_LINES))
    }

    fun toJson(): String = JSONObject()
        .put("title", title)
        .put("actionToken", actionToken)
        .put(
            "lines",
            JSONArray(
                lines.map {
                    JSONObject()
                        .put("id", it.messageId)
                        .put("seq", it.seq)
                        .put("text", it.text)
                        .put("sentAt", it.sentAt)
                        .put("out", it.outgoing)
                },
            ),
        )
        .toString()

    companion object {
        const val MAX_LINES = 7

        /** `null` for a damaged value — the next push starts the thread over. */
        fun fromJson(json: String): ChatThread? = try {
            val o = JSONObject(json)
            val arr = o.getJSONArray("lines")
            ChatThread(
                o.getString("title"),
                o.getString("actionToken"),
                List(arr.length()) {
                    val l = arr.getJSONObject(it)
                    Line(l.getString("id"), l.getLong("seq"), l.getString("text"), l.getLong("sentAt"), l.getBoolean("out"))
                },
            )
        } catch (_: JSONException) {
            null
        }

        fun start(push: NativePush.Message): ChatThread =
            ChatThread(push.title, push.actionToken).withMessage(push)
    }
}
