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
import { checkTurnstileSessionVerified } from './check-session';

describe('checkTurnstileSessionVerified', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns true when BFF responds verified: true', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: () => ({ verified: true }),
        });
        await expect(checkTurnstileSessionVerified('/resource/turnstile-session', 'a@b.c')).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            '/resource/turnstile-session?email=a%40b.c',
            expect.objectContaining({ method: 'GET', credentials: 'same-origin' })
        );
    });

    it('returns false when BFF responds verified: false', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: () => ({ verified: false }),
        });
        await expect(checkTurnstileSessionVerified('/resource/turnstile-session', 'a@b.c')).resolves.toBe(false);
    });

    it('returns false on non-OK / network failure (fail closed for UI)', async () => {
        fetchMock.mockResolvedValue({ ok: false, json: () => ({ verified: true }) });
        await expect(checkTurnstileSessionVerified('/resource/turnstile-session', 'a@b.c')).resolves.toBe(false);

        fetchMock.mockRejectedValue(new Error('network'));
        await expect(checkTurnstileSessionVerified('/resource/turnstile-session', 'a@b.c')).resolves.toBe(false);
    });

    it('returns false for empty email or path without calling fetch', async () => {
        await expect(checkTurnstileSessionVerified('', 'a@b.c')).resolves.toBe(false);
        await expect(checkTurnstileSessionVerified('/resource/turnstile-session', '  ')).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
