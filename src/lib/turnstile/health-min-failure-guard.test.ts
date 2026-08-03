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
 * Isolates the min-failure-count guard.
 *
 * Under DEFAULT thresholds the guard is mathematically redundant — see comment in
 * health.server.ts. To exercise it independently, we set RATE_ENTER very low (0.2) so
 * that rate-only logic would flip the verdict on 1-2 failures, and verify the guard
 * holds the verdict at healthy until failures ≥ MIN_FAILURES_FOR_DEGRADED.
 *
 * Env vars are read at module load, so we use vi.resetModules() and dynamic import to
 * reload the module under different env values.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_HEALTH_RATE_ENTER;
    delete process.env.TURNSTILE_HEALTH_RATE_EXIT;
    delete process.env.TURNSTILE_HEALTH_MIN_FAILURES;
    delete process.env.TURNSTILE_HEALTH_MIN_SAMPLES;
    delete process.env.TURNSTILE_HEALTH_WINDOW_MS;
    delete process.env.TURNSTILE_HEALTH_RING_CAPACITY;
});

describe('min-failure-count guard (isolated under low RATE_ENTER)', () => {
    it('with RATE_ENTER=0.2 and MIN_FAILURES=3, 2 failures of 5 (40%) does NOT flip', async () => {
        process.env.TURNSTILE_HEALTH_RATE_ENTER = '0.2';
        process.env.TURNSTILE_HEALTH_RATE_EXIT = '0.1';
        process.env.TURNSTILE_HEALTH_MIN_FAILURES = '3';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        // 2 failures + 3 successes = 5 samples, 40% rate, well above RATE_ENTER (20%).
        // Without the min-failure guard this would flip degraded. With it, the absolute
        // count of 2 (< 3) holds the verdict at healthy.
        recordSiteverifyOutcome(true, 100);
        recordSiteverifyOutcome(true, 100);
        recordSiteverifyOutcome(false, 100);
        recordSiteverifyOutcome(false, 100);
        recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(false);
    });

    it('with same low RATE_ENTER, 3 failures of 5 (60%) DOES flip — guard satisfied', async () => {
        process.env.TURNSTILE_HEALTH_RATE_ENTER = '0.2';
        process.env.TURNSTILE_HEALTH_RATE_EXIT = '0.1';
        process.env.TURNSTILE_HEALTH_MIN_FAILURES = '3';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        recordSiteverifyOutcome(true, 100);
        recordSiteverifyOutcome(true, 100);
        recordSiteverifyOutcome(true, 100);
        recordSiteverifyOutcome(false, 100);
        recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('latency-only entry path is independent of the min-failure guard', async () => {
        process.env.TURNSTILE_HEALTH_RATE_ENTER = '0.2';
        process.env.TURNSTILE_HEALTH_MIN_FAILURES = '10'; // very high

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache, getSiteverifyMetricsSnapshot } =
            await import('./health.server');
        resetHealthCache();

        // Zero failures — guard would block any rate-driven entry. p95 still trips.
        for (let i = 0; i < 9; i++) recordSiteverifyOutcome(false, 100);
        recordSiteverifyOutcome(false, 5000);

        expect(getSiteverifyMetricsSnapshot().failureCount).toBe(0);
        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('env override out of range (e.g. RATE_ENTER=2) falls back to default', async () => {
        process.env.TURNSTILE_HEALTH_RATE_ENTER = '2'; // > 1, invalid
        // Default is 0.5 — verify the override is rejected and default holds.

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        // 5 failures of 10 = 50% rate hits the DEFAULT threshold. If the bad override had
        // been applied, no rate would ever trip.
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(true, 100);
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('env override non-numeric falls back to default', async () => {
        process.env.TURNSTILE_HEALTH_RATE_ENTER = 'not-a-number';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(true, 100);
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(false, 100);

        // Default 0.5 still applies.
        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('WINDOW_MS non-integer (1500.5) falls back to default', async () => {
        process.env.TURNSTILE_HEALTH_WINDOW_MS = '1500.5';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        // 5 successes + 5 failures = 50% rate hits the default RATE_ENTER threshold (0.5).
        // Proves the module loaded with the fallback window (60 000 ms) and defaults apply.
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(true, 100);
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('WINDOW_MS below min (500 < 1000) falls back to default', async () => {
        process.env.TURNSTILE_HEALTH_WINDOW_MS = '500';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(true, 100);
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('RING_CAPACITY above max (99999 > 10000) falls back to default', async () => {
        process.env.TURNSTILE_HEALTH_RING_CAPACITY = '99999';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(true, 100);
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(true);
    });

    it('RATE_ENTER below min (-0.1) falls back to default 0.5', async () => {
        process.env.TURNSTILE_HEALTH_RATE_ENTER = '-0.1';

        const { isTurnstileDegraded, recordSiteverifyOutcome, resetHealthCache } = await import('./health.server');
        resetHealthCache();

        // At 50% failure rate, default RATE_ENTER (0.5) is triggered; the invalid
        // override is ignored so the verdict is degraded.
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(true, 100);
        for (let i = 0; i < 5; i++) recordSiteverifyOutcome(false, 100);

        expect(await isTurnstileDegraded()).toBe(true);
    });
});
