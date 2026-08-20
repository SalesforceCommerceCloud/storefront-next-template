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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { propagation, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';

type SDKTracer = ReturnType<typeof NodeTracerProvider.prototype.getTracer>;

// Spy on NodeTracerProvider prototype methods so:
// - The real constructor runs (no "not a constructor" issues)
// - We can assert which methods were called and with what arguments
// - Global OTel state registration (register()) is suppressed to avoid test pollution

describe('SERVICE_NAME', () => {
    it('is storefront-next', async () => {
        const { SERVICE_NAME } = await import('./setup');
        expect(SERVICE_NAME).toBe('storefront-next');
    });
});

describe('initTelemetry', () => {
    const stubTracer = {} as unknown as SDKTracer;

    // Reset the module registry before each test. The cached tracer lives on a
    // process-global symbol slot (so the platform instrumentation and the data-store
    // seam share one tracer across module instances) — vi.resetModules() does NOT
    // clear it, so delete it explicitly to start each test fresh.
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        // Clean up the process-global undici registration flag and the cached tracer
        delete (globalThis as Record<symbol, boolean>)[Symbol.for('sfnext.otel.undici_registered')];
        delete (globalThis as Record<symbol, unknown>)[Symbol.for('sfnext.otel.tracer')];
    });

    function spyOnProvider() {
        // register() has global side effects (sets the active context manager) — stub it out
        const registerSpy = vi.spyOn(NodeTracerProvider.prototype, 'register').mockReturnValue(undefined);
        // addSpanProcessor returns `this` (fluent); return the provider instance via mockReturnThis
        const addSpanProcessorSpy = vi.spyOn(NodeTracerProvider.prototype, 'addSpanProcessor').mockReturnThis();
        const getTracerSpy = vi.spyOn(NodeTracerProvider.prototype, 'getTracer').mockReturnValue(stubTracer);
        return { registerSpy, addSpanProcessorSpy, getTracerSpy };
    }

    it('adds a SimpleSpanProcessor wrapping an MrtConsoleSpanExporter to the provider', async () => {
        const { addSpanProcessorSpy } = spyOnProvider();

        const { initTelemetry } = await import('./setup');
        initTelemetry();

        expect(addSpanProcessorSpy).toHaveBeenCalledWith(expect.any(SimpleSpanProcessor));
        // Dynamically import to avoid circular issues; verify the processor
        // wraps our custom MRT exporter via the class name.
        const { MrtConsoleSpanExporter } = await import('./mrt-console-span-exporter');
        const processor = addSpanProcessorSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
        // oxlint-disable-next-line @typescript-eslint/dot-notation
        expect(processor['_exporter']).toBeInstanceOf(MrtConsoleSpanExporter);
    });

    it('registers the provider', async () => {
        const { registerSpy } = spyOnProvider();

        const { initTelemetry } = await import('./setup');
        initTelemetry();

        expect(registerSpy).toHaveBeenCalledOnce();
    });

    it('does NOT register a global propagator (outbound injection is done directly)', async () => {
        spyOnProvider();
        // Deliberate design choice: we never call setGlobalPropagator(). On MRT that
        // registration is silently refused (the version-keyed global registry is owned
        // by MRT's @opentelemetry/api copy), so it cannot be relied on. Instead the
        // undici requestHook injects `traceparent` via a privately-held W3C propagator.
        // Leaving the global propagator as the default no-op also guarantees undici's
        // own propagation.inject() adds nothing, so the header is written exactly once.
        // (The real injection path is covered end-to-end in propagation.integration.test.ts.)
        const setPropagatorSpy = vi.spyOn(propagation, 'setGlobalPropagator').mockReturnValue(true);

        const { initTelemetry } = await import('./setup');
        initTelemetry();

        expect(setPropagatorSpy).not.toHaveBeenCalled();
    });

    it('leaves the global propagator as a no-op (no traceparent injected via the global API)', () => {
        // Because setGlobalPropagator() is never called, OTel's default no-op
        // propagator stays in effect for the global API. Confirm that — even for a
        // context carrying a valid, sampled span — the global propagation.inject()
        // adds nothing. This is what prevents a duplicate header: undici's own
        // global inject() (which runs right after our requestHook) is this same no-op.
        // (Our direct injection via the private propagator is covered in
        // propagation.integration.test.ts.)
        propagation.disable();
        const contextWithSpan = trace.setSpanContext(ROOT_CONTEXT, {
            traceId: '11111111111111111111111111111111',
            spanId: '2222222222222222',
            traceFlags: TraceFlags.SAMPLED,
        });

        const carrier: Record<string, string> = {};
        propagation.inject(contextWithSpan, carrier);

        expect(carrier.traceparent).toBeUndefined();
    });

    it('returns the tracer obtained directly from provider.getTracer(SERVICE_NAME)', async () => {
        const { getTracerSpy } = spyOnProvider();

        const { initTelemetry, SERVICE_NAME } = await import('./setup');
        const result = initTelemetry();

        expect(getTracerSpy).toHaveBeenCalledWith(SERVICE_NAME);
        expect(result).toBe(stubTracer);
    });

    it('returns the same tracer on subsequent calls (idempotent)', async () => {
        const { registerSpy } = spyOnProvider();

        const { initTelemetry } = await import('./setup');
        const first = initTelemetry();
        const second = initTelemetry();

        expect(first).toBe(second);
        // Provider constructor should only be called once
        expect(registerSpy).toHaveBeenCalledOnce();
    });

    it('returns null and logs an error if initialization throws', async () => {
        vi.spyOn(NodeTracerProvider.prototype, 'register').mockImplementation(() => {
            throw new Error('provider error');
        });
        const consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined);

        const { initTelemetry } = await import('./setup');
        const result = initTelemetry();

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            '[otel] Failed to initialize OpenTelemetry:',
            expect.any(Error)
        );
    });
});
