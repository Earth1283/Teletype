package io.github.Earth1283.teletype.command

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TtySubcommandTest {
    @Test
    fun `finds subcommands case-insensitively`() {
        assertEquals(TtySubcommand.VERIFY, TtySubcommand.find("VeRiFy"))
        assertNull(TtySubcommand.find("nope"))
    }

    @Test
    fun `suggests completions for prefixes and small typos`() {
        assertEquals(TtySubcommand.STATUS, TtySubcommand.closestTo("stat"))
        assertEquals(TtySubcommand.VERIFY, TtySubcommand.closestTo("verfiy"))
        assertEquals(TtySubcommand.RELOAD, TtySubcommand.closestTo("relaod"))
        assertEquals(TtySubcommand.DOCTOR, TtySubcommand.closestTo("docter"))
    }

    @Test
    fun `gives up on unrelated input`() {
        assertNull(TtySubcommand.closestTo("banana"))
        assertNull(TtySubcommand.closestTo(""))
    }

    @Test
    fun `only suggests commands the sender may run`() {
        assertNull(TtySubcommand.closestTo("rev", listOf(TtySubcommand.HELP, TtySubcommand.STATUS)))
    }
}
