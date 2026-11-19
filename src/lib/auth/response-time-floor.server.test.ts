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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD_RESET_MIN_RESPONSE_MS, withMinimumDuration } from './response-time-floor.server';

describe('withMinimumDuration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Resolves with the elapsed fake time once the promise settles. */
    const timeIt = async (promise: Promise<unknown>) => {
        const start = performance.now();
        let settledAt: number | undefined;
        const tracked = promise.then(
            () => {
                settledAt = performance.now();
            },
            () => {
                settledAt = performance.now();
            }
        );
        await vi.runAllTimersAsync();
        await tracked;
        return (settledAt ?? Number.NaN) - start;
    };

    it('holds a fast success until the floor has elapsed', async () => {
        const result = withMinimumDuration(1000, () => Promise.resolve('ok'));

        expect(await timeIt(result)).toBeGreaterThanOrEqual(1000);
        await expect(result).resolves.toBe('ok');
    });

    it('holds a fast failure until the floor has elapsed, then rethrows', async () => {
        const result = withMinimumDuration(1000, () => Promise.reject(new Error('boom')));
        // Attach the handler up front so the rejection is never reported as unhandled.
        const assertion = expect(result).rejects.toThrow('boom');

        expect(await timeIt(result)).toBeGreaterThanOrEqual(1000);
        await assertion;
    });

    it('gives a fast and a slow-but-under-floor path the same duration', async () => {
        const fast = timeIt(withMinimumDuration(1000, () => Promise.resolve()));
        const slow = timeIt(withMinimumDuration(1000, () => new Promise<void>((resolve) => setTimeout(resolve, 600))));

        const [fastMs, slowMs] = await Promise.all([fast, slow]);

        expect(fastMs).toBe(slowMs);
        expect(fastMs).toBeGreaterThanOrEqual(1000);
    });

    it('does not add any delay once the work has already overrun the floor', async () => {
        const result = withMinimumDuration(1000, () => new Promise<void>((resolve) => setTimeout(resolve, 1500)));

        expect(await timeIt(result)).toBe(1500);
    });

    it('exposes a floor above the slowest measured SLAS reset path (p90 ~620 ms)', () => {
        expect(PASSWORD_RESET_MIN_RESPONSE_MS).toBeGreaterThan(620);
    });
});
