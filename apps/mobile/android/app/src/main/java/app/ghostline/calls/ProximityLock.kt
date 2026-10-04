package app.ghostline.calls

import android.content.Context
import android.os.PowerManager

/**
 * The screen goes dark when the phone is held to the ear (`PROXIMITY_SCREEN_OFF_WAKE_LOCK`). Owned by
 * [OngoingCallService]; whether it should be held is [shouldHoldProximity]'s call. A phone without a
 * proximity sensor simply never holds it.
 */
class ProximityLock(context: Context) {
    private val lock: PowerManager.WakeLock? = context.getSystemService(PowerManager::class.java)
        .takeIf { it.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK) }
        ?.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "ghostline:call-proximity")
        ?.apply { setReferenceCounted(false) }

    fun hold(on: Boolean) {
        val wake = lock ?: return
        if (on && !wake.isHeld) wake.acquire(MAX_HOLD_MS) else if (!on && wake.isHeld) wake.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY)
    }

    private companion object {
        // A safety net: the service releases it on every state change and in onDestroy.
        const val MAX_HOLD_MS = 4 * 60 * 60 * 1000L
    }
}
