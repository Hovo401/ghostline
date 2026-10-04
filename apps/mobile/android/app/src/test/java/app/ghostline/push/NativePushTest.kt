package app.ghostline.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativePushTest {
    private val chat = "7f0c2f4e-0000-4000-8000-0000000000c1"
    private val call = "7f0c2f4e-0000-4000-8000-0000000000a1"

    @Test
    fun parsesAMessage() {
        val push = NativePush.parse(
            """{"kind":"message","chatId":"$chat","messageId":"m","seq":"42","title":"Алиса","body":"привет","sentAt":"2026-10-04T10:00:00.000Z","actionToken":"t"}""",
        )
        assertEquals(NativePush.Message(chat, "m", 42L, "Алиса", "привет", 1_791_108_000_000L, "t"), push)
    }

    @Test
    fun parsesAnIncomingCallWithANullAvatar() {
        val push = NativePush.parse(
            """{"kind":"call:incoming","callId":"$call","chatId":"$chat","callerName":"Алиса","callerAvatarUrl":null,"video":true,"declineToken":"d","createdAt":"2026-10-04T10:00:00.000Z"}""",
        )
        assertEquals(NativePush.CallIncoming(call, chat, "Алиса", null, true, "d", 1_791_108_000_000L), push)
    }

    @Test
    fun parsesAnIncomingCallWithAnAvatar() {
        val push = NativePush.parse(
            """{"kind":"call:incoming","callId":"$call","chatId":"$chat","callerName":"Алиса","callerAvatarUrl":"https://cdn.example/a.jpg?sig=1","video":false,"declineToken":"d","createdAt":"2026-10-04T10:00:00.000Z"}""",
        )
        assertEquals(NativePush.CallIncoming(call, chat, "Алиса", "https://cdn.example/a.jpg?sig=1", false, "d", 1_791_108_000_000L), push)
    }

    @Test
    fun parsesTheRemainingKinds() {
        assertEquals(NativePush.CallClosed(call, false), NativePush.parse("""{"kind":"call:closed","callId":"$call","reason":"ended"}"""))
        assertEquals(
            NativePush.CallClosed(call, true),
            NativePush.parse("""{"kind":"call:closed","callId":"$call","reason":"answered-elsewhere"}"""),
        )
        assertEquals(
            NativePush.CallMissed(call, chat, "Алиса", false),
            NativePush.parse("""{"kind":"call:missed","callId":"$call","chatId":"$chat","callerName":"Алиса","video":false}"""),
        )
        assertEquals(NativePush.ChatRead(chat, 42L),NativePush.parse("""{"kind":"chat:read","chatId":"$chat","readSeq":"42"}"""))
        assertEquals(NativePush.Test, NativePush.parse("""{"kind":"test"}"""))
        assertEquals(NativePush.TestCall("Ghostline"), NativePush.parse("""{"kind":"test-call","callerName":"Ghostline"}"""))
    }

    @Test
    fun ignoresAnUnknownKindAndMalformedJson() {
        assertNull(NativePush.parse("""{"kind":"from-the-future"}"""))
        assertNull(NativePush.parse("""{"kind":"message"}"""))
        assertNull(NativePush.parse("not json"))
    }
}
