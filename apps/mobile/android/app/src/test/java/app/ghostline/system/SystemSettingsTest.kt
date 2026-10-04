package app.ghostline.system

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SystemSettingsTest {
    @Test
    fun groupsManufacturersByAutostartFamily() {
        assertEquals("xiaomi", SystemSettings.oemOf("Xiaomi"))
        assertEquals("xiaomi", SystemSettings.oemOf("POCO"))
        assertEquals("huawei", SystemSettings.oemOf("HONOR"))
        assertEquals("oppo", SystemSettings.oemOf("realme"))
        assertEquals("vivo", SystemSettings.oemOf("vivo"))
        assertEquals("samsung", SystemSettings.oemOf("samsung"))
    }

    @Test
    fun stockFirmwareHasNoAutostartList() {
        assertNull(SystemSettings.oemOf("Google"))
        assertNull(SystemSettings.oemOf("motorola"))
    }
}
