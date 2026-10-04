package app.ghostline.messages

import app.ghostline.push.NativePush
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ChatThreadTest {
    private fun msg(seq: Long, body: String = "m$seq", title: String = "Алиса", token: String = "t") =
        NativePush.Message("chat", "id$seq", seq, title, body, seq * 1000, token)

    private fun thread(vararg seqs: Long): ChatThread {
        var t = ChatThread.start(msg(seqs.first()))
        seqs.drop(1).forEach { t = t.withMessage(msg(it)) }
        return t
    }

    @Test
    fun collectsLinesInSeqOrder() {
        val t = ChatThread.start(msg(2)).withMessage(msg(1)).withMessage(msg(3))
        assertEquals(listOf(1L, 2L, 3L), t.lines.map { it.seq })
    }

    @Test
    fun ignoresARedeliveredPush() {
        val t = thread(1, 2)
        assertEquals(t, t.withMessage(msg(2)))
    }

    @Test
    fun keepsOnlyTheLastSevenLines() {
        val t = thread(1, 2, 3, 4, 5, 6, 7, 8, 9)
        assertEquals((3L..9L).toList(), t.lines.map { it.seq })
    }

    @Test
    fun newestPushRefreshesTitleAndToken() {
        val t = thread(1).withMessage(msg(2, title = "Алиса Новая", token = "fresh"))
        assertEquals("Алиса Новая", t.title)
        assertEquals("fresh", t.actionToken)
    }

    @Test
    fun readUpToDropsSeenLinesAndKeepsNewerOnes() {
        val rest = thread(1, 2, 3).readUpTo(2)
        assertNotNull(rest)
        assertEquals(listOf(3L), rest!!.lines.map { it.seq })
    }

    @Test
    fun readingEverythingEmptiesTheThread() {
        assertNull(thread(1, 2).readUpTo(2))
    }

    @Test
    fun aFailedReplyIsNotReadableAndGoesWithTheRead() {
        val t = thread(1, 2).withFailedReply("привет", 5000)
        assertEquals(2L, t.maxSeq)
        assertEquals("Не отправлено: привет", t.lines.last().text)
        assertEquals(true, t.lines.last().outgoing)
        assertNull(t.readUpTo(2))
    }

    @Test
    fun roundTripsThroughJson() {
        val t = thread(1, 2).withFailedReply("текст", 9)
        assertEquals(t, ChatThread.fromJson(t.toJson()))
    }

    @Test
    fun aDamagedValueIsNotAThread() {
        assertNull(ChatThread.fromJson("{"))
        assertNull(ChatThread.fromJson("""{"title":"x"}"""))
    }
}
