package app.ghostline.calls

import android.media.AudioManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HoldLogicTest {
    private fun call(id: String = "c1", phase: CallPhase = CallPhase.Active) =
        NativeCallState(id, "chat", phase, video = false, peerName = "Анна", answeredAt = null, muted = false)

    @Test
    fun anActiveOrReconnectingCallGoesOnHold() {
        assertTrue(shouldApplyHold(call(phase = CallPhase.Active), null, "c1", hold = true))
        assertTrue(shouldApplyHold(call(phase = CallPhase.Reconnecting), null, "c1", hold = true))
    }

    @Test
    fun noHoldInAPhaseThePageIgnores() {
        for (phase in listOf(CallPhase.Outgoing, CallPhase.Incoming, CallPhase.Connecting, CallPhase.Ended)) {
            assertFalse("$phase", shouldApplyHold(call(phase = phase), null, "c1", hold = true))
        }
    }

    @Test
    fun aRepeatChangesNothing() {
        assertFalse(shouldApplyHold(call(), heldCallId = "c1", callId = "c1", hold = true))
        assertFalse(shouldApplyHold(call(), heldCallId = null, callId = "c1", hold = false))
    }

    @Test
    fun noCallOrAnotherCallChangesNothing() {
        assertFalse(shouldApplyHold(null, null, "c1", hold = true))
        assertFalse(shouldApplyHold(call(id = "c2"), null, "c1", hold = true))
        assertFalse(shouldApplyHold(call(id = "c2"), "c1", "c1", hold = false))
    }

    @Test
    fun aHeldCallResumesWhateverItsPhase() {
        assertTrue(shouldApplyHold(call(phase = CallPhase.Connecting), heldCallId = "c1", callId = "c1", hold = false))
    }

    @Test
    fun disconnectsAreTold_apart() {
        // The app ended it itself: the echo.
        assertEquals(DisconnectAction.Ignore, disconnectAction(incoming = true, answered = false, ending = true))
        assertEquals(DisconnectAction.Ignore, disconnectAction(incoming = false, answered = true, ending = true))
        // Still ringing: a rejection.
        assertEquals(DisconnectAction.Decline, disconnectAction(incoming = true, answered = false, ending = false))
        // Everything else is a hang-up of a call in progress.
        assertEquals(DisconnectAction.Hangup, disconnectAction(incoming = true, answered = true, ending = false))
        assertEquals(DisconnectAction.Hangup, disconnectAction(incoming = false, answered = false, ending = false))
        assertEquals(DisconnectAction.Hangup, disconnectAction(incoming = false, answered = true, ending = false))
    }

    @Test
    fun theCallIsNotTakenBackWhileAGsmCallIsOn() {
        assertTrue(canTryResume(AudioManager.MODE_NORMAL))
        assertTrue(canTryResume(AudioManager.MODE_IN_COMMUNICATION))
        assertFalse(canTryResume(AudioManager.MODE_IN_CALL))
        assertFalse(canTryResume(AudioManager.MODE_RINGTONE))
    }

    @Test
    fun aReloadedPageIsToldAgainThatItsCallIsHeld() {
        assertTrue(shouldResendHold(call(phase = CallPhase.Active), "c1"))
        assertTrue(shouldResendHold(call(phase = CallPhase.Reconnecting), "c1"))
        assertFalse(shouldResendHold(call(phase = CallPhase.Connecting), "c1"))
        assertFalse(shouldResendHold(call(id = "c2"), "c1"))
        assertFalse(shouldResendHold(call(), null))
        assertFalse(shouldResendHold(null, "c1"))
    }

    @Test
    fun aHeldCallIsAnsweredThroughTheLivePageWhenThereIsOne() {
        assertEquals(AnswerPlan(keepInStore = false, carryAction = false), planAnswer(delivered = true))
        assertEquals(AnswerPlan(keepInStore = true, carryAction = true), planAnswer(delivered = false))
    }

    private val all = listOf(AudioRoute.Earpiece, AudioRoute.Speaker)

    @Test
    fun theDefaultIsRequestedOnlyWhenTheSoundIsNotThereAlready() {
        assertEquals(RouteDecision(null, AudioRoute.Earpiece), decideRoute(false, all, null, null))
        assertEquals(RouteDecision(null, null), decideRoute(false, all, null, AudioRoute.Earpiece))
        assertEquals(RouteDecision(null, AudioRoute.Speaker), decideRoute(true, all, null, AudioRoute.Earpiece))
    }

    @Test
    fun aChoiceWhoseDeviceLeftIsDroppedAndTheDefaultComesBack() {
        val decision = decideRoute(false, all, AudioRoute.Bluetooth, AudioRoute.Speaker)
        assertEquals(RouteDecision(null, AudioRoute.Earpiece), decision)
    }

    @Test
    fun aKeptChoiceIsNotAskedForAgain() {
        assertEquals(RouteDecision(AudioRoute.Speaker, null), decideRoute(false, all, AudioRoute.Speaker, AudioRoute.Speaker))
    }

    @Test
    fun aRouteTheListDoesNotOfferIsLeftAlone() {
        // The system put the call on a Bluetooth headset we can't list: do not pull it into the earpiece.
        assertEquals(RouteDecision(null, null), decideRoute(false, all, null, AudioRoute.Bluetooth))
    }
}
