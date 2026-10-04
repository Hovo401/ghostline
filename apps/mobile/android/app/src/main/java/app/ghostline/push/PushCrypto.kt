package app.ghostline.push

import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Mirror of the backend's `encryptNativePush` (apps/backend/src/jobs/native-push.ts):
 * AES-256-GCM, the device's `deviceId` as AAD, the 16-byte tag at the end of `ct`.
 * Pure JVM (no Android API) so the shared fixtures in packages/contracts/fixtures test it.
 */
object PushCrypto {
    private const val TAG_BITS = 128

    /** Throws `AEADBadTagException` for a wrong key/device or a tampered message. */
    fun decrypt(ivBase64: String, ctBase64: String, key: ByteArray, deviceId: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(TAG_BITS, Base64.getDecoder().decode(ivBase64)),
        )
        cipher.updateAAD(deviceId.toByteArray(Charsets.UTF_8))
        return String(cipher.doFinal(Base64.getDecoder().decode(ctBase64)), Charsets.UTF_8)
    }
}
