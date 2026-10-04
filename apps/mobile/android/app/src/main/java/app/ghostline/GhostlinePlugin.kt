package app.ghostline

import android.Manifest
import android.os.Build
import android.util.Base64
import android.util.Log
import app.ghostline.calls.CallSession
import app.ghostline.calls.LaunchActionStore
import app.ghostline.calls.NativeCallState
import app.ghostline.messages.MessageNotifier
import app.ghostline.push.DeviceKeyStore
import app.ghostline.push.PushNotifier
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

    /**
     * The page reports the call's phase (`NativeCallState` in `ghostline-plugin.ts`; `state` is absent or
     * null when there is no call). Native keeps the ongoing notification and the Telecom entry in step.
     */
    @PluginMethod
    fun setCallState(call: PluginCall) {
        val json = call.getObject("state")
        val state = json?.let(NativeCallState::parse)
        if (json != null && state == null) {
            // A state this build can't read (a newer page): keep what is running rather than tear it down.
            Log.w(PushNotifier.LOG_TAG, "ignoring a call state this build does not understand")
        } else {
            CallSession.reconcile(context, state)
        }
        call.resolve()
    }

    /** The answer/callback chosen before the page was up: `{action: {...}}` or `{action: null}`, once. */
    @PluginMethod
    fun consumeLaunchAction(call: PluginCall) {
        val action = LaunchActionStore.shared.consume(System.currentTimeMillis())
        call.resolve(JSObject().put("action", action?.toJson() ?: JSObject.NULL))
    }

    fun emitTokenChanged(token: String) {
        notifyListeners("pushTokenChanged", JSObject().put("token", token))
    }

    /**
     * Sends a `NativeCallCommand` to the page. `false` when nothing listens (the page isn't up yet), so
     * the caller can fall back to the launch-action store.
     */
    fun emitCommand(command: JSObject): Boolean {
        if (!hasListeners("callCommand")) return false
        notifyListeners("callCommand", command)
        return true
    }

    private fun granted() = JSObject().put("notifications", "granted")

    companion object {
        /** The live plugin, if the WebView is up; `FirebaseMessagingService` runs without it. */
        @Volatile
        var instance: GhostlinePlugin? = null
    }
}
