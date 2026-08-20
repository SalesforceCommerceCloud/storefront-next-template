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
 * OpenTelemetry tracer provider initialization.
 *
 * ## Exporter design: why ConsoleSpanExporter?
 *
 * This storefront runs in two environments:
 *   - Local development on a developer's machine (Vite dev server)
 *   - Salesforce Managed Runtime (MRT), a serverless environment backed by AWS Lambda
 *
 * Standard OpenTelemetry exporters (OTLP, Jaeger, Zipkin) are designed for
 * long-running processes: they maintain background agents, batch spans in memory,
 * and flush asynchronously. That model does not work in a serverless environment.
 * Lambda invocations must complete quickly — a background agent or async flush
 * after the response is sent would hold the Lambda open unnecessarily, increasing
 * cost and cold-start latency.
 *
 * Instead, we write spans synchronously to stdout via MrtConsoleSpanExporter — a
 * subclass of ConsoleSpanExporter that outputs structured JSON matching the format
 * MRT's log infrastructure expects. MRT collects stdout from every invocation and
 * forwards the log stream to downstream analytics systems. Telemetry reaches those
 * systems without any in-process agent or network connection from the Lambda
 * function itself.
 *
 * SimpleSpanProcessor is used (instead of BatchSpanProcessor) for the same reason:
 * immediate, synchronous export with no in-memory queue that could be lost if the
 * process exits.
 *
 * Uses NodeTracerProvider directly (instead of NodeSDK) to avoid async resource
 * detection. NodeSDK's autoDetectResources creates a Resource with
 * asyncAttributesPending=true, which causes SimpleSpanProcessor.onEnd() to
 * defer export via waitForAsyncAttributes(). In the Vite SSR module runner
 * context, that deferred microtask never executes. A synchronous Resource
 * ensures the immediate export path is always taken.
 *
 * ## Distributed tracing: W3C Trace Context propagation
 *
 * The storefront runs below Managed Runtime (MRT) in the call tree. MRT is
 * trace-aware: it makes the sampling decision and stamps an inbound W3C
 * `traceparent` header on the request the storefront receives. To appear on the
 * same end-to-end trace as the surrounding services, the storefront behaves as a
 * standard downstream participant:
 *   - It continues the inbound trace (see the Express middleware, which parses the
 *     inbound `traceparent` into the parent context).
 *   - It forwards `traceparent` on outbound fetches (the UndiciInstrumentation
 *     `requestHook` below injects it via a privately-held W3C propagator — see the
 *     `outboundPropagator` doc comment for why the global registry is bypassed).
 *   - It honors MRT's sampling decision via a ParentBasedSampler — it never forces
 *     a sampled trace and implements no sampling policy of its own. MRT owns the
 *     rate via MRT_DISTRIBUTED_TRACING_ENABLED / MRT_DISTRIBUTED_TRACING_SAMPLING_RATE.
 *
 * @env SFNEXT_OTEL_ENABLED — set to `"true"` to enable (e.g. `SFNEXT_OTEL_ENABLED=true pnpm dev`)
 */

import { context, trace, type Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AlwaysOnSampler, ParentBasedSampler, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { MrtConsoleSpanExporter } from './mrt-console-span-exporter';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UndiciInstrumentation, type UndiciRequest } from '@opentelemetry/instrumentation-undici';
import { logger } from '../logger';

