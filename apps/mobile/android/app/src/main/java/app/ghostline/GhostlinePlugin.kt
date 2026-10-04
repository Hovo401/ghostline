package app.ghostline

import android.Manifest
import android.os.Build
import android.util.Base64
import app.ghostline.messages.MessageNotifier
import app.ghostline.push.DeviceKeyStore
import app.ghostline.system.SystemSettings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/**
 * The JS ↔ native bridge (ADR-0017). Platform-neutral API: the web side only sees
 * `getPushRegistration`, the notification permission and the `pushTokenChanged` event.
 */
@CapacitorPlugin(
    name = "Ghostline",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class GhostlinePlugin : Plugin() {

    override fun load() {
        instance = this
    }

    override fun handleOnDestroy() {
        if (instance === this) instance = null
    }

    @PluginMethod
    fun getPushRegistration(call: PluginCall) {
        // No google-services.json in this build: Firebase never initialised.
        if (FirebaseApp.getApps(context).isEmpty()) {
            call.reject("Push is not available in this build", "UNAVAILABLE")
            return
        }
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val token = task.result
            if (!task.isSuccessful || token == null) {
                call.reject("Could not get an FCM token", "UNAVAILABLE", task.exception)
                return@addOnCompleteListener
            }
            val store = DeviceKeyStore.get(context)
            call.resolve(
                JSObject()
                    .put("token", token)
                    .put("deviceKey", Base64.encodeToString(store.deviceKey(), Base64.NO_WRAP))
                    .put("deviceId", store.deviceId()),
            )
        }
    }

    // Before Android 13 there is no runtime notification permission.
    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(granted())
        } else {
            super.checkPermissions(call)
        }
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(granted())
        } else {
            super.requestPermissions(call)
        }
    }

    @PluginMethod
    fun getPermissionStatus(call: PluginCall) {
        val s = SystemSettings.status(context)
        val result = JSObject()
            .put("notifications", s.notifications)
            .put("unrestrictedBattery", s.unrestrictedBattery)
            .put("oem", s.oem)
        // Absent (not false) before Android 14, so the page hides the row.
        s.fullScreenCalls?.let { result.put("fullScreenCalls", it) }
        call.resolve(result)
    }

    @PluginMethod
    fun openSystemSettings(call: PluginCall) {
        val kind = call.getString("kind")
        if (kind == null || !SystemSettings.open(activity, kind)) {
            call.reject("No settings screen for ${kind ?: "?"}", "UNAVAILABLE")
            return
        }
        call.resolve()
    }

    /** Logout: drops every chat notification and the text kept for them. */
    @PluginMethod
    fun clearNotifications(call: PluginCall) {
        MessageNotifier.clearAll(context)
        call.resolve()
    }

    fun emitTokenChanged(token: String) {
        notifyListeners("pushTokenChanged", JSObject().put("token", token))
    }

    private fun granted() = JSObject().put("notifications", "granted")

    companion object {
        /** The live plugin, if the WebView is up; `FirebaseMessagingService` runs without it. */
        @Volatile
        var instance: GhostlinePlugin? = null
    }
}
