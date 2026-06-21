package io.github.Earth1283.teletype.standalone

fun main(args: Array<String>) {
    val cliArgs = CliArgs.parse(args)
    TerminalClient(cliArgs).run()
}