/**
 * A privately-held W3C Trace Context propagator, used to inject `traceparent` onto
 * outbound fetches WITHOUT going through OpenTelemetry's global propagator registry.
 *
 * ## Why not the global propagator?
 *
 * `UndiciInstrumentation` injects outbound headers by calling the *global* registered
 * propagator (`propagation.inject()`). Registering one with `setGlobalPropagator()`
 * works locally, but is a silent no-op on Managed Runtime (MRT):
 *
 *   - The MRT Lambda wrapper bundles its own copy of `@opentelemetry/api` (declared
 *     `^1.9.1`, with core/sdk at 2.x) and boots first, creating the version-keyed
 *     global registry object (`globalThis[Symbol.for('opentelemetry.js.api.1')]`,
 *     stamped `version: "1.9.1"`).
 *   - Our SDK bundle ships a *different* copy of `@opentelemetry/api` (`1.9.0`). When
 *     our code calls `setGlobalPropagator()`, OTel's `registerGlobal()` compares the
 *     registry's recorded version against ours with an EXACT string match — `"1.9.1"
 *     !== "1.9.0"` — refuses the registration, and reports the error only to OTel's
 *     internal diag channel (which we do not wire up). The propagation slot stays
 *     empty, so undici's `propagation.inject()` injects nothing and no `traceparent`
 *     reaches SCAPI. Proven on soak: `propagation.fields() === []`, 0/198 outbound
 *     requests carried a header.
 *
 * This is the same multi-instance split that makes inbound `propagation.extract()`
 * fail (see `express/middleware.ts`, which bypasses it with `parseTraceParent` +
 * `trace.setSpanContext`). MRT's own data-plane tracer solves it the same way: it
 * holds a private `new W3CTraceContextPropagator()` and calls `inject()`/`extract()`
 * on it directly, never touching the global registry.
 *
 * Holding our own instance and injecting it ourselves (in the undici `requestHook`)
 * makes outbound propagation deterministic and independent of MRT's bundle, its OTel
 * version, and its boot order. We deliberately do NOT call `setGlobalPropagator()` —
 * leaving the global propagator as the default no-op guarantees undici's own
 * `propagation.inject()` (which runs right after our hook) adds nothing, so the
 * `traceparent` is written exactly once in every environment.
 */
const outboundPropagator = new W3CTraceContextPropagator();

export const SERVICE_NAME = 'storefront-next';

/**
 * Initializes OpenTelemetry and returns a Tracer from the provider directly.
 *
 * Returns the tracer via `provider.getTracer()` instead of the global
 * `trace.getTracer()` API. In the Vite SSR module runner, the built
 * dist/entry/server.js and the externalized @opentelemetry/sdk-trace-node
 * resolve @opentelemetry/api to different module instances (different paths
 * through pnpm's strict node_modules). Each instance has its own
 * ProxyTracerProvider singleton, so `provider.register()` sets the delegate
 * on sdk-trace-node's API instance while our code's `trace.getTracer()`
 * reads from a separate API instance with no delegate — returning a tracer
 * backed by a bare BasicTracerProvider with NoopSpanProcessor.
 *
 * Getting the tracer directly from the provider bypasses the global registry
 * entirely, guaranteeing the tracer uses our configured span processors.
 */
// The tracer is cached on `globalThis`, not in a module-scoped `let`, so it can be
// shared with code that never imports this module. `initTelemetry()` (called by the
// platform instrumentation at server bootstrap) builds and registers the single
// NodeTracerProvider and publishes its tracer here; the runtime package reads the same
// slot via `@salesforce/storefront-next-runtime/otel` `getPlatformTracer()` to hand the
// tracer to its data-store span seam. The two packages cannot share a module (the
// dependency direction is dev → runtime), so they share the tracer through the global
// symbol registry: `Symbol.for()` resolves to the same symbol everywhere. The runtime
// side MUST use this exact key. This also collapses any accidental second module
// instance of setup.ts (e.g. across Vite SSR module-runner boundaries) onto one tracer
// rather than a competing provider — the same pattern used by UNDICI_REGISTERED_KEY below.
const TRACER_KEY = Symbol.for('sfnext.otel.tracer');

// In the Vite SSR module runner, setup.ts may be loaded by two different module
// instances (the Express server and the SSR bundle) — each with its own
// `cachedTracer`. UndiciInstrumentation hooks into process-global
// diagnostics_channel events, so registering it twice causes duplicate spans
// for every fetch. This process-global flag ensures it is registered only once.
const UNDICI_REGISTERED_KEY = Symbol.for('sfnext.otel.undici_registered');

