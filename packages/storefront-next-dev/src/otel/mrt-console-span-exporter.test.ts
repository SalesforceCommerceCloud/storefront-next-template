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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ConsoleSpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode } from '@opentelemetry/core';
import { MrtConsoleSpanExporter } from './mrt-console-span-exporter';

function createMockSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
    return {
        name: 'request',
        spanContext: () => ({
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            traceFlags: 1,
        }),
        parentSpanId: 'c'.repeat(16),
        kind: SpanKind.SERVER,
        startTime: [1710590400, 123456000] as [number, number],
        endTime: [1710590400, 168686000] as [number, number],
        duration: [0, 45230000] as [number, number],
        attributes: { 'http.request.method': 'GET', 'url.path': '/products' },
        status: { code: 0 },
        events: [],
        links: [],
        ended: true,
        resource: { attributes: {} },
        instrumentationLibrary: { name: 'storefront-next', version: '' },
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
        ...overrides,
    } as unknown as ReadableSpan;
}

describe('MrtConsoleSpanExporter', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    const savedEnv = process.env.SFNEXT_OTEL_ENABLED;

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'info').mockReturnValue(undefined);
        process.env.SFNEXT_OTEL_ENABLED = 'true';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env.SFNEXT_OTEL_ENABLED = savedEnv;
    });

    it('is an instance of ConsoleSpanExporter', () => {
        expect(new MrtConsoleSpanExporter()).toBeInstanceOf(ConsoleSpanExporter);
    });

    it('outputs valid JSON via console.info for each span', () => {
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        expect(consoleSpy).toHaveBeenCalledOnce();
        const output = consoleSpy.mock.calls[0][0] as string;
        expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes all required MRT fields', () => {
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(parsed).toEqual(
            expect.objectContaining({
                traceId: 'a'.repeat(32),
                parentId: 'c'.repeat(16),
                name: 'request',
                id: 'b'.repeat(16),
                kind: SpanKind.SERVER,
                timestamp: expect.any(String),
                duration: [0, 45230000],
                attributes: { 'http.request.method': 'GET', 'url.path': '/products' },
                status: { code: SpanStatusCode.UNSET },
                events: [],
                links: [],
                start_time: [1710590400, 123456000],
                end_time: [1710590400, 168686000],
                forwardTrace: true,
            })
        );
    });

    it('exports multiple spans with one console.info call each', () => {
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan({ name: 'request' }), createMockSpan({ name: 'loader' })], callback);

        expect(consoleSpy).toHaveBeenCalledTimes(2);
        expect(JSON.parse(consoleSpy.mock.calls[0][0] as string).name).toBe('request');
        expect(JSON.parse(consoleSpy.mock.calls[1][0] as string).name).toBe('loader');
    });

    it('calls resultCallback with SUCCESS', () => {
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    });

    it('sets forwardTrace to true when SFNEXT_OTEL_ENABLED is "true"', () => {
        process.env.SFNEXT_OTEL_ENABLED = 'true';
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(parsed.forwardTrace).toBe(true);
    });

    it('sets forwardTrace to true when MRT_DISTRIBUTED_TRACING_ENABLED is "true"', () => {
        delete process.env.SFNEXT_OTEL_ENABLED;
        process.env.MRT_DISTRIBUTED_TRACING_ENABLED = 'true';
        try {
            const exporter = new MrtConsoleSpanExporter();

            exporter.export([createMockSpan()], vi.fn());

            const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
            expect(parsed.forwardTrace).toBe(true);
        } finally {
            delete process.env.MRT_DISTRIBUTED_TRACING_ENABLED;
        }
    });

    it('sets forwardTrace to false when neither tracing flag is "true"', () => {
        delete process.env.SFNEXT_OTEL_ENABLED;
        delete process.env.MRT_DISTRIBUTED_TRACING_ENABLED;
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(parsed.forwardTrace).toBe(false);
    });

    it('produces an ISO timestamp string for the timestamp field', () => {
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
    });

    it('passes through raw HrTime [seconds, nanoseconds] for start_time and end_time', () => {
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan({ startTime: [100, 999999999], endTime: [101, 500000] })], callback);

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(parsed.start_time).toEqual([100, 999999999]);
        expect(parsed.end_time).toEqual([101, 500000]);
    });

    it('uses snake_case time keys only — never the camelCase MRT-runtime variants', () => {
        // Contract guard: MRT's log forwarder ingests `start_time`/`end_time`. A POC
        // once renamed these to camelCase `startTime`/`endTime` while chasing an
        // unrelated issue; that silently breaks ingestion. Fail loudly if it recurs.
        const exporter = new MrtConsoleSpanExporter();
        const callback = vi.fn();

        exporter.export([createMockSpan()], callback);

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
        expect(parsed).toHaveProperty('start_time');
        expect(parsed).toHaveProperty('end_time');
        expect(parsed.startTime).toBeUndefined();
        expect(parsed.endTime).toBeUndefined();
    });
});
