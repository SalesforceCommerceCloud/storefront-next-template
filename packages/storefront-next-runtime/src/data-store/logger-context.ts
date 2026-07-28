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

// TODO: Remove this file once the SDK-level `loggerContext` lifted from the storefront
// template lands. This data-store-scoped logger seam exists only because the SDK can't
// import the template's `loggerContext` (inverted dep). Once the logger is platform-level
// infra in the SDK, the data-store middleware should read that context directly and this
// file can be deleted.

import { createContext, type RouterContextProvider } from 'react-router';

/**
 * Minimal structured-logger interface the data-store middleware depends on.
 *
 * Matches the shape of the host application's `Logger` (see the storefront
 * template's `src/lib/logger.ts`) so a host can pass through its own logger
 * object via {@link dataStoreLoggerContext} without an adapter.
 *
 * The data-store middleware emits at `warn` level today; the full interface
 * is exposed so future SDK middlewares that need richer levels stay
 * consistent with this contract.
 */
export interface DataStoreLogger {
    error(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    info(message: string, metadata?: Record<string, unknown>): void;
    debug(message: string, metadata?: Record<string, unknown>): void;
}

function formatMessage(message: string, metadata?: Record<string, unknown>): string {
    if (!metadata) return message;
    try {
        return `${message} ${JSON.stringify(metadata, replacerForErrors)}`;
    } catch {
        // Metadata may contain cycles, BigInt, or other unserializable values. The default
        // logger must never throw — that would defeat the data-store middleware's fail-soft
        // contract. Drop the metadata payload rather than crashing the request.
        return `${message} [unserializable metadata]`;
    }
}

function replacerForErrors(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, ...(value.stack && { stack: value.stack }) };
    }
    return value;
}

/**
 * Default logger used when nothing has been injected via
 * {@link dataStoreLoggerContext}. Routes warnings to `console.warn` and
 * errors to `console.error` so diagnostics remain visible in environments
 * (tests, scripts, hosts that haven't wired a structured logger) where the
 * SDK is invoked outside the storefront template. `info` and `debug` are
 * no-ops to avoid noisy default output.
 */
const consoleLogger: DataStoreLogger = Object.freeze({
    error(message: string, metadata?: Record<string, unknown>): void {
        // oxlint-disable-next-line no-console
        console.error(formatMessage(message, metadata));
    },
    warn(message: string, metadata?: Record<string, unknown>): void {
        // oxlint-disable-next-line no-console
        console.warn(formatMessage(message, metadata));
    },
    info(): void {
        // intentional no-op: keeps the default logger quiet outside warn/error
    },
    debug(): void {
        // intentional no-op: keeps the default logger quiet outside warn/error
    },
});

/**
 * Router context the SDK reads to obtain a request-scoped structured logger.
 *
 * Hosts (e.g. the storefront template) populate this from their own logging
 * middleware. When unset, {@link getDataStoreLogger} falls back to a
 * console-based logger so warnings remain visible.
 *
 * Defaults to `null` (not `undefined`) because React Router's
 * `context.get()` throws when `defaultValue === undefined`.
 */
export const dataStoreLoggerContext = createContext<DataStoreLogger | null>(null);

/**
 * Read the data-store logger from router context, falling back to a
 * console-based default when nothing has been injected.
 *
 * Use this from inside SDK middleware/loaders that have access to a
 * {@link RouterContextProvider}.
 */
export function getDataStoreLogger(context: Readonly<RouterContextProvider>): DataStoreLogger {
    return context.get(dataStoreLoggerContext) ?? consoleLogger;
}
