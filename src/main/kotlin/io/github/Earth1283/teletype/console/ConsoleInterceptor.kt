package io.github.Earth1283.teletype.console

import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.core.LogEvent
import org.apache.logging.log4j.core.Logger
import org.apache.logging.log4j.core.appender.AbstractAppender
import org.apache.logging.log4j.core.config.Property
import org.apache.logging.log4j.core.layout.PatternLayout
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val APPENDER_NAME = "TeletypeConsoleAppender"
private val TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss")

class ConsoleInterceptor(
    private val broadcaster: ConsoleBroadcaster
) : AbstractAppender(
    APPENDER_NAME,
    null,
    PatternLayout.createDefaultLayout(),
    true,
    Property.EMPTY_ARRAY
) {
    override fun append(event: LogEvent) {
        val time = LocalTime.ofInstant(
            Instant.ofEpochMilli(event.timeMillis), ZoneId.systemDefault()
        ).format(TIME_FMT)
        val level = event.level.name()
        val thread = event.threadName ?: "Server thread"
        val msg = event.message.formattedMessage
        broadcaster.emit("[$time] [$thread/$level]: $msg")
    }

    companion object {
        private var installed: ConsoleInterceptor? = null

        fun install(broadcaster: ConsoleBroadcaster): ConsoleInterceptor {
            val appender = ConsoleInterceptor(broadcaster)
            appender.start()
            (LogManager.getRootLogger() as Logger).addAppender(appender)
            installed = appender
            return appender
        }

        fun uninstall() {
            val appender = installed ?: return
            (LogManager.getRootLogger() as Logger).removeAppender(appender)
            appender.stop()
            installed = null
        }
    }
}
