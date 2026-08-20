import { Tracer } from "@opentelemetry/api";

//#region src/otel/index.d.ts

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
declare function getPlatformTracer(): Tracer | null;
//#endregion
export { getPlatformTracer };
//# sourceMappingURL=otel.d.ts.map