package app.ghostline.messages

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationActionApiTest {
    @Test
    fun apiBaseKeepsOriginAndDropsThePath() {
        assertEquals("https://ghostline.diotek.pp.ua/api/v1", NotificationActionApi.apiBase("https://ghostline.diotek.pp.ua/app"))
    }

    @Test
    fun apiBaseKeepsAPortAndScheme() {
        assertEquals("http://localhost:8080/api/v1", NotificationActionApi.apiBase("http://localhost:8080/app"))
    }
}
