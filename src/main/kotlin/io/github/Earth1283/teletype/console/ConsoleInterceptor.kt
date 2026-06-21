package io.github.Earth1283.teletype.console

import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.core.LogEvent
import org.apache.logging.log4j.core.Logger
import org.apache.logging.log4j.core.appender.AbstractAppender
import org.apache.logging.log4j.core.config.Property
import org.apache.logging.log4j.core.layout.PatternLayout

private const val APPENDER_NAME = "TeletypeConsoleAppender"

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
        val msg = event.message.formattedMessage
        val level = event.level.name()
        val logger = event.loggerName?.substringAfterLast('.') ?: "?"
        broadcaster.emit("[$level] [$logger] $msg")
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
