package io.github.Earth1283.teletype.actions

import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

object CronParser {
    private data class FieldRange(val min: Int, val max: Int)
    private val RANGES = arrayOf(
        FieldRange(0, 59),  // minute
        FieldRange(0, 23),  // hour
        FieldRange(1, 31),  // dom
        FieldRange(1, 12),  // month
        FieldRange(0, 7)    // dow (0 and 7 both = Sunday)
    )

    fun isValid(expr: String): Boolean = parse(expr) != null

    private fun parse(expr: String): Array<Set<Int>>? {
        val parts = expr.trim().split(Regex("\\s+"))
        if (parts.size != 5) return null
        return try {
            Array(5) { i -> parseField(parts[i], RANGES[i]) ?: return null }
        } catch (e: Exception) { null }
    }

    private fun parseField(part: String, range: FieldRange): Set<Int>? {
        if (part == "*") return (range.min..range.max).toSet()
        val result = mutableSetOf<Int>()
        for (seg in part.split(",")) {
            when {
                seg == "*" -> result.addAll(range.min..range.max)
                seg.startsWith("*/") -> {
                    val step = seg.drop(2).toIntOrNull()?.takeIf { it >= 1 } ?: return null
                    (range.min..range.max step step).forEach { result += it }
                }
                seg.contains("-") -> {
                    val halves = seg.split("-", limit = 2)
                    val a = halves[0].toIntOrNull() ?: return null
                    val b = halves[1].toIntOrNull() ?: return null
                    if (a < range.min || b > range.max || a > b) return null
                    result.addAll(a..b)
                }
                else -> {
                    val n = seg.toIntOrNull() ?: return null
                    if (n < range.min || n > range.max) return null
                    result += n
                }
            }
        }
        return result.ifEmpty { null }
    }

    fun nextFireAfter(expr: String, from: ZonedDateTime): ZonedDateTime? {
        val fields = parse(expr) ?: return null
        val minF  = fields[0]; val hourF = fields[1]; val domF = fields[2]
        val monF  = fields[3]; val dowF  = fields[4]
        val dowExpanded = if (7 in dowF) dowF + 0 else dowF

        var t = from.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1)
        val limit = from.plusYears(4)
        while (t.isBefore(limit)) {
            val mon  = t.monthValue
            val dom  = t.dayOfMonth
            val dow  = t.dayOfWeek.value % 7  // 0=Sun … 6=Sat
            val hour = t.hour
            val min  = t.minute
            when {
                mon  !in monF        -> t = t.withDayOfMonth(1).withHour(0).withMinute(0).plusMonths(1)
                dom  !in domF        -> t = t.withHour(0).withMinute(0).plusDays(1)
                dow  !in dowExpanded -> t = t.withHour(0).withMinute(0).plusDays(1)
                hour !in hourF       -> t = t.withMinute(0).plusHours(1)
                min  !in minF        -> t = t.plusMinutes(1)
                else                 -> return t
            }
        }
        return null
    }
}
