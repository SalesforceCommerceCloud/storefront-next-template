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

import { runInNewContext } from 'node:vm';
import type { Request, Route } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CIMULATE_E2E_CONFIG, getCapturedTokenBridgeRequests, installCimulateStubHooks } from './cimulate-stub';

describe('Cimulate E2E observations', () => {
    const state = {
        injectCalls: 1,
        authLinkKeyCalls: 1,
        completedTokenBridgeCalls: 1,
        endConversationCalls: 0,
        endingConversation: false,
        startConversation: vi.fn(),
    };
    const routes: Record<string, (route: Route, request: Request) => Promise<void>> = {};
    const page = {
        route: vi.fn(async (matcher: string, handler: (route: Route, request: Request) => Promise<void>) => {
            routes[matcher] = handler;
        }),
        unroute: vi.fn(),
        evaluate: vi.fn(async (callback: () => unknown) => callback()),
        waitForFunction: vi.fn(async (callback: (arg: never) => boolean, arg: never) => {
            while (!callback(arg)) await new Promise((resolve) => setTimeout(resolve, 10));
        }),
    };
    let beforeHook: () => Promise<void>;
    let afterHook: () => Promise<void>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetModules();
        vi.clearAllMocks();
        for (const matcher of Object.keys(routes)) delete routes[matcher];
        Object.assign(state, { authLinkKeyCalls: 1, completedTokenBridgeCalls: 1, endingConversation: false });
        vi.stubGlobal('window', { __cimulateFake: state });
        vi.stubGlobal('inject', () => ({
            I: { usePlaywrightTo: (_name: string, callback: (args: unknown) => unknown) => callback({ page }) },
        }));
        vi.stubGlobal('locate', () => ({ as: () => ({}) }));
        vi.stubGlobal('Before', (hook: () => Promise<void>) => {
            beforeHook = hook;
        });
        vi.stubGlobal('After', (hook: () => Promise<void>) => {
            afterHook = hook;
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('includes a late duplicate and waits for its completed bridge call in the final count', async () => {
        const { default: cimulatePage } = await import('../pages/cimulate.page');
        let settled = false;
        const observation = cimulatePage.getSettledFakeState(1).then((snapshot) => {
            settled = true;
            return snapshot;
        });
        setTimeout(() => {
            state.authLinkKeyCalls = 2;
        }, 750);
        setTimeout(() => {
            state.completedTokenBridgeCalls = 2;
        }, 1150);

        await vi.advanceTimersByTimeAsync(1000);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(150);
        const snapshot = await observation;
        expect(snapshot.authLinkKeyCalls).toBe(2);
        expect(snapshot.completedTokenBridgeCalls).toBe(2);
    });

    it('does not start the stability window before the first bridge call completes', async () => {
        const { default: cimulatePage } = await import('../pages/cimulate.page');
        state.completedTokenBridgeCalls = 0;
        let settled = false;
        const observation = cimulatePage.getSettledFakeState(1).then(() => {
            settled = true;
        });
        setTimeout(() => {
            state.completedTokenBridgeCalls = 1;
        }, 500);

        await vi.advanceTimersByTimeAsync(1490);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(10);
        await observation;
        expect(settled).toBe(true);
    });

    it('captures headers and fulfills without evaluating the current document, using the same route/unroute matcher', async () => {
        installCimulateStubHooks();
        await beforeHook();
        const matcher = Object.keys(routes).find((key) => key.includes('cimulate-token-bridge')) ?? '';
        expect(matcher).not.toBe('');
        let finish!: () => void;
        const fulfilled = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const request = {
            postData: () => '{"auth_link_key":"fake-key"}',
            allHeaders: async () => ({ cookie: 'same-origin-session', 'content-type': 'application/json' }),
        };
        const pending = routes[matcher](
            { fulfill: () => fulfilled } as unknown as Route,
            request as unknown as Request
        );
        await Promise.resolve();
        expect(state.completedTokenBridgeCalls).toBe(1);
        finish();
        await pending;
        expect(state.completedTokenBridgeCalls).toBe(1);
        expect(page.evaluate).not.toHaveBeenCalled();
        expect(getCapturedTokenBridgeRequests()).toEqual([
            { body: request.postData(), headers: await request.allHeaders() },
        ]);
        await afterHook();
        expect(page.unroute).toHaveBeenCalledWith(matcher);
    });

    describe('fake fetch completion', () => {
        const nativeFetch = vi.fn<typeof fetch>();
        const fakeWindow = {
            fetch: nativeFetch,
            location: { href: 'http://localhost:5173/' },
            __cimulateFake: { completedTokenBridgeCalls: 0 },
        };

        beforeEach(async () => {
            nativeFetch.mockReset().mockImplementation(async () => new Response('{"success":true}'));
            fakeWindow.fetch = nativeFetch;
            installCimulateStubHooks();
            await beforeHook();
            await routes[CIMULATE_E2E_CONFIG.commerceClientScriptSourceUrl](
                {
                    fulfill: async ({ body }: { body: string }) => {
                        runInNewContext(body, { window: fakeWindow, URL });
                    },
                } as unknown as Route,
                {} as Request
            );
        });

        it('credits only the originating fake when it is replaced while a bridge response is pending', async () => {
            let respond!: (response: Response) => void;
            nativeFetch.mockReturnValue(
                new Promise<Response>((resolve) => {
                    respond = resolve;
                })
            );
            const original = fakeWindow.__cimulateFake;
            const pending = fakeWindow.fetch('/resource/cimulate-token-bridge', { method: 'POST' });
            fakeWindow.__cimulateFake = { completedTokenBridgeCalls: 0 };

            respond(new Response('{"success":true}'));
            await pending;
            expect(original.completedTokenBridgeCalls).toBe(1);
            expect(fakeWindow.__cimulateFake.completedTokenBridgeCalls).toBe(0);
        });

        it('waits for the response body without consuming the response returned to the app', async () => {
            let finish!: () => void;
            const response = new Response('{"success":true}');
            const body = new Promise<string>((resolve) => {
                finish = () => resolve('{"success":true}');
            });
            const text = vi.fn(() => body);
            vi.spyOn(response, 'clone').mockReturnValue({ text } as unknown as Response);
            nativeFetch.mockResolvedValue(response);
            let settled = false;
            const pending = fakeWindow.fetch('/resource/cimulate-token-bridge', { method: 'POST' }).then((result) => {
                settled = true;
                return result;
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(text).toHaveBeenCalledOnce();
            expect(settled).toBe(false);
            expect(fakeWindow.__cimulateFake.completedTokenBridgeCalls).toBe(0);

            finish();
            expect(await pending).toBe(response);
            expect(await response.json()).toEqual({ success: true });
            expect(fakeWindow.__cimulateFake.completedTokenBridgeCalls).toBe(1);
        });

        it.each([
            ['/resource/cimulate-token-bridge', 'GET'],
            ['/resource/cimulate-token-bridge-extra', 'POST'],
            ['/resource/cimulate-token-bridge/nested', 'POST'],
            ['/resource/other?next=/resource/cimulate-token-bridge', 'POST'],
            ['https://other.example/resource/cimulate-token-bridge', 'POST'],
        ])('does not count non-bridge requests: %s %s', async (url, method) => {
            const response = await fakeWindow.fetch(url, { method });
            expect(fakeWindow.__cimulateFake.completedTokenBridgeCalls).toBe(0);
            expect(nativeFetch).toHaveBeenCalledWith(url, { method });
            expect(await response.json()).toEqual({ success: true });
        });

        it.each([
            [new URL('http://localhost:5173/site/en-US/resource/cimulate-token-bridge'), { method: 'POST' }],
            [
                new globalThis.Request('http://localhost:5173/resource/cimulate-token-bridge', { method: 'POST' }),
                undefined,
            ],
        ])('counts same-origin bridge POSTs using URL and Request inputs', async (input, init) => {
            await fakeWindow.fetch(input, init);
            expect(fakeWindow.__cimulateFake.completedTokenBridgeCalls).toBe(1);
        });

        it('does not count a rejected fetch', async () => {
            nativeFetch.mockRejectedValue(new Error('document unloaded'));
            await expect(fakeWindow.fetch('/resource/cimulate-token-bridge', { method: 'POST' })).rejects.toThrow(
                'document unloaded'
            );
            expect(fakeWindow.__cimulateFake.completedTokenBridgeCalls).toBe(0);
        });
    });

    it('models 1.39 endConversation as a void dispatch with delayed reset and no replacement', async () => {
        installCimulateStubHooks();
        await beforeHook();
        let script = '';
        await routes[CIMULATE_E2E_CONFIG.commerceClientScriptSourceUrl](
            {
                fulfill: async ({ body }: { body: string }) => {
                    script = body;
                },
            } as unknown as Route,
            {} as Request
        );
        const local = new Map<string, string>();
        const session = new Map<string, string>();
        const container = { innerHTML: '', appendChild: vi.fn(), classList: { add: vi.fn() } };
        const message = { setAttribute: vi.fn(), textContent: '', classList: { add: vi.fn() } };
        const fakeWindow = { dispatchEvent: vi.fn(), fetch: vi.fn(), location: { href: 'http://localhost:5173/' } };
        const context = {
            window: fakeWindow,
            document: {
                getElementById: () => container,
                createElement: () => message,
            },
            localStorage: {
                getItem: (key: string) => local.get(key),
                setItem: (key: string, value: string) => local.set(key, value),
                removeItem: (key: string) => local.delete(key),
            },
            sessionStorage: {
                setItem: (key: string, value: string) => session.set(key, value),
                removeItem: (key: string) => session.delete(key),
            },
            CustomEvent: class {
                constructor(public type: string) {}
            },
            setTimeout,
            URL,
        };
        runInNewContext(script, context);
        const sdk = fakeWindow as typeof fakeWindow & {
            CimulateMessaging: {
                injectMessagingWidget: (options: { elementId: string; globalClassName: string }) => void;
                eventHandlers: { session: { endConversation: () => void } };
            };
            __cimulateFake: {
                startConversation: () => void;
                endConversationCalls: number;
                endingConversation: boolean;
            };
        };
        sdk.CimulateMessaging.injectMessagingWidget({
            elementId: 'widget',
            globalClassName: 'commerce-client-shopper-agent',
        });
        expect(container.classList.add).toHaveBeenCalledWith('commerce-client-shopper-agent');
        expect(message.classList.add).toHaveBeenCalledWith('commerce-client-shopper-agent');
        await vi.advanceTimersByTimeAsync(10);
        expect(local.size).toBe(1);
        expect(session.size).toBe(1);
        expect(sdk.CimulateMessaging).not.toHaveProperty('endConversation');
        expect(sdk.CimulateMessaging.eventHandlers.session.endConversation()).toBeUndefined();
        expect(sdk.__cimulateFake.endConversationCalls).toBe(1);
        expect(local.size).toBe(1);
        expect(sdk.__cimulateFake.endingConversation).toBe(true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(local.size).toBe(0);
        expect(session.size).toBe(0);
        expect(sdk.__cimulateFake.endingConversation).toBe(false);
        expect(fakeWindow.dispatchEvent).toHaveBeenCalledTimes(1);
        vi.stubGlobal('window', sdk);
        const { default: cimulatePage } = await import('../pages/cimulate.page');
        await cimulatePage.startFreshConversation();
        expect(local.size).toBe(1);
        expect(session.size).toBe(1);
        expect(fakeWindow.dispatchEvent).toHaveBeenCalledTimes(2);
    });
});
