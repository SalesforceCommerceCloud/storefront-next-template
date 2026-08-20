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

/**
 * Runtime-facing accessor for the platform's OpenTelemetry tracer.
 *
 * Userland runtime code (the storefront template) depends only on this package, never on the dev
 * layer — so the tracer cannot be imported from `@salesforce/storefront-next-dev` directly. Instead
 * the dev layer's `initTelemetry()` publishes its provider-held tracer to a process-global symbol
 * slot when tracing is enabled, and this module reads that slot. The two packages share the tracer
 * through the global symbol registry rather than a module dependency.
 *
 * The tracer is obtained from `provider.getTracer()` (not the global `trace.getTracer()` API): on
 * Managed Runtime the global tracer registry is an unreliable no-op because a dual `@opentelemetry/api`
 * bundle splits the registry. See `@salesforce/storefront-next-dev` `otel/setup.ts` for the full
 * rationale and for where the slot is populated.
 */

import type { Tracer } from '@opentelemetry/api';

/**
 * The process-global slot where the dev layer's `initTelemetry()` stashes the provider-held tracer.
 *
 * `Symbol.for()` resolves to the same symbol across every module instance and every package via the
 * global symbol registry, so this MUST stay byte-for-byte identical to the key written in the dev
 * layer's `otel/setup.ts` — it is the cross-package contract that lets the two share one tracer.
 */
const TRACER_KEY = Symbol.for('sfnext.otel.tracer');

/**
 * Resolve the platform's provider-held OpenTelemetry tracer, or `null` when tracing is disabled.
 *
 * Returns `null` when the platform has not initialized telemetry (the default — `SFNEXT_OTEL_ENABLED`
 * unset), in which case callers inject `null` into a tracer seam and the instrumented code runs
 * untraced with no overhead. When enabled, the dev layer initializes telemetry at server bootstrap
 * (before any request), so this returns the shared tracer.
 *
 * Call this per-request (not at module scope): the slot is populated during bootstrap, and a
 * module-scope read could run before that completes and cache a stale `null`.
 */
export function getPlatformTracer(): Tracer | null {
    return (globalThis as Record<symbol, Tracer | undefined>)[TRACER_KEY] ?? null;
}
