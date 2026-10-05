package app.ghostline.calls

import android.content.Intent
import org.json.JSONObject

/** `NativeCallPhase` in `apps/frontend/src/shared/native/ghostline-plugin.ts`. */
enum class CallPhase(val wire: String) {
    Outgoing("outgoing"),
    Incoming("incoming"),
    Connecting("connecting"),
    Active("active"),
    Reconnecting("reconnecting"),
    Ended("ended"),
    ;

    companion object {
        fun parse(wire: String?): CallPhase? = entries.firstOrNull { it.wire == wire }
    }
}

/** `NativeCallState` in `ghostline-plugin.ts`: what the page tells native about its call. */
data class NativeCallState(
    val callId: String,
    val chatId: String,
    val phase: CallPhase,
    val video: Boolean,
    val peerName: String,
    /** Epoch millis the call was answered, `null` while it is still ringing or connecting. */
    val answeredAt: Long?,
    val muted: Boolean,
    /** Native's own: the system put the call on hold ([CallSession.onSystemHold]). Never read from the page. */
    val held: Boolean = false,
    /**
     * Epoch millis of the server's `Call.createdAt`, sent with an `incoming` state only (T-094): the ring window
     * is counted from it. `null` from an older page, which native then does not ring for.
     */
    val createdAt: Long? = null,
    /** The caller's avatar URL of an `incoming` state, for the call screen; `null` if there is none. */
    val callerAvatarUrl: String? = null,
) {
    /** Carries the state into the [OngoingCallService] start intent (the service may start with the process cold). */
    fun putInto(intent: Intent): Intent = intent
        .putExtra(EXTRA_CALL_ID, callId)
        .putExtra(EXTRA_CHAT_ID, chatId)
        .putExtra(EXTRA_PHASE, phase.wire)
        .putExtra(EXTRA_VIDEO, video)
        .putExtra(EXTRA_PEER_NAME, peerName)
        .putExtra(EXTRA_ANSWERED_AT, answeredAt ?: NO_ANSWER)
        .putExtra(EXTRA_MUTED, muted)
        .putExtra(EXTRA_HELD, held)

    companion object {
        private const val EXTRA_CALL_ID = "stateCallId"
        private const val EXTRA_CHAT_ID = "stateChatId"
        private const val EXTRA_PHASE = "statePhase"
        private const val EXTRA_VIDEO = "stateVideo"
        private const val EXTRA_PEER_NAME = "statePeerName"
        private const val EXTRA_ANSWERED_AT = "stateAnsweredAt"
        private const val EXTRA_MUTED = "stateMuted"
        private const val EXTRA_HELD = "stateHeld"
        private const val NO_ANSWER = -1L

        /** `null` for anything that isn't a well-formed state (a newer page, a bug): native then does nothing. */
        fun parse(json: JSONObject): NativeCallState? {
            val callId = json.optString("callId", "")
            val phase = CallPhase.parse(if (json.isNull("phase")) null else json.optString("phase"))
            if (callId.isEmpty() || phase == null) return null
            return NativeCallState(
                callId = callId,
                chatId = json.optString("chatId", ""),
                phase = phase,
                video = json.optBoolean("video", false),
                peerName = json.optString("peerName", ""),
                answeredAt = if (json.isNull("answeredAt")) null else json.optLong("answeredAt", NO_ANSWER).takeIf { it >= 0 },
                muted = json.optBoolean("muted", false),
                createdAt = parseIsoMillis(if (json.isNull("createdAt")) null else json.optString("createdAt")),
                callerAvatarUrl = if (json.isNull("callerAvatarUrl")) null else json.optString("callerAvatarUrl").ifEmpty { null },
            )
        }

        fun from(intent: Intent): NativeCallState? {
            val callId = intent.getStringExtra(EXTRA_CALL_ID) ?: return null
            val phase = CallPhase.parse(intent.getStringExtra(EXTRA_PHASE)) ?: return null
            return NativeCallState(
                callId = callId,
                chatId = intent.getStringExtra(EXTRA_CHAT_ID) ?: "",
                phase = phase,
                video = intent.getBooleanExtra(EXTRA_VIDEO, false),
                peerName = intent.getStringExtra(EXTRA_PEER_NAME) ?: "",
                answeredAt = intent.getLongExtra(EXTRA_ANSWERED_AT, NO_ANSWER).takeIf { it >= 0 },
                muted = intent.getBooleanExtra(EXTRA_MUTED, false),
                held = intent.getBooleanExtra(EXTRA_HELD, false),
            )
        }
    }
}
