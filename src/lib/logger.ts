/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
    error: 'ERROR',
    warn: 'WARN',
    info: 'INFO',
    debug: 'DEBUG',
};

/**
 * Type guard for a {@link LogLevel} name. Uses `Object.hasOwn` (not `in`) so
 * inherited properties like `toString` don't falsely validate an env value.
 */
function isLogLevel(value: string): value is LogLevel {
    return Object.hasOwn(LEVEL_PRIORITY, value);
}

/**
 * Managed Runtime injects `MRT_LOG_LEVEL` as a numeric string from its own
 * `LogLevel` enum (`0=TRACE, 1=DEBUG, 2=INFO, 3=WARN, 4=ERROR, 5=FATAL`), not a
 * level name — so it must be mapped, not matched against {@link LEVEL_PRIORITY}'s
 * keys. `TRACE` and `FATAL` clamp to the closest level this logger supports.
 */
const MRT_NUMERIC_TO_LEVEL: Record<string, LogLevel> = {
    '0': 'debug', // TRACE
    '1': 'debug', // DEBUG
    '2': 'info', // INFO
    '3': 'warn', // WARN
    '4': 'error', // ERROR
    '5': 'error', // FATAL
};

let overrideLevel: LogLevel | undefined;

export function resolveLevel(): LogLevel {
    if (overrideLevel) return overrideLevel;

    if (typeof process !== 'undefined' && process.env) {
        // MRT sets MRT_LOG_LEVEL as a number; resolve it via the numeric map first.
        const mrtLevel = process.env.MRT_LOG_LEVEL;
        if (mrtLevel && mrtLevel in MRT_NUMERIC_TO_LEVEL) return MRT_NUMERIC_TO_LEVEL[mrtLevel];

        // SFCC_LOG_LEVEL is a level name set by the developer.
        const sfccLevel = process.env.SFCC_LOG_LEVEL;
        if (sfccLevel && isLogLevel(sfccLevel)) return sfccLevel;

        if (process.env.NODE_ENV === 'production') return 'warn';
    }

    return 'info';
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[resolveLevel()];
}

/**
 * Serialize an Error into a plain object so JSON.stringify doesn't produce "{}".
 */
export function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            ...(error.stack && { stack: error.stack }),
        };
    }
    return { value: String(error) };
}

/**
 * Process metadata: serialize Error instances found in values.
 */
export function processMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const processed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
        processed[key] = value instanceof Error ? serializeError(value) : value;
    }
    return processed;
}

function mergeMetadata(
    base: Record<string, unknown> | undefined,
    extra: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
    if (!base && !extra) return undefined;
    if (!base) return extra;
    if (!extra) return base;
    return { ...base, ...extra };
}

/**
 * Structured logger interface used across the application.
 *
 * **Log level guidelines:**
 * - `error` — Unrecoverable failures within a request (e.g. uncaught exceptions, fatal API errors).
 * - `warn`  — Recoverable problems: fallback paths, retries, degraded behavior.
 * - `info`  — Observable outcomes: request completed, action succeeded/failed, significant state changes.
 *             Use for entries you want visible in production logs.
 * - `debug` — Internal progress: "starting X", "parsed Y", intermediate steps.
 *             Useful for local debugging but too noisy for production.
 */
export interface Logger {
    error(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    info(message: string, metadata?: Record<string, unknown>): void;
    debug(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Create a level-gated logger for the template application.
 *
 * Output format: `LEVEL message {JSON metadata?}`
 *
 * Log level is controlled by `SFCC_LOG_LEVEL` env var (`error` | `warn` | `info` | `debug`),
 * or on Managed Runtime by the numeric `MRT_LOG_LEVEL` (see {@link MRT_NUMERIC_TO_LEVEL}).
 * Defaults to `warn` in production, `info` otherwise.
 *
 * Use this for client-side code or when router context is not available.
 * For server-side code with router context, prefer `getLogger` from `@/lib/logger.server`
 * which automatically includes the correlation ID.
 *
 * @param baseMetadata - Optional metadata included in every log entry (e.g. correlationId)
 *
 * @example
 * ```ts
 * const logger = createLogger();
 * logger.info('Variant selected', { sku });
 * ```
 */
export function createLogger(baseMetadata?: Record<string, unknown>): Logger {
    return Object.freeze({
        error(message: string, metadata?: Record<string, unknown>): void {
            if (!shouldLog('error')) return;
            const prefix = `${LEVEL_LABELS.error} ${message}`;
            const merged = mergeMetadata(baseMetadata, metadata ? processMetadata(metadata) : undefined);
            if (merged) {
                console.error(prefix, JSON.stringify(merged));
            } else {
                console.error(prefix);
            }
        },
        warn(message: string, metadata?: Record<string, unknown>): void {
            if (!shouldLog('warn')) return;
            const prefix = `${LEVEL_LABELS.warn} ${message}`;
            const merged = mergeMetadata(baseMetadata, metadata ? processMetadata(metadata) : undefined);
            if (merged) {
                console.warn(prefix, JSON.stringify(merged));
            } else {
                console.warn(prefix);
            }
        },
        info(message: string, metadata?: Record<string, unknown>): void {
            if (!shouldLog('info')) return;
            const prefix = `${LEVEL_LABELS.info} ${message}`;
            const merged = mergeMetadata(baseMetadata, metadata ? processMetadata(metadata) : undefined);
            if (merged) {
                console.log(prefix, JSON.stringify(merged));
            } else {
                console.log(prefix);
            }
        },
        debug(message: string, metadata?: Record<string, unknown>): void {
            if (!shouldLog('debug')) return;
            const prefix = `${LEVEL_LABELS.debug} ${message}`;
            const merged = mergeMetadata(baseMetadata, metadata ? processMetadata(metadata) : undefined);
            if (merged) {
                console.log(prefix, JSON.stringify(merged));
            } else {
                console.log(prefix);
            }
        },
    });
}

/**
 * Override the log level programmatically (useful for tests).
 * Pass `undefined` to reset to env-based resolution.
 */
export function setLogLevel(level: LogLevel | undefined): void {
    overrideLevel = level;
}

/**
 * Get the currently resolved log level.
 */
export function getLogLevel(): LogLevel {
    return resolveLevel();
}
