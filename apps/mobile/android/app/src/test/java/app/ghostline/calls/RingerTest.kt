package app.ghostline.calls

import android.app.NotificationManager.INTERRUPTION_FILTER_ALARMS
import android.app.NotificationManager.INTERRUPTION_FILTER_ALL
import android.app.NotificationManager.INTERRUPTION_FILTER_NONE
import android.app.NotificationManager.INTERRUPTION_FILTER_PRIORITY
import android.media.AudioManager.RINGER_MODE_NORMAL
import android.media.AudioManager.RINGER_MODE_SILENT
import android.media.AudioManager.RINGER_MODE_VIBRATE
import org.junit.Assert.assertEquals
import org.junit.Test

class RingerTest {
    @Test
    fun ringsInNormalModeWithoutDnd() {
        assertEquals(RingPolicy.Ring, Ringer.decide(RINGER_MODE_NORMAL, INTERRUPTION_FILTER_ALL))
    }

    @Test
    fun silentRingerWinsOverEverything() {
        assertEquals(RingPolicy.Silent, Ringer.decide(RINGER_MODE_SILENT, INTERRUPTION_FILTER_ALL))
    }

    @Test
    fun vibrateModeOnlyVibrates() {
        assertEquals(RingPolicy.VibrateOnly, Ringer.decide(RINGER_MODE_VIBRATE, INTERRUPTION_FILTER_ALL))
    }

    @Test
    fun anyDoNotDisturbFilterKeepsItQuiet() {
        for (filter in listOf(INTERRUPTION_FILTER_PRIORITY, INTERRUPTION_FILTER_ALARMS, INTERRUPTION_FILTER_NONE)) {
            assertEquals(RingPolicy.Silent, Ringer.decide(RINGER_MODE_NORMAL, filter))
        }
    }
}
