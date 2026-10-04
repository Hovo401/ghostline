package app.ghostline.calls

import android.content.Intent
import com.getcapacitor.JSObject

/**
 * What the user chose on the phone's own UI before the page could act on it (`NativeLaunchAction` and
 * `NativeCallCommand` in `ghostline-plugin.ts`). Reaches the page as a `callCommand` event or, if the
 * page isn't running, through `consumeLaunchAction`.
 */
sealed interface LaunchAction {
    data class Answer(val callId: String, val chatId: String, val video: Boolean) : LaunchAction
    data class Callback(val chatId: String, val video: Boolean) : LaunchAction

    /** The wire object; also the payload of the `callCommand` event. */
    fun toJson(): JSObject = when (this) {
        is Answer -> JSObject().put("type", "answer").put("callId", callId).put("chatId", chatId).put("video", video)
        is Callback -> JSObject().put("type", "callback").put("chatId", chatId).put("video", video)
    }

    /** Into the `MainActivity` intent: a notification button or the call screen can't talk to the plugin directly. */
    fun putInto(intent: Intent): Intent = when (this) {
        is Answer -> intent.putExtra(EXTRA_ACTION, ACTION_ANSWER).putExtra(EXTRA_CALL_ID, callId)
            .putExtra(EXTRA_CHAT_ID, chatId).putExtra(EXTRA_VIDEO, video)
        is Callback -> intent.putExtra(EXTRA_ACTION, ACTION_CALLBACK)
            .putExtra(EXTRA_CHAT_ID, chatId).putExtra(EXTRA_VIDEO, video)
    }

    companion object {
        private const val EXTRA_ACTION = "launchAction"
        private const val EXTRA_CALL_ID = "launchCallId"
        private const val EXTRA_CHAT_ID = "launchChatId"
        private const val EXTRA_VIDEO = "launchVideo"
        private const val ACTION_ANSWER = "answer"
        private const val ACTION_CALLBACK = "callback"

        /** Reads and removes the action from [intent], so an activity recreated with the same intent doesn't repeat it. */
        fun takeFrom(intent: Intent): LaunchAction? {
            val type = intent.getStringExtra(EXTRA_ACTION) ?: return null
            val callId = intent.getStringExtra(EXTRA_CALL_ID)
            val chatId = intent.getStringExtra(EXTRA_CHAT_ID) ?: ""
            val video = intent.getBooleanExtra(EXTRA_VIDEO, false)
            intent.removeExtra(EXTRA_ACTION)
            return when {
                type == ACTION_ANSWER && callId != null -> Answer(callId, chatId, video)
                type == ACTION_CALLBACK && chatId.isNotEmpty() -> Callback(chatId, video)
                else -> null
            }
        }
    }
}

/**
 * How a native answer reaches the page. A page that is listening takes the action at once; then nothing is
 * kept and `MainActivity` is only brought up (`EXTRA_OPEN_CALL`), so neither a blocked background start nor a
 * reload within the store's TTL can answer twice. Otherwise the action waits in the store and rides the intent.
 */
data class AnswerPlan(val keepInStore: Boolean, val carryAction: Boolean)

fun planAnswer(delivered: Boolean) = AnswerPlan(keepInStore = !delivered, carryAction = !delivered)

/**
 * The one pending [LaunchAction], in memory: it only has to outlive the gap between a tap and the page
 * starting, and a process that died in between has lost the tap's intent anyway. Handed out once and
 * dropped after [ttlMs] — an answer older than the ring window must not pick up a later call.
 */
class LaunchActionStore(private val ttlMs: Long = TTL_MS) {
    private var action: LaunchAction? = null
    private var putAtMs = 0L

    @Synchronized
    fun put(newAction: LaunchAction, nowMs: Long) {
        action = newAction
        putAtMs = nowMs
    }

    /** Drops [action] if it is the pending one: the page took it directly, a copy kept for a cold start would repeat it. */
    @Synchronized
    fun discard(action: LaunchAction) {
        if (this.action == action) this.action = null
    }

    /** The pending action if it is still fresh; it is gone afterwards either way. */
    @Synchronized
    fun consume(nowMs: Long): LaunchAction? {
        val pending = action
        action = null
        return if (pending != null && nowMs - putAtMs in 0 until ttlMs) pending else null
    }

    companion object {
        const val TTL_MS = 60_000L

        val shared = LaunchActionStore()
    }
}
