package app.ghostline.calls

import android.media.AudioDeviceInfo
import androidx.core.telecom.CallEndpointCompat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioRouteLogicTest {
    private val all = listOf(AudioRoute.Earpiece, AudioRoute.Speaker)
    private val android11 = 30
    private val android12 = 31

    private fun call(video: Boolean = false, phase: CallPhase = CallPhase.Active) =
        NativeCallState("c", "chat", phase, video, "Анна", answeredAt = null, muted = false)

    @Test
    fun telecomEndpointsMapToRoutes() {
        assertEquals(AudioRoute.Earpiece, routeOfEndpointType(CallEndpointCompat.TYPE_EARPIECE))
        assertEquals(AudioRoute.Speaker, routeOfEndpointType(CallEndpointCompat.TYPE_SPEAKER))
        assertEquals(AudioRoute.Bluetooth, routeOfEndpointType(CallEndpointCompat.TYPE_BLUETOOTH))
        assertEquals(AudioRoute.Wired, routeOfEndpointType(CallEndpointCompat.TYPE_WIRED_HEADSET))
        assertNull(routeOfEndpointType(CallEndpointCompat.TYPE_STREAMING))
        assertNull(routeOfEndpointType(CallEndpointCompat.TYPE_UNKNOWN))
    }

    @Test
    fun audioDevicesMapToRoutes() {
        assertEquals(AudioRoute.Earpiece, routeOfDeviceType(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE))
        assertEquals(AudioRoute.Speaker, routeOfDeviceType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER))
        for (type in listOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET)) {
            assertEquals(AudioRoute.Wired, routeOfDeviceType(type))
        }
        for (type in listOf(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_HEARING_AID)) {
            assertEquals(AudioRoute.Bluetooth, routeOfDeviceType(type))
        }
        assertNull(routeOfDeviceType(AudioDeviceInfo.TYPE_HDMI))
        assertNull(routeOfDeviceType(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP))
    }

    @Test
    fun a2dpCountsAsABluetoothDeviceAroundEvenThoughItCannotCarryACall() {
        assertTrue(isBluetoothDeviceType(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP))
        assertTrue(isBluetoothDeviceType(AudioDeviceInfo.TYPE_BLUETOOTH_SCO))
        assertFalse(isBluetoothDeviceType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER))
    }

    @Test
    fun audioStartsInTheEarpieceAndVideoOnTheSpeaker() {
        assertEquals(AudioRoute.Earpiece, pickRoute(video = false, available = all, userChoice = null))
        assertEquals(AudioRoute.Speaker, pickRoute(video = true, available = all, userChoice = null))
    }

    @Test
    fun aConnectedHeadsetBeatsTheDefaultAndWiredBeatsBluetooth() {
        assertEquals(AudioRoute.Bluetooth, pickRoute(false, all + AudioRoute.Bluetooth, null))
        assertEquals(AudioRoute.Bluetooth, pickRoute(true, all + AudioRoute.Bluetooth, null))
        assertEquals(AudioRoute.Wired, pickRoute(false, all + AudioRoute.Bluetooth + AudioRoute.Wired, null))
    }

    @Test
    fun theUsersOwnPickIsNotOverriddenWhileItIsConnected() {
        val withHeadset = all + AudioRoute.Bluetooth
        assertEquals(AudioRoute.Speaker, pickRoute(false, withHeadset, userChoice = AudioRoute.Speaker))
        assertEquals(AudioRoute.Earpiece, pickRoute(true, withHeadset, userChoice = AudioRoute.Earpiece))
    }

    @Test
    fun aPickedDeviceThatWentAwayFallsBackToTheDefault() {
        assertEquals(AudioRoute.Earpiece, pickRoute(false, all, userChoice = AudioRoute.Bluetooth))
    }

    @Test
    fun aPhoneWithoutAnEarpieceUsesTheSpeakerAndNothingUsableIsNull() {
        assertEquals(AudioRoute.Speaker, pickRoute(false, listOf(AudioRoute.Speaker), null))
        assertNull(pickRoute(false, emptyList(), null))
    }

    @Test
    fun theListHasOneEntryPerRouteInAStableOrder() {
        val shown = visibleRoutes(
            listOf(
                RouteOption(AudioRoute.Wired, "Наушники"),
                RouteOption(AudioRoute.Bluetooth, "Buds"),
                RouteOption(AudioRoute.Speaker, ""),
                RouteOption(AudioRoute.Bluetooth, "Car"),
                RouteOption(AudioRoute.Earpiece, ""),
            ),
            current = AudioRoute.Bluetooth,
            bluetoothAllowed = true,
        )
        assertEquals(listOf(AudioRoute.Earpiece, AudioRoute.Speaker, AudioRoute.Bluetooth, AudioRoute.Wired), shown.available.map { it.route })
        assertEquals("Buds", shown.available.first { it.route == AudioRoute.Bluetooth }.name)
        assertEquals(AudioRoute.Bluetooth, shown.current)
    }

    @Test
    fun withoutTheBluetoothPermissionBluetoothIsNotListedAndNotCurrent() {
        val shown = visibleRoutes(
            listOf(RouteOption(AudioRoute.Earpiece, ""), RouteOption(AudioRoute.Bluetooth, "Buds")),
            current = AudioRoute.Bluetooth,
            bluetoothAllowed = false,
        )
        assertEquals(listOf(AudioRoute.Earpiece), shown.available.map { it.route })
        assertNull(shown.current)
    }

    @Test
    fun theBluetoothPermissionIsAskedOnceAndOnlyWhenItMatters() {
        assertTrue(shouldAskBluetoothPermission(android12, granted = false, bluetoothDevicePresent = true, alreadyAsked = false))
        assertFalse(shouldAskBluetoothPermission(android11, granted = false, bluetoothDevicePresent = true, alreadyAsked = false))
        assertFalse(shouldAskBluetoothPermission(android12, granted = true, bluetoothDevicePresent = true, alreadyAsked = false))
        assertFalse(shouldAskBluetoothPermission(android12, granted = false, bluetoothDevicePresent = false, alreadyAsked = false))
        assertFalse(shouldAskBluetoothPermission(android12, granted = false, bluetoothDevicePresent = true, alreadyAsked = true))
    }

    @Test
    fun theScreenGoesDarkOnlyForAnAudioCallThroughTheEarpiece() {
        assertTrue(shouldHoldProximity(call(), AudioRoute.Earpiece))
        assertTrue(shouldHoldProximity(call(phase = CallPhase.Connecting), AudioRoute.Earpiece))
        assertFalse(shouldHoldProximity(call(video = true), AudioRoute.Earpiece))
        assertFalse(shouldHoldProximity(call(), AudioRoute.Speaker))
        assertFalse(shouldHoldProximity(call(), AudioRoute.Bluetooth))
        assertFalse(shouldHoldProximity(call(), AudioRoute.Wired))
        assertFalse(shouldHoldProximity(call(), null))
        assertFalse(shouldHoldProximity(null, AudioRoute.Earpiece))
    }

    @Test
    fun noProximityLockWhileDiallingReconnectingOrRinging() {
        for (phase in listOf(CallPhase.Outgoing, CallPhase.Incoming, CallPhase.Reconnecting, CallPhase.Ended)) {
            assertFalse("$phase", shouldHoldProximity(call(phase = phase), AudioRoute.Earpiece))
        }
    }

    @Test
    fun routeNamesRoundTripThroughTheWireFormat() {
        for (route in AudioRoute.entries) assertEquals(route, AudioRoute.parse(route.wire))
        assertNull(AudioRoute.parse("teleporter"))
        assertNull(AudioRoute.parse(null))
    }
}
