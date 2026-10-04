package app.ghostline.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PipLogicTest {
    private fun call(phase: CallPhase = CallPhase.Active, video: Boolean = true, muted: Boolean = false) =
        NativeCallState("c1", "chat1", phase, video, "Anna", answeredAt = 1_000L, muted = muted)

    @Test
    fun onlyAnUpVideoCallMayEnterPip() {
        assertTrue(pipAllowed(call(CallPhase.Active)))
        assertTrue(pipAllowed(call(CallPhase.Reconnecting)))
        for (phase in listOf(CallPhase.Outgoing, CallPhase.Incoming, CallPhase.Connecting, CallPhase.Ended)) {
            assertFalse("$phase", pipAllowed(call(phase)))
        }
    }

    @Test
    fun anAudioCallOrNoCallNeverEntersPip() {
        assertFalse(pipAllowed(call(video = false)))
        assertFalse(pipAllowed(null))
    }

    @Test
    fun actionsFollowTheMicState() {
        assertEquals(listOf(PipAction.Mute, PipAction.Hangup), pipActions(call(muted = false)))
        assertEquals(listOf(PipAction.Unmute, PipAction.Hangup), pipActions(call(muted = true)))
    }

    @Test
    fun noActionsWhenPipIsNotAllowed() {
        assertEquals(emptyList<PipAction>(), pipActions(call(video = false)))
        assertEquals(emptyList<PipAction>(), pipActions(null))
    }

    @Test
    fun aspectRatioIsPortraitNineBySixteen() {
        assertEquals(9, PIP_ASPECT_WIDTH)
        assertEquals(16, PIP_ASPECT_HEIGHT)
    }

    @Test
    fun closingThePipWindowEndsOnlyACallThatWasInPip() {
        assertTrue(endsCallOnPipClose(wasInPip = true, call()))
        assertFalse(endsCallOnPipClose(wasInPip = false, call()))
        assertFalse(endsCallOnPipClose(wasInPip = true, null))
    }
}
