package io.github.Earth1283.teletype.command

enum class TtySubcommand(val usage: String, val requiresAdmin: Boolean) {
    HELP("[command]", requiresAdmin = false),
    STATUS("", requiresAdmin = false),
    VERIFY("<code>", requiresAdmin = true),
    START("", requiresAdmin = true),
    STOP("", requiresAdmin = true),
    RELOAD("", requiresAdmin = true),
    DOCTOR("", requiresAdmin = true),
    REVOKE("", requiresAdmin = true);

    val id: String = name.lowercase()

    companion object {
        private const val MAX_TYPO_DISTANCE = 2

        fun find(input: String): TtySubcommand? = entries.find { it.id == input.lowercase() }

        fun closestTo(input: String, candidates: Collection<TtySubcommand> = entries): TtySubcommand? {
            val typed = input.lowercase()
            if (typed.isEmpty()) return null
            return candidates.firstOrNull { it.id.startsWith(typed) }
                ?: candidates
                    .map { it to editDistance(it.id, typed) }
                    .filter { (_, distance) -> distance <= MAX_TYPO_DISTANCE }
                    .minByOrNull { (_, distance) -> distance }
                    ?.first
        }

        private fun editDistance(a: String, b: String): Int {
            var previous = IntArray(b.length + 1) { it }
            for (i in 1..a.length) {
                val current = IntArray(b.length + 1)
                current[0] = i
                for (j in 1..b.length) {
                    val substitution = previous[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1
                    current[j] = minOf(previous[j] + 1, current[j - 1] + 1, substitution)
                }
                previous = current
            }
            return previous[b.length]
        }
    }
}
