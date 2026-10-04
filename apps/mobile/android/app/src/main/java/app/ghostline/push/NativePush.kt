package app.ghostline.push

import org.json.JSONException
import org.json.JSONObject

/** What the app decrypts out of an FCM message — `NativePushPayloadSchema` in packages/contracts. */
sealed interface NativePush {
    data class Message(val chatId: String, val title: String, val body: String) : NativePush
    data class CallIncoming(
        val callId: String,
        val chatId: String,
        val callerName: String,
        val video: Boolean,
    ) : NativePush
    data class CallClosed(val callId: String) : NativePush
    data class CallMissed(val callId: String, val chatId: String, val callerName: String) : NativePush
    data class ChatRead(val chatId: String) : NativePush
    data object Test : NativePush
    data class TestCall(val callerName: String) : NativePush

    companion object {
        /** `null` for a kind this build doesn't know (a newer backend) or a malformed payload. */
        fun parse(json: String): NativePush? = try {
            val o = JSONObject(json)
            when (o.getString("kind")) {
                "message" -> Message(o.getString("chatId"), o.getString("title"), o.getString("body"))
                "call:incoming" -> CallIncoming(
                    o.getString("callId"),
                    o.getString("chatId"),
                    o.getString("callerName"),
                    o.getBoolean("video"),
                )
                "call:closed" -> CallClosed(o.getString("callId"))
                "call:missed" -> CallMissed(o.getString("callId"), o.getString("chatId"), o.getString("callerName"))
                "chat:read" -> ChatRead(o.getString("chatId"))
                "test" -> Test
                "test-call" -> TestCall(o.getString("callerName"))
                else -> null
            }
        } catch (_: JSONException) {
            null
        }
    }
}
