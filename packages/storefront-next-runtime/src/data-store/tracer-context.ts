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

// This data-store-scoped tracer seam mirrors `logger-context.ts`. It exists because the
// OpenTelemetry setup lives in `@salesforce/storefront-next-dev`, and the dependency direction
// is dev → runtime: this runtime package cannot import the dev layer's `initTelemetry()` tracer
// directly. Instead the host (the storefront template's logging middleware) resolves the
// provider-held tracer and injects it here via `dataStoreTracerContext`, and the data-store
// funnel reads it through `getDataStoreTracer`. See [[logger-context]] for the same pattern.

import { createContext, type RouterContextProvider } from 'react-router';
import type { Tracer } from '@opentelemetry/api';

/**
 * Router context the SDK reads to obtain the request's OpenTelemetry tracer.
 *
 * Hosts (e.g. the storefront template) populate this from the dev layer's
 * provider-held tracer (`initTelemetry()`) in their logging/telemetry middleware.
 * When unset — local scripts, tests, or any host that has not wired tracing —
 * {@link getDataStoreTracer} returns `null` and the data-store funnel runs
 * untraced with no overhead.
 *
 * The tracer must come from the provider directly rather than the global
 * `trace.getTracer()` API: on Managed Runtime the global tracer registry is an
 * unreliable no-op (a dual `@opentelemetry/api` bundle splits the registry), so
 * the dev layer holds the real tracer and the host passes it through here.
 *
 * Defaults to `null` (not `undefined`) because React Router's `context.get()`
 * throws when `defaultValue === undefined`.
 */
export const dataStoreTracerContext = createContext<Tracer | null>(null);

/**
 * Read the data-store tracer from router context, or `null` when nothing has
 * been injected. Callers treat `null` as "tracing disabled" and run the work
 * directly. Use this from inside SDK middleware/loaders that have access to a
 * {@link RouterContextProvider}.
 */
export function getDataStoreTracer(context: Readonly<RouterContextProvider>): Tracer | null {
    return context.get(dataStoreTracerContext);
}
