package app.ghostline.calls

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativeCallStateTest {
    @Test
    fun parsesWhatThePageSends() {
        val state = NativeCallState.parse(
            JSONObject(
                """{"callId":"c1","chatId":"chat1","phase":"active","video":true,"peerName":"Анна","answeredAt":1700000000000,"muted":true}""",
            ),
        )
        assertEquals(
            NativeCallState("c1", "chat1", CallPhase.Active, video = true, peerName = "Анна", answeredAt = 1_700_000_000_000, muted = true),
            state,
        )
    }

    @Test
    fun anUnansweredCallHasNullOrMissingAnsweredAt() {
        val explicitNull = NativeCallState.parse(
            JSONObject("""{"callId":"c1","chatId":"x","phase":"outgoing","video":false,"peerName":"A","answeredAt":null,"muted":false}"""),
        )
        val missing = NativeCallState.parse(JSONObject("""{"callId":"c1","chatId":"x","phase":"connecting","peerName":"A"}"""))
        assertNull(explicitNull?.answeredAt)
        assertNull(missing?.answeredAt)
    }

    @Test
    fun everyPhaseOfTheContractParses() {
        for (wire in listOf("outgoing", "incoming", "connecting", "active", "reconnecting", "ended")) {
            val state = NativeCallState.parse(JSONObject("""{"callId":"c","phase":"$wire"}"""))
            assertEquals(wire, state?.phase?.wire)
        }
    }

    @Test
    fun holdIsNativeOwnAndNeverComesFromThePage() {
        val state = NativeCallState.parse(JSONObject("""{"callId":"c","phase":"active","held":true}"""))
        assertEquals(false, state?.held)
    }

    @Test
    fun anIncomingStateCarriesCreatedAtAndAvatar() {
        val state = NativeCallState.parse(
            JSONObject(
                """{"callId":"c1","chatId":"x","phase":"incoming","peerName":"A","createdAt":"2023-11-14T22:13:20.000Z","callerAvatarUrl":"https://h/a.png"}""",
            ),
        )
        assertEquals(1_700_000_000_000L, state?.createdAt)
        assertEquals("https://h/a.png", state?.callerAvatarUrl)
    }

    @Test
    fun createdAtAndAvatarAreNullWhenAbsentOrNull() {
        val missing = NativeCallState.parse(JSONObject("""{"callId":"c1","phase":"incoming"}"""))
        val explicit = NativeCallState.parse(JSONObject("""{"callId":"c1","phase":"incoming","createdAt":null,"callerAvatarUrl":null}"""))
        assertNull(missing?.createdAt)
        assertNull(missing?.callerAvatarUrl)
        assertNull(explicit?.createdAt)
        assertNull(explicit?.callerAvatarUrl)
    }

    @Test
    fun aStateNativeCannotReadIsNull() {
        assertNull(NativeCallState.parse(JSONObject("""{"callId":"c1","phase":"teleporting"}""")))
        assertNull(NativeCallState.parse(JSONObject("""{"phase":"active"}""")))
        assertNull(NativeCallState.parse(JSONObject("""{"callId":"","phase":"active"}""")))
    }
}
