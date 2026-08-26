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
import pino from 'pino';
import type { MiddlewareFunction } from 'react-router';
import { dataStoreLoggerContext, dataStoreTracerContext } from '@salesforce/storefront-next-runtime/data-store';
import { getPlatformTracer } from '@salesforce/storefront-next-runtime/otel';
import { correlationContext } from '@/lib/correlation';
import { processMetadata, resolveLevel, type Logger } from '@/lib/logger';
import { loggerContext } from '@/lib/logger.server';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Root pino instance for server-side structured logging.
 *
 * - Production: raw ndjson to stdout (for log aggregators)
 * - Development: pretty-printed with colors via `pino-pretty`
 *
 * @env SFCC_LOG_LEVEL - Optional. Log level override (`error` | `warn` | `info` | `debug`).
 *   Defaults to `warn` in production, `info` in development.
 * @env NODE_ENV - Used to determine default level and transport. Example: `production`
 */
export const pinoLogger = pino({
    level: resolveLevel(),
    // Remove pino's default `pid` and `hostname` fields — they add noise in our environment.
    base: undefined,
    // Convert the numeric `level` (e.g. 30) to a human-readable label (e.g. "info").
    formatters: {
        level: (label) => ({ level: label }),
    },
    ...(!isProduction && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
            },
        },
    }),
});

/**
 * Wrap a pino child logger in the application's Logger interface.
 *
 * Adapts from the app's `(message, metadata?)` calling convention
 * to pino's `(mergingObject, message)` convention.
 */
function wrapPinoLogger(child: pino.Logger): Logger {
    function log(level: 'error' | 'warn' | 'info' | 'debug', message: string, metadata?: Record<string, unknown>) {
        if (metadata) {
            child[level](processMetadata(metadata), message);
        } else {
            child[level](message);
        }
    }

    return Object.freeze({
        error: (message: string, metadata?: Record<string, unknown>) => log('error', message, metadata),
        warn: (message: string, metadata?: Record<string, unknown>) => log('warn', message, metadata),
        info: (message: string, metadata?: Record<string, unknown>) => log('info', message, metadata),
        debug: (message: string, metadata?: Record<string, unknown>) => log('debug', message, metadata),
    });
}

/**
 * Logging middleware that injects a pino-backed logger into React Router context.
 *
 * Must run after `correlationMiddleware` so the correlation ID is available.
 * Creates a pino child logger with request-scoped context bound (`correlationId`,
 * `method`, `path`), wraps it in the `Logger` interface, and sets it on
 * `loggerContext` for downstream consumers.
 */
export const loggingMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const correlationId = context.get(correlationContext);
    const url = new URL(request.url);
    const bindings: Record<string, string> = {
        method: request.method,
        path: url.pathname,
    };
    if (correlationId) bindings.correlationId = correlationId;
    const child = pinoLogger.child(bindings);
    const wrapped = wrapPinoLogger(child);
    context.set(loggerContext, wrapped);
    // Also expose the same wrapped logger to the runtime SDK so its data-store
    // middleware emits warnings through pino with the request bindings (correlationId, method, path)
    // rather than bare console.warn.
    context.set(dataStoreLoggerContext, wrapped);
    // Hand the runtime SDK the platform's provider-held tracer so its data-store fetch emits a
    // span on the ambient trace. `null` (OTel disabled) leaves the fetch untraced. Runs before
    // the data-store middleware in the chain, so the tracer is present when the fetch fires.
    // Read per-request rather than at module scope: the platform populates the shared tracer slot
    // during server bootstrap, and a module-scope read could run first and cache a stale `null`.
    context.set(dataStoreTracerContext, getPlatformTracer());
    return next();
};
