package app.ghostline.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CallLogicTest {
    @Test
    fun ringsForTheRestOfTheWindow() {
        assertEquals(45_000L, remainingRingMs(nowMs = 1_000, createdAtMs = 1_000))
        assertEquals(30_000L, remainingRingMs(nowMs = 16_000, createdAtMs = 1_000))
    }

    @Test
    fun anExpiredCallHasNothingLeft() {
        assertEquals(0L, remainingRingMs(nowMs = 46_000, createdAtMs = 1_000))
        assertEquals(0L, remainingRingMs(nowMs = 100_000, createdAtMs = 1_000))
    }

    @Test
    fun aPhoneClockAheadOfTheServerStillRingsTheFullWindow() {
        assertEquals(RING_WINDOW_MS, remainingRingMs(nowMs = 100_000, createdAtMs = 200_000))
    }

    @Test
    fun remembersAClosedCallForAMinute() {
        val closed = RecentlyClosed()
        closed.add("a", nowMs = 1_000)
        assertTrue(closed.contains("a", nowMs = 60_999))
        assertFalse(closed.contains("a", nowMs = 61_000))
        assertFalse(closed.contains("b", nowMs = 1_000))
    }

    @Test
    fun keepsOnlyTheEightMostRecentClosedCalls() {
        val closed = RecentlyClosed()
        for (i in 1..9) closed.add("c$i", nowMs = i.toLong())
        assertFalse(closed.contains("c1", nowMs = 10))
        assertTrue(closed.contains("c2", nowMs = 10))
        assertTrue(closed.contains("c9", nowMs = 10))
    }

    @Test
    fun closingACallAgainRefreshesItsAge() {
        val closed = RecentlyClosed()
        closed.add("a", nowMs = 0)
        closed.add("a", nowMs = 50_000)
        assertTrue(closed.contains("a", nowMs = 100_000))
    }

    @Test
    fun takesInitialsOfUpToTwoWords() {
        assertEquals("АП", initialsOf("Алиса Петрова"))
        assertEquals("АП", initialsOf("алиса  петрова  младшая"))
        assertEquals("G", initialsOf("ghostline"))
    }

    @Test
    fun fallsBackForABlankName() {
        assertEquals("?", initialsOf("   "))
        assertEquals("?", initialsOf(""))
    }

    @Test
    fun keepsAnAstralFirstLetterWhole() {
        assertEquals("👻", initialsOf("👻"))
    }
}

class CloseDecisionTest {
    @Test
    fun ownAnsweredElsewhereAfterAnsweringKeepsTheCall() {
        assertFalse(shouldEndCallOnClose(ringingHere = false, answeredElsewhere = true))
    }

    @Test
    fun answeredOnAnotherDeviceWhileRingingHereEndsIt() {
        assertTrue(shouldEndCallOnClose(ringingHere = true, answeredElsewhere = true))
    }

    @Test
    fun anEndedCallEndsEvenIfNotRinging() {
        assertTrue(shouldEndCallOnClose(ringingHere = false, answeredElsewhere = false))
        assertTrue(shouldEndCallOnClose(ringingHere = true, answeredElsewhere = false))
    }
}

class AnswerWatchdogTest {
    @Test
    fun anUnconfirmedAnswerExpiresOnceAfterTheTtl() {
        val dog = AnswerWatchdog(ttlMs = 60_000)
        dog.arm("c1", nowMs = 1_000)
        assertEquals(null, dog.expired(nowMs = 60_999))
        assertEquals("c1", dog.expired(nowMs = 61_000))
        assertEquals(null, dog.expired(nowMs = 62_000))
    }

    @Test
    fun aConfirmedAnswerNeverExpires() {
        val dog = AnswerWatchdog(ttlMs = 60_000)
        dog.arm("c1", nowMs = 1_000)
        dog.confirm("c1")
        assertEquals(null, dog.expired(nowMs = 100_000))
    }

    @Test
    fun confirmingAnotherCallChangesNothing() {
        val dog = AnswerWatchdog(ttlMs = 60_000)
        dog.arm("c1", nowMs = 1_000)
        dog.confirm("c2")
        assertEquals("c1", dog.expired(nowMs = 100_000))
    }
}
