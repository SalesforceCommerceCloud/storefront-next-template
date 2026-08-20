//#region src/otel/index.ts
/**
* The process-global slot where the dev layer's `initTelemetry()` stashes the provider-held tracer.
*
* `Symbol.for()` resolves to the same symbol across every module instance and every package via the
* global symbol registry, so this MUST stay byte-for-byte identical to the key written in the dev
* layer's `otel/setup.ts` — it is the cross-package contract that lets the two share one tracer.
*/
const TRACER_KEY = Symbol.for("sfnext.otel.tracer");
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
function getPlatformTracer() {
	return globalThis[TRACER_KEY] ?? null;
}

//#endregion
export { getPlatformTracer };
//# sourceMappingURL=otel.js.map