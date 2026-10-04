package app.ghostline.system

import android.app.Activity
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/** The phone settings behind the "Чтобы не пропускать звонки" checklist (FR-APP-07). */
object SystemSettings {

    data class Status(
        val notifications: Boolean,
        /** `null` before Android 14: the permission doesn't exist and the screen always works. */
        val fullScreenCalls: Boolean?,
        val unrestrictedBattery: Boolean,
        /** The OEM whose autostart list may kill us, `null` for stock-like firmware. */
        val oem: String?,
    )

    fun status(context: Context): Status {
        val fullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
        } else {
            null
        }
        val power = context.getSystemService(PowerManager::class.java)
        return Status(
            notifications = NotificationManagerCompat.from(context).areNotificationsEnabled(),
            fullScreenCalls = fullScreen,
            unrestrictedBattery = power.isIgnoringBatteryOptimizations(context.packageName),
            oem = oemOf(Build.MANUFACTURER),
        )
    }

    /** Which autostart family a `Build.MANUFACTURER` belongs to. */
    fun oemOf(manufacturer: String): String? = when (manufacturer.lowercase()) {
        "xiaomi", "redmi", "poco" -> "xiaomi"
        "huawei", "honor" -> "huawei"
        "oppo", "realme", "oneplus" -> "oppo"
        "vivo", "iqoo" -> "vivo"
        "samsung" -> "samsung"
        else -> null
    }

    /** `false` when no settings screen could be opened for [kind]. */
    fun open(activity: Activity, kind: String): Boolean {
        val pkg = Uri.parse("package:${activity.packageName}")
        val candidates: List<Intent> = when (kind) {
            "notifications" -> listOf(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName),
            )
            "fullScreenCalls" -> listOf(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
                } else {
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
                },
            )
            "battery" -> listOf(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg),
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            )
            "autostart" -> autostartIntents(oemOf(Build.MANUFACTURER)) +
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
            else -> return false
        }
        return candidates.any { start(activity, it) }
    }

    private fun autostartIntents(oem: String?): List<Intent> {
        val component = when (oem) {
            "xiaomi" -> "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity"
            "huawei" -> "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            "oppo" -> "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity"
            "vivo" -> "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
            "samsung" -> "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity"
            else -> return emptyList()
        }
        return listOf(Intent().setComponent(ComponentName(component.first, component.second)))
    }

    private fun start(activity: Activity, intent: Intent): Boolean = try {
        activity.startActivity(intent)
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        // A vendor activity that isn't exported to us.
        false
    }
}
