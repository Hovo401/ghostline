package app.ghostline.push

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The per-install identity the backend encrypts FCM payloads for (ADR-0017):
 * a stable `deviceId` and a random 32-byte AES key. The key never touches disk in the clear — it is
 * wrapped with a non-exportable Android Keystore key and only the wrapped blob is stored.
 */
class DeviceKeyStore private constructor(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private var cachedKey: ByteArray? = null

    @Synchronized
    fun deviceId(): String =
        prefs.getString(KEY_DEVICE_ID, null)
            ?: UUID.randomUUID().toString().also { prefs.edit().putString(KEY_DEVICE_ID, it).apply() }

    @Synchronized
    fun deviceKey(): ByteArray {
        cachedKey?.let { return it }
        val key = unwrap(prefs.getString(KEY_WRAPPED, null)) ?: generate()
        cachedKey = key
        return key
    }

    private fun generate(): ByteArray {
        val key = ByteArray(KEY_BYTES).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, wrappingKey()) }
        val wrapped = cipher.iv + cipher.doFinal(key)
        prefs.edit().putString(KEY_WRAPPED, Base64.encodeToString(wrapped, Base64.NO_WRAP)).apply()
        return key
    }

    /** `null` when nothing is stored or the Keystore lost its key — the caller mints a new one. */
    private fun unwrap(stored: String?): ByteArray? {
        if (stored == null) return null
        return try {
            val blob = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.DECRYPT_MODE, wrappingKey(), GCMParameterSpec(128, blob, 0, IV_BYTES))
            }
            cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
        } catch (_: Exception) {
            null
        }
    }

    private fun wrappingKey(): SecretKey {
        val store = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (store.getKey(WRAP_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                WRAP_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFS = "ghostline_push"
        private const val KEY_DEVICE_ID = "deviceId"
        private const val KEY_WRAPPED = "wrappedDeviceKey"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val WRAP_ALIAS = "ghostline_push_wrap"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_BYTES = 32
        private const val IV_BYTES = 12

        @Volatile
        private var instance: DeviceKeyStore? = null

        fun get(context: Context): DeviceKeyStore =
            instance ?: synchronized(this) {
                instance ?: DeviceKeyStore(context.applicationContext).also { instance = it }
            }
    }
}
