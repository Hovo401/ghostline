package app.ghostline.calls

/** How long an incoming call rings, counted from the server's `createdAt` (FR-CALL timeout). */
const val RING_WINDOW_MS = 45_000L

/**
 * Milliseconds of ringing left, in `0..RING_WINDOW_MS`; `0` means the call is already over and must
 * not ring. A phone clock ahead of the server's (`now < createdAt`) counts as "just created", not
 * as an over-long call.
 */
fun remainingRingMs(nowMs: Long, createdAtMs: Long): Long {
    val elapsed = (nowMs - createdAtMs).coerceAtLeast(0)
    return (RING_WINDOW_MS - elapsed).coerceIn(0, RING_WINDOW_MS)
}

/**
 * Calls that ended before their `call:incoming` push arrived (FCM doesn't keep the order): a late
 * incoming push for one of these must not ring. Small and short-lived on purpose.
 */
class RecentlyClosed(private val max: Int = 8, private val ttlMs: Long = 60_000L) {
    private val closedAt = LinkedHashMap<String, Long>()

    @Synchronized
    fun add(callId: String, nowMs: Long) {
        prune(nowMs)
        closedAt.remove(callId)
        closedAt[callId] = nowMs
        while (closedAt.size > max) closedAt.remove(closedAt.keys.first())
    }

    @Synchronized
    fun contains(callId: String, nowMs: Long): Boolean {
        prune(nowMs)
        return callId in closedAt
    }

    private fun prune(nowMs: Long) {
        closedAt.entries.removeAll { nowMs - it.value >= ttlMs }
    }
}

/** Up to two initials for the avatar placeholder; `"?"` for a blank name. */
fun initialsOf(name: String): String {
    val letters = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        .take(2)
        .map { it.codePointAt(0) }
        .joinToString("") { String(Character.toChars(it)) }
    return if (letters.isEmpty()) "?" else letters.uppercase()
}
