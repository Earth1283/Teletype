package io.github.Earth1283.teletype.standalone

data class CliArgs(
    val host: String?,
    val port: Int?,
    val token: String?
) {
    companion object {
        fun parse(args: Array<String>): CliArgs {
            var host: String? = null
            var port: Int? = null
            var token: String? = null
            var i = 0
            while (i < args.size) {
                when (args[i]) {
                    "--host"  -> { host = args.getOrNull(++i); }
                    "--port"  -> { port = args.getOrNull(++i)?.toIntOrNull() }
                    "--token" -> { token = args.getOrNull(++i) }
                }
                i++
            }
            return CliArgs(host, port, token)
        }
    }
}
