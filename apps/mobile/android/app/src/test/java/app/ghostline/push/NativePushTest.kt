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
            """{"kind":"message","chatId":"$chat","messageId":"m","seq":"42","title":"Алиса","body":"привет","sentAt":"x","actionToken":"t"}""",
        )
        assertEquals(NativePush.Message(chat, "Алиса", "привет"), push)
    }

    @Test
    fun parsesAnIncomingCallWithANullAvatar() {
        val push = NativePush.parse(
            """{"kind":"call:incoming","callId":"$call","chatId":"$chat","callerName":"Алиса","callerAvatarUrl":null,"video":true,"declineToken":"d","createdAt":"x"}""",
        )
        assertEquals(NativePush.CallIncoming(call, chat, "Алиса", true), push)
    }

    @Test
    fun parsesTheRemainingKinds() {
        assertEquals(NativePush.CallClosed(call), NativePush.parse("""{"kind":"call:closed","callId":"$call","reason":"ended"}"""))
        assertEquals(
            NativePush.CallMissed(call, chat, "Алиса"),
            NativePush.parse("""{"kind":"call:missed","callId":"$call","chatId":"$chat","callerName":"Алиса","video":false}"""),
        )
        assertEquals(NativePush.ChatRead(chat), NativePush.parse("""{"kind":"chat:read","chatId":"$chat","readSeq":"42"}"""))
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
