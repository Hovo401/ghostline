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

/** How an incoming call announces itself: [Quiet] is the shade entry only (the page rings), [Loud] is the system ring. */
enum class RingMode { Quiet, Loud }

/**
 * Who rings (T-094): exactly one source. While the app is on screen **and the page shows this call** the page
 * rings itself and native stays [RingMode.Quiet]; otherwise native rings — a call that came by push only,
 * with the socket still reconnecting, must not go silent. The test call is for proving the native chain, so
 * it is always loud.
 */
fun ringModeFor(appOnScreen: Boolean, isTest: Boolean, pageShowsCall: Boolean): RingMode =
    if (isTest || !appOnScreen || !pageShowsCall) RingMode.Loud else RingMode.Quiet

/** How long a push-started call is given, with the app on screen, to appear in the page before native rings itself. */
const val PAGE_GRACE_MS = 2_500L

/** The page has reported `incoming` for this call, or has not had its [PAGE_GRACE_MS] yet (the push beats the socket). */
fun pageShowsCall(pageReported: Boolean, nowMs: Long, graceUntilMs: Long): Boolean = pageReported || nowMs < graceUntilMs

/** A start request for a call that already rings is a duplicate, unless it brings the `declineToken` the page-started one lacks. */
fun isDuplicateStart(ringing: Boolean, declineToken: String): Boolean = ringing && declineToken.isEmpty()

/** The ringing call has no token and the duplicate has one: swap it in, so "Отклонить" works without the page's JS. */
fun adoptsDeclineToken(currentToken: String, newToken: String): Boolean = currentToken.isEmpty() && newToken.isNotEmpty()

/** What the service does when the app's visibility may have changed the target [RingMode]. */
sealed interface RingChange {
    data object None : RingChange

    /** Repost on the loud channel with the full-screen intent and ring for [remainingMs]. */
    data class Escalate(val remainingMs: Long) : RingChange

    /** Repost on the quiet channel and stop the ringer. */
    data object Quieten : RingChange
}

/** An escalation with no ring time left is dropped: the service's own timeout is about to end the call. */
fun ringChange(current: RingMode, target: RingMode, remainingMs: Long): RingChange = when {
    current == target -> RingChange.None
    target == RingMode.Loud -> if (remainingMs > 0) RingChange.Escalate(remainingMs) else RingChange.None
    else -> RingChange.Quieten
}

/** What a phase the page reports (`null`: no call) means for the ring of the same call id. */
enum class PageRingAction { None, Start, Answered, Closed }

/**
 * The page is the second source of an incoming call and the first to know it was answered or is over:
 * `incoming` starts the service if it is not up yet, answered/connecting/outgoing/active hands the ring over
 * (the call lives on), `ended`/`null` ends it. [ringing] is whether the service already has this call id.
 */
fun pageRingAction(phase: CallPhase?, ringing: Boolean): PageRingAction = when (phase) {
    CallPhase.Incoming -> if (ringing) PageRingAction.None else PageRingAction.Start
    null, CallPhase.Ended -> if (ringing) PageRingAction.Closed else PageRingAction.None
    else -> if (ringing) PageRingAction.Answered else PageRingAction.None
}

/** The server's ISO-8601 `createdAt` as epoch millis; `null` for a missing or malformed value. */
fun parseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return try {
        java.time.Instant.parse(iso).toEpochMilli()
    } catch (_: java.time.format.DateTimeParseException) {
        null
    }
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

/**
 * Whether a `call:closed` / decline / timeout should also end the call's Telecom entry and ongoing
 * notification. The backend sends `answered-elsewhere` to every device of the callee, the one that just
 * answered included: for a call that is not ringing here any more that is our own answer, and the call goes on.
 */
fun shouldEndCallOnClose(ringingHere: Boolean, answeredElsewhere: Boolean): Boolean =
    ringingHere || !answeredElsewhere

/**
 * After a native "Ответить" the page has [ttlMs] to report the call as connecting/active; if it never does
 * (the answer expired, the call is gone, the page didn't come up) the Telecom entry registered for the ring
 * must not live on.
 */
class AnswerWatchdog(private val ttlMs: Long = LaunchActionStore.TTL_MS) {
    private var callId: String? = null
    private var sinceMs = 0L

    @Synchronized
    fun arm(callId: String, nowMs: Long) {
        this.callId = callId
        sinceMs = nowMs
    }

    /** The page reported [callId] as connecting/active. */
    @Synchronized
    fun confirm(callId: String) {
        if (this.callId == callId) this.callId = null
    }

    /** The unconfirmed call whose time is up, once; `null` while there is none or it still has time. */
    @Synchronized
    fun expired(nowMs: Long): String? {
        val id = callId ?: return null
        if (nowMs - sinceMs < ttlMs) return null
        callId = null
        return id
    }
}
