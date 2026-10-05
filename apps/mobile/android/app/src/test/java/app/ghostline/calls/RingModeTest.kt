package app.ghostline.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RingModeTest {
    @Test
    fun theOpenAppWithThePageRingingIsQuietAndTheHiddenOneRings() {
        assertEquals(RingMode.Quiet, ringModeFor(appOnScreen = true, isTest = false, pageShowsCall = true))
        assertEquals(RingMode.Loud, ringModeFor(appOnScreen = false, isTest = false, pageShowsCall = true))
    }

    @Test
    fun aCallThePageDoesNotShowKeepsRingingNatively() {
        assertEquals(RingMode.Loud, ringModeFor(appOnScreen = true, isTest = false, pageShowsCall = false))
    }

    @Test
    fun theTestCallAlwaysRings() {
        assertEquals(RingMode.Loud, ringModeFor(appOnScreen = true, isTest = true, pageShowsCall = true))
    }

    @Test
    fun thePageHasAGraceAfterThePushThenMustHaveReported() {
        assertTrue(pageShowsCall(pageReported = false, nowMs = 1_000, graceUntilMs = 2_000))
        assertFalse(pageShowsCall(pageReported = false, nowMs = 2_000, graceUntilMs = 2_000))
        assertTrue(pageShowsCall(pageReported = true, nowMs = 9_000, graceUntilMs = 2_000))
    }

    @Test
    fun aDuplicateStartIsDroppedUnlessItBringsTheToken() {
        assertTrue(isDuplicateStart(ringing = true, declineToken = ""))
        assertFalse(isDuplicateStart(ringing = true, declineToken = "tok"))
        assertFalse(isDuplicateStart(ringing = false, declineToken = ""))
    }

    @Test
    fun onlyAPageStartedCallAdoptsTheTokenOfItsPush() {
        assertTrue(adoptsDeclineToken(currentToken = "", newToken = "tok"))
        assertFalse(adoptsDeclineToken(currentToken = "old", newToken = "tok"))
        assertFalse(adoptsDeclineToken(currentToken = "", newToken = ""))
    }

    @Test
    fun leavingTheScreenEscalatesWithTheTimeLeft() {
        assertEquals(RingChange.Escalate(30_000), ringChange(RingMode.Quiet, RingMode.Loud, 30_000))
    }

    @Test
    fun comingBackQuietensTheRing() {
        assertEquals(RingChange.Quieten, ringChange(RingMode.Loud, RingMode.Quiet, 30_000))
        // Even with nothing left: the ringer must stop.
        assertEquals(RingChange.Quieten, ringChange(RingMode.Loud, RingMode.Quiet, 0))
    }

    @Test
    fun noChangeOfModeIsNoChange() {
        assertEquals(RingChange.None, ringChange(RingMode.Quiet, RingMode.Quiet, 30_000))
        assertEquals(RingChange.None, ringChange(RingMode.Loud, RingMode.Loud, 30_000))
    }

    @Test
    fun anExpiredCallIsNotEscalated() {
        assertEquals(RingChange.None, ringChange(RingMode.Quiet, RingMode.Loud, 0))
    }

    @Test
    fun anIncomingPhaseStartsOnlyACallThatIsNotRinging() {
        assertEquals(PageRingAction.Start, pageRingAction(CallPhase.Incoming, ringing = false))
        assertEquals(PageRingAction.None, pageRingAction(CallPhase.Incoming, ringing = true))
    }

    @Test
    fun anAnsweredPhaseHandsTheRingOver() {
        for (phase in listOf(CallPhase.Outgoing, CallPhase.Connecting, CallPhase.Active, CallPhase.Reconnecting)) {
            assertEquals(PageRingAction.Answered, pageRingAction(phase, ringing = true))
            assertEquals(PageRingAction.None, pageRingAction(phase, ringing = false))
        }
    }

    @Test
    fun endedOrNoCallEndsARingingCall() {
        assertEquals(PageRingAction.Closed, pageRingAction(CallPhase.Ended, ringing = true))
        assertEquals(PageRingAction.Closed, pageRingAction(null, ringing = true))
        assertEquals(PageRingAction.None, pageRingAction(null, ringing = false))
        assertEquals(PageRingAction.None, pageRingAction(CallPhase.Ended, ringing = false))
    }

    @Test
    fun parsesTheServersTimestamp() {
        assertEquals(1_700_000_000_123L, parseIsoMillis("2023-11-14T22:13:20.123Z"))
        assertEquals(1_700_000_000_000L, parseIsoMillis("2023-11-14T22:13:20Z"))
    }

    @Test
    fun aBadTimestampIsNull() {
        assertNull(parseIsoMillis(null))
        assertNull(parseIsoMillis(""))
        assertNull(parseIsoMillis("yesterday"))
    }
}