export function initTelemetry(): Tracer | null {
    const cachedTracer = (globalThis as Record<symbol, Tracer | undefined>)[TRACER_KEY];
    if (cachedTracer) return cachedTracer;
    try {
        const provider = new NodeTracerProvider({
            resource: new Resource({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
            // Honor the upstream (MRT) sampling decision rather than implementing our
            // own. ParentBasedSampler: when an inbound traceparent is present, defer
            // to its sampled flag (continue + export iff sampled); when there is no
            // inbound parent, sample the fresh root ourselves (AlwaysOnSampler). This
            // is exactly the standard "downstream participant" behavior — MRT owns the
            // rate via MRT_DISTRIBUTED_TRACING_* env vars.
            sampler: new ParentBasedSampler({ root: new AlwaysOnSampler() }),
        });

        provider.addSpanProcessor(new SimpleSpanProcessor(new MrtConsoleSpanExporter()));
        // Register with `propagator: null` so the provider sets up the global tracer
        // provider and the AsyncLocalStorage context manager, but does NOT install a
        // global propagator. (`register()` otherwise defaults to a W3C propagator built
        // from OTEL_PROPAGATORS.) We deliberately own propagation ourselves:
        //   - outbound: the undici requestHook below injects via our `outboundPropagator`.
        //   - inbound: the Express middleware parses `traceparent` by hand
        //     (parseTraceParent + trace.setSpanContext).
        // Both bypass the global registry, which is unreliable on MRT (see the
        // `outboundPropagator` doc comment). Leaving the global propagator as the
        // default no-op also means undici's own propagation.inject() — which runs right
        // after our hook — adds nothing, so `traceparent` is written exactly once.
        provider.register({ propagator: null });

        // Guard against double-registration across Vite module boundaries.
        // See comment above UNDICI_REGISTERED_KEY.
        if (!(globalThis as Record<symbol, boolean>)[UNDICI_REGISTERED_KEY]) {
            (globalThis as Record<symbol, boolean>)[UNDICI_REGISTERED_KEY] = true;
            registerInstrumentations({
                tracerProvider: provider,
                instrumentations: [
                    new UndiciInstrumentation({
                        requestHook(span, request) {
                            try {
                                // Static, low-cardinality client span name shared by every
                                // outbound fetch (SCAPI, SLAS, …), matching the dotted
                                // `sfnext.*` operation namespace used by our other spans.
                                // The HTTP detail (method, full url, host, status) is already
                                // set on the span as attributes by the instrumentation —
                                // `http.request.method`, `url.full`, `url.path`, `url.query`,
                                // `server.address`, `http.response.status_code` — so traces
                                // aggregate by operation and the high-cardinality values
                                // (paths/queries that can carry ids, tokens, or PII) stay out
                                // of the span name.
                                span.updateName('sfnext.fetch');
                            } catch {
                                // Non-fatal — default span name is acceptable
                            }

                            // Inject `traceparent` ourselves, via our private propagator, so the
                            // header reaches SCAPI even when undici's own global-propagator
                            // inject() is a no-op on MRT (see `outboundPropagator` above). The
                            // hook runs just before undici's inject(), and because we never
                            // register a global propagator that inject() adds nothing — so the
                            // header is written exactly once. We build the context from THIS
                            // CLIENT span (a pure realm-global-symbol write, no registry lookup),
                            // matching what undici would have injected.
                            try {
                                const ctx = trace.setSpan(context.active(), span);
                                outboundPropagator.inject(ctx, request, {
                                    set(req: UndiciRequest, key: string, value: string) {
                                        req.addHeader?.(key, value);
                                    },
                                });
                            } catch {
                                // Non-fatal — propagation must never break the request
                            }
                        },
                    }),
                ],
            });
        }

        const tracer = provider.getTracer(SERVICE_NAME);
        (globalThis as Record<symbol, Tracer | undefined>)[TRACER_KEY] = tracer;
        return tracer;
    } catch (error) {
        logger.error('[otel] Failed to initialize OpenTelemetry:', error);
        return null;
    }
}
