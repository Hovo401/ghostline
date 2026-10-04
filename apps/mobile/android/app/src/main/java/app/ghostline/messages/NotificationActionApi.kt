package app.ghostline.messages

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

/**
 * The two notification actions, called without the WebView or an access token — the push's
 * chat action token (`?t=`) is the whole authorization (`NotificationActionGuard`). One POST each,
 * no retry: a failed reply is shown to the user instead (see [MessageNotifier.onReplyFailed]).
 */
object NotificationActionApi {
    // A receiver using goAsync() has ~10s; connect + read must fit in it.
    private const val TIMEOUT_MS = 4_000

    /** `https://host/app` (the Capacitor `server.url`) → `https://host/api/v1`. */
    fun apiBase(serverUrl: String): String {
        val url = URL(serverUrl)
        val port = if (url.port == -1) "" else ":${url.port}"
        return "${url.protocol}://${url.host}$port/api/v1"
    }

    fun reply(base: String, token: String, text: String, clientMessageId: String = UUID.randomUUID().toString()): Boolean =
        post(
            "$base/messages/notification-reply?t=${encode(token)}",
            JSONObject().put("clientMessageId", clientMessageId).put("text", text),
        )

    fun markRead(base: String, token: String, upToSeq: Long): Boolean =
        post("$base/chats/notification-read?t=${encode(token)}", JSONObject().put("upToSeq", upToSeq.toString()))

    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")

    private fun post(url: String, body: JSONObject): Boolean {
        val connection = URL(url).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            connection.responseCode in 200..299
        } catch (_: java.io.IOException) {
            false
        } finally {
            connection.disconnect()
        }
    }
}
