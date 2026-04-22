/**
 * Structured logging with Pino
 * Production-ready logging with JSON output, log levels, and context
 *
 * NOTE: Intentionally does NOT use "server-only" — this module is imported
 * from the standalone mailer-worker process (scripts/mailer-worker.mjs)
 * which runs outside the Next.js server runtime. Client code must not
 * import this file; keep that contract by convention, not by the barrier.
 */

import pino, { type Logger } from "pino";
import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

// Create the base logger
const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export type LogContext = Record<string, unknown>;

/**
 * Create a child logger with additional context
 */
export function createLogger(context: LogContext): Logger {
  return baseLogger.child(context);
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: LogContext) {
  baseLogger.info(context ?? {}, message);
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: LogContext) {
  baseLogger.warn(context ?? {}, message);
}

/**
 * Log an error message and report to Sentry
 */
export function logError(message: string, error?: unknown, context?: LogContext) {
  const errorObj = error instanceof Error ? error : new Error(String(error ?? message));
  
  baseLogger.error(
    {
      ...context,
      err: {
        message: errorObj.message,
        name: errorObj.name,
        stack: errorObj.stack,
      },
    },
    message
  );

  // Report to Sentry in production
  if (process.env.SENTRY_DSN) {
    try {
      Sentry.captureException(errorObj, {
        tags: { area: "server" },
        extra: { message, ...context },
      });
    } catch {
      // ignore Sentry errors
    }
  }
}

/**
 * Log a debug message (only in development or when LOG_LEVEL=debug)
 */
export function logDebug(message: string, context?: LogContext) {
  baseLogger.debug(context ?? {}, message);
}

/**
 * Create a request-scoped logger with request ID
 */
export function createRequestLogger(requestId: string, userId?: string) {
  return createLogger({
    requestId,
    userId,
  });
}

/**
 * Log API request/response for monitoring
 */
export function logApiCall(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  context?: LogContext
) {
  const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
  baseLogger[level](
    {
      ...context,
      http: {
        method,
        path,
        statusCode,
        durationMs,
      },
    },
    `${method} ${path} ${statusCode} ${durationMs}ms`
  );
}

/**
 * Report an error to Sentry + console (backward-compatible with old log.ts)
 */
export function reportError(message: string, err?: unknown, extra?: LogContext) {
  logError(message, err, extra);
}

export { baseLogger as logger };
