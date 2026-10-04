package app.ghostline.calls

import android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
import android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
import android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
import org.junit.Assert.assertEquals
import org.junit.Test

class OngoingCallLogicTest {
    private val android14 = 34
    private val android10 = 29

    @Test
    fun phoneCallAlwaysMicrophoneOnlyWithItsPermission() {
        assertEquals(
            FOREGROUND_SERVICE_TYPE_PHONE_CALL,
            ongoingForegroundTypes(android14, micGranted = false, cameraGranted = false, video = false),
        )
        assertEquals(
            FOREGROUND_SERVICE_TYPE_PHONE_CALL or FOREGROUND_SERVICE_TYPE_MICROPHONE,
            ongoingForegroundTypes(android14, micGranted = true, cameraGranted = false, video = false),
        )
    }

    @Test
    fun cameraNeedsBothAVideoCallAndThePermission() {
        val audioOnly = FOREGROUND_SERVICE_TYPE_PHONE_CALL or FOREGROUND_SERVICE_TYPE_MICROPHONE
        // Permission without a video call, and a video call without the permission: no camera type.
        assertEquals(audioOnly, ongoingForegroundTypes(android14, micGranted = true, cameraGranted = true, video = false))
        assertEquals(audioOnly, ongoingForegroundTypes(android14, micGranted = true, cameraGranted = false, video = true))
        assertEquals(
            audioOnly or FOREGROUND_SERVICE_TYPE_CAMERA,
            ongoingForegroundTypes(android14, micGranted = true, cameraGranted = true, video = true),
        )
    }

    @Test
    fun aVideoCallWithoutTheMicrophoneStillGetsTheCamera() {
        assertEquals(
            FOREGROUND_SERVICE_TYPE_PHONE_CALL or FOREGROUND_SERVICE_TYPE_CAMERA,
            ongoingForegroundTypes(android14, micGranted = false, cameraGranted = true, video = true),
        )
    }

    @Test
    fun beforeAndroid11OnlyPhoneCallExists() {
        assertEquals(
            FOREGROUND_SERVICE_TYPE_PHONE_CALL,
            ongoingForegroundTypes(android10, micGranted = true, cameraGranted = true, video = true),
        )
    }

    @Test
    fun anAnsweredCallSaysItIsInProgressWithThePeer() {
        assertEquals("Идёт звонок", ongoingStatus(CallPhase.Active, answeredAt = 1_000))
        assertEquals("Идёт звонок · Анна", ongoingTitle(CallPhase.Active, answeredAt = 1_000, peerName = "Анна"))
    }

    @Test
    fun beforeTheAnswerTheNotificationSaysDiallingOrConnecting() {
        assertEquals("Вызов… · Анна", ongoingTitle(CallPhase.Outgoing, answeredAt = null, peerName = "Анна"))
        assertEquals("Соединение… · Анна", ongoingTitle(CallPhase.Connecting, answeredAt = null, peerName = "Анна"))
    }

    @Test
    fun reconnectingKeepsItsOwnWordingWithOrWithoutATimer() {
        assertEquals("Переподключение…", ongoingStatus(CallPhase.Reconnecting, answeredAt = 1_000))
        assertEquals("Переподключение…", ongoingStatus(CallPhase.Reconnecting, answeredAt = null))
    }

    @Test
    fun aHeldCallSaysSoWhateverThePhase() {
        assertEquals("На удержании", ongoingStatus(CallPhase.Active, answeredAt = 1_000, held = true))
        assertEquals("На удержании", ongoingStatus(CallPhase.Reconnecting, answeredAt = null, held = true))
        assertEquals("На удержании · Анна", ongoingTitle(CallPhase.Active, answeredAt = 1_000, peerName = "Анна", held = true))
    }

    @Test
    fun aBlankPeerNameLeavesJustTheStatus() {
        assertEquals("Вызов…", ongoingTitle(CallPhase.Outgoing, answeredAt = null, peerName = "  "))
    }

    @Test
    fun muteLabelFollowsTheState() {
        assertEquals("Микрофон", muteActionLabel(muted = false))
        assertEquals("Микрофон выкл.", muteActionLabel(muted = true))
    }

    @Test
    fun theTimerNeverStartsInTheFuture() {
        assertEquals(5_000L, chronometerBase(answeredAtMs = 5_000, nowMs = 9_000))
        assertEquals(9_000L, chronometerBase(answeredAtMs = 12_000, nowMs = 9_000))
    }
}
