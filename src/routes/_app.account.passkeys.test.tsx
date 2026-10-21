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
import { describe, test, expect, vi, beforeEach } from 'vitest';

// A plain function, not vi.fn(): Vitest's spy attaches its own handler to any promise a vi.fn()
// returns, which would hide the unhandled rejection the loader test below checks for.
const passkeyList = vi.hoisted(() => ({
    calls: 0,
    result: undefined as Promise<unknown> | undefined,
}));

vi.mock('@/middlewares/auth.server', () => ({
    getPasskeyList: () => {
        passkeyList.calls += 1;
        return passkeyList.result;
    },
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        getConfig: vi.fn(() => ({ features: { passkey: { enabled: true } } })),
    };
});

import { loader } from './_app.account.passkeys';
import { getConfig } from '@salesforce/storefront-next-runtime/config';

describe('Account Passkeys Route (_app.account.passkeys)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        passkeyList.calls = 0;
        passkeyList.result = undefined;
    });

    describe('loader', () => {
        test('throws a 404 response when the passkey feature is disabled', () => {
            vi.mocked(getConfig).mockReturnValueOnce({ features: { passkey: { enabled: false } } } as any);

            let thrown: unknown;
            try {
                loader({ context: {} as any } as any);
            } catch (error) {
                thrown = error;
            }

            expect(thrown).toBeInstanceOf(Response);
            expect((thrown as Response).status).toBe(404);
            expect(passkeyList.calls).toBe(0);
        });

        test('returns the credentials promise from getPasskeyList', async () => {
            const credentials = [{ credentialId: 'cred-1', nickName: 'MacBook Pro' }];
            passkeyList.result = Promise.resolve(credentials);

            const result = loader({ context: {} as any } as any);

            expect(passkeyList.calls).toBe(1);
            expect(result.credentials).toBeInstanceOf(Promise);
            await expect(result.credentials).resolves.toEqual(credentials);
        });

        test('observes the credentials promise so a rejection is not unhandled when the page never renders', async () => {
            // A signed-out shopper is redirected to login by the parent _app.account loader, which
            // runs in parallel with this one. React Router then discards this loader's data, so no
            // <Await> ever subscribes to credentials. The guest token can't resolve a login email,
            // so getPasskeyList rejects.
            const unhandledRejections: unknown[] = [];
            const onUnhandledRejection = (reason: unknown) => {
                unhandledRejections.push(reason);
            };
            process.on('unhandledRejection', onUnhandledRejection);

            try {
                passkeyList.result = Promise.reject(
                    new Error('Could not resolve access token/login email for passkey management')
                );

                const result = loader({ context: {} as any } as any);

                // Node emits unhandledRejection once the microtask queue drains, before the next
                // macrotask, so a setTimeout(0) is the earliest point where it would have fired.
                await new Promise((resolve) => setTimeout(resolve, 0));
                expect(unhandledRejections).toHaveLength(0);

                // The observer must not swallow the rejection: the list's <Await errorElement> still needs it.
                await expect(result.credentials).rejects.toThrow('Could not resolve access token/login email');
            } finally {
                process.off('unhandledRejection', onUnhandledRejection);
            }
        });
    });
});
