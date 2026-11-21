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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAuthRecovery, getAuthRecovery, observeAuthFailures } from '@/lib/auth/recovery';

afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthRecovery();
});
const failure = (url = '/login/agent') =>
    new Response('{"error":"ORDER_OUTCOME_UNKNOWN"}', {
        status: 502,
        headers: { 'x-sfnext-auth-error': 'TAOB_REAUTH_REQUIRED', 'x-sfnext-auth-recovery-url': url },
    });

describe('authentication recovery observer', () => {
    it('preserves an ambiguous order response and body without retry or mount-time fetching', async () => {
        const response = failure();
        const transport = vi.fn().mockResolvedValue(response);
        vi.stubGlobal('fetch', transport);
        const stop = observeAuthFailures('v1');
        expect(transport).not.toHaveBeenCalled();
        const observed = await fetch('/action/place-order?__authContext=v1', { method: 'POST' });
        expect(observed).toBe(response);
        expect(await observed.json()).toEqual({ error: 'ORDER_OUTCOME_UNKNOWN' });
        expect(transport).toHaveBeenCalledOnce();
        expect(getAuthRecovery()).toMatchObject({ url: '/login/agent', contextVersion: 'v1' });
        stop();
        expect(window.fetch).toBe(transport);
    });

    it.each([
        'https://unrelated.example/login/agent',
        '/resource/replay-order',
        '/action/place-order',
    ])('ignores unsafe recovery destinations %s', async (destination) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(destination)));
        const stop = observeAuthFailures('v1');
        await fetch('/action/place-order?__authContext=v1');
        expect(getAuthRecovery()).toBeNull();
        stop();
    });

    it('ignores failures from a previous context and from requests completed after unmount', async () => {
        let complete!: (response: Response) => void;
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(failure())
                .mockImplementationOnce(
                    () =>
                        new Promise<Response>((resolve) => {
                            complete = resolve;
                        })
                )
        );
        const stop = observeAuthFailures('current');
        await fetch('/action/place-order?__authContext=previous');
        expect(getAuthRecovery()).toBeNull();
        const pending = fetch('/action/place-order?__authContext=current');
        stop();
        complete(failure());
        await pending;
        expect(getAuthRecovery()).toBeNull();
    });
});
