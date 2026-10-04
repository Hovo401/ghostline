package app.ghostline.push

import java.util.Base64
import javax.crypto.AEADBadTagException
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

/** Decrypts what the backend's `encryptNativePush` produced — packages/contracts/fixtures/native-push.json. */
class PushCryptoTest {

    private val cases: List<JSONObject> = run {
        val text = javaClass.classLoader!!.getResourceAsStream("native-push.json")!!
            .readBytes().toString(Charsets.UTF_8)
        val array = JSONArray(text)
        (0 until array.length()).map { array.getJSONObject(it) }
    }

    // The android.jar stub of JSONObject has no `similar`; payloads here are flat, so a map is enough.
    private fun JSONObject.asMap(): Map<String, Any?> = keys().asSequence().associateWith { get(it) }

    private fun decrypt(case: JSONObject, deviceId: String = case.getString("deviceId")): String {
        val envelope = case.getJSONObject("envelope")
        return PushCrypto.decrypt(
            envelope.getString("iv"),
            envelope.getString("ct"),
            Base64.getDecoder().decode(case.getString("keyBase64")),
            deviceId,
        )
    }

    @Test
    fun decryptsEveryFixtureToItsPayload() {
        assertTrue(cases.isNotEmpty())
        for (case in cases) {
            val plain = JSONObject(decrypt(case))
            assertEquals(case.getString("name"), case.getJSONObject("payload").asMap(), plain.asMap())
        }
    }

    @Test
    fun keepsUtf8Intact() {
        val message = cases.first { it.getString("name").startsWith("message") }
        assertEquals("Привет! Как дела? 👋", JSONObject(decrypt(message)).getString("body"))
    }

    @Test
    fun rejectsAnotherDevicesId() {
        assertThrows(AEADBadTagException::class.java) {
            decrypt(cases.first(), deviceId = "7f0c2f4e-0000-4000-8000-0000000000d2")
        }
    }

    @Test
    fun rejectsATamperedMessage() {
        val case = cases.first()
        val envelope = case.getJSONObject("envelope")
        val ct = Base64.getDecoder().decode(envelope.getString("ct"))
        ct[0] = (ct[0].toInt() xor 1).toByte()
        assertThrows(AEADBadTagException::class.java) {
            PushCrypto.decrypt(
                envelope.getString("iv"),
                Base64.getEncoder().encodeToString(ct),
                Base64.getDecoder().decode(case.getString("keyBase64")),
                case.getString("deviceId"),
            )
        }
    }
}
