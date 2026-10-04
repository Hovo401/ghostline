package app.ghostline.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LaunchActionStoreTest {
    private val answer = LaunchAction.Answer(callId = "c1", chatId = "chat1", video = true)

    @Test
    fun handsTheActionOutExactlyOnce() {
        val store = LaunchActionStore()
        store.put(answer, nowMs = 1_000)
        assertEquals(answer, store.consume(nowMs = 2_000))
        assertNull(store.consume(nowMs = 2_001))
    }

    @Test
    fun nothingPendingIsNull() {
        assertNull(LaunchActionStore().consume(nowMs = 1_000))
    }

    @Test
    fun anActionOlderThanTheTtlIsDropped() {
        val store = LaunchActionStore(ttlMs = 60_000)
        store.put(answer, nowMs = 1_000)
        assertNull(store.consume(nowMs = 61_000))
    }

    @Test
    fun justInsideTheTtlStillCounts() {
        val store = LaunchActionStore(ttlMs = 60_000)
        store.put(answer, nowMs = 1_000)
        assertEquals(answer, store.consume(nowMs = 60_999))
    }

    @Test
    fun anExpiredActionIsGoneAfterTheFailedConsume() {
        val store = LaunchActionStore(ttlMs = 60_000)
        store.put(answer, nowMs = 1_000)
        store.consume(nowMs = 100_000)
        // Even a clock that went back does not bring it back.
        assertNull(store.consume(nowMs = 2_000))
    }

    @Test
    fun aNewerActionReplacesTheOlderOne() {
        val store = LaunchActionStore()
        val callback = LaunchAction.Callback(chatId = "chat2", video = false)
        store.put(answer, nowMs = 1_000)
        store.put(callback, nowMs = 2_000)
        assertEquals(callback, store.consume(nowMs = 3_000))
    }

    @Test
    fun aClockSetBackIsNotFresh() {
        val store = LaunchActionStore()
        store.put(answer, nowMs = 10_000)
        assertNull(store.consume(nowMs = 5_000))
    }

    @Test
    fun aDeliveredActionIsDiscardedButANewerOneIsNot() {
        val store = LaunchActionStore()
        store.put(answer, nowMs = 1_000)
        store.discard(answer)
        assertNull(store.consume(nowMs = 2_000))

        val callback = LaunchAction.Callback(chatId = "chat2", video = false)
        store.put(callback, nowMs = 1_000)
        store.discard(answer)
        assertEquals(callback, store.consume(nowMs = 2_000))
    }
}
