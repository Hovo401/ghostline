package app.ghostline.calls

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class IncomingCall(
    val callId: String,
    val chatId: String,
    val callerName: String,
    val callerAvatarUrl: String?,
    val video: Boolean,
    val declineToken: String,
    val isTest: Boolean,
) {
    /** Carries the call into the activity / receiver intents (they can start with the process cold). */
    fun putInto(intent: Intent): Intent = intent
        .putExtra(EXTRA_CALL_ID, callId)
        .putExtra(EXTRA_CHAT_ID, chatId)
        .putExtra(EXTRA_CALLER_NAME, callerName)
        .putExtra(EXTRA_AVATAR_URL, callerAvatarUrl)
        .putExtra(EXTRA_VIDEO, video)
        .putExtra(EXTRA_DECLINE_TOKEN, declineToken)
        .putExtra(EXTRA_TEST, isTest)

    companion object {
        private const val EXTRA_CALL_ID = "callId"
        private const val EXTRA_CHAT_ID = "chatId"
        private const val EXTRA_CALLER_NAME = "callerName"
        private const val EXTRA_AVATAR_URL = "callerAvatarUrl"
        private const val EXTRA_VIDEO = "video"
        private const val EXTRA_DECLINE_TOKEN = "declineToken"
        private const val EXTRA_TEST = "isTest"

        fun from(intent: Intent): IncomingCall? {
            val callId = intent.getStringExtra(EXTRA_CALL_ID) ?: return null
            return IncomingCall(
                callId = callId,
                chatId = intent.getStringExtra(EXTRA_CHAT_ID) ?: "",
                callerName = intent.getStringExtra(EXTRA_CALLER_NAME) ?: "",
                callerAvatarUrl = intent.getStringExtra(EXTRA_AVATAR_URL),
                video = intent.getBooleanExtra(EXTRA_VIDEO, false),
                declineToken = intent.getStringExtra(EXTRA_DECLINE_TOKEN) ?: "",
                isTest = intent.getBooleanExtra(EXTRA_TEST, false),
            )
        }
    }
}

/** The call that is ringing right now, or `null`. Written by [IncomingCallService], watched by the call screen. */
object IncomingCallState {
    private val _call = MutableStateFlow<IncomingCall?>(null)
    val call: StateFlow<IncomingCall?> = _call

    fun set(call: IncomingCall?) {
        _call.value = call
    }
}
