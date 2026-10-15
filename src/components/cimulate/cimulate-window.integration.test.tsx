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
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));

const config = {
    enabled: true,
    commerceClientScriptSourceUrl: 'https://cdn.search.cimulate.ai/copilot-widget/1.39.0/messaging.umd.js',
    scrt2Url: 'https://example.salesforce-scrt.com',
    salesforceOrgId: '00D000000000001',
    esDeveloperName: 'Commerce_Agent',
};

describe('CimulateWindow identity-link retry integration', () => {
    const tokenKey = 'cim_af_ct_00D000000000001_Commerce_Agent';
    const conversationKey = 'cim_af_conv_00D000000000001_Commerce_Agent';
    const guest = { siteId: 'RefArch', userType: 'guest' as const, usid: 'guest' };
    const registered = { siteId: 'RefArch', userType: 'registered' as const, customerId: 'customer' };
    const storeToken = (token: string) => sessionStorage.setItem(tokenKey, JSON.stringify({ accessToken: token }));
    const ready = () =>
        act(async () => {
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
            await Promise.resolve();
        });

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        storeToken('old');
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
        delete window.CimulateMessaging;
    });

    async function setup(
        fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true })))
    ) {
        const getAuthLinkKey = vi.fn().mockResolvedValue('key');
        const endConversation = vi.fn();
        window.CimulateMessaging = {
            CIMULATE_WIDGET_READY_EVENT: 'onCimulateWidgetReady',
            injectMessagingWidget: vi.fn(),
            getAuthLinkKey,
            eventHandlers: { session: { endConversation } },
        };
        vi.stubGlobal('fetch', fetchMock);
        (await import('./cimulate-conversation')).__resetCimulateLifecycleForTests();
        const { CimulateWindow } = await import('./cimulate-window');
        return { CimulateWindow, getAuthLinkKey, fetchMock, endConversation };
    }

    it('supersedes a 3600-second retry immediately without running the old retry', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    success: false,
                    error: {
                        code: 'TOKEN_BRIDGE_RATE_LIMITED',
                        retryable: true,
                        retryAfterSeconds: 3600,
                    },
                })
            )
            .mockResolvedValue(Response.json({ success: true }));
        const { CimulateWindow, getAuthLinkKey } = await setup(fetchMock);
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'old-id' }));
        const { rerender } = render(<CimulateWindow config={config} identity={guest} />);
        await act(async () => {});
        expect(fetchMock).toHaveBeenCalledOnce();
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={registered} />);
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3600000);
        });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
    });

    it.each(['queued', 'polling', 'timeout'])('preserves ready rotation through login when %s', async (phase) => {
        let release: (() => void) | undefined;
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true })));
        if (phase === 'queued')
            fetchMock.mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        release = () => resolve(Response.json({ success: true }));
                    })
            );
        const { CimulateWindow, getAuthLinkKey } = await setup(fetchMock);
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'old-id' }));
        const { rerender } = render(<CimulateWindow config={config} identity={guest} />);
        await act(async () => {});
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        await ready();
        if (phase === 'timeout')
            await act(async () => {
                await vi.advanceTimersByTimeAsync(4500);
            });
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={registered} />);
            await Promise.resolve();
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        await act(async () => {
            release?.();
            await Promise.resolve();
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(99);
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        storeToken('fresh');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('uses the latest exclusion for two ready events queued behind an active link', async () => {
        let release: (() => void) | undefined;
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true })));
        fetchMock.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    release = () => resolve(Response.json({ success: true }));
                })
        );
        const { CimulateWindow, getAuthLinkKey } = await setup(fetchMock);
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'old-id' }));
        render(<CimulateWindow config={config} identity={guest} />);
        await act(async () => {});
        storeToken('T1');
        await ready();
        await ready();
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        await act(async () => {
            release?.();
            await Promise.resolve();
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(99);
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        storeToken('T2');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
        false,
        true,
    ])('preserves the logout exclusion on ready (previous attempted token: %s)', async (hasAttemptedToken) => {
        if (!hasAttemptedToken) sessionStorage.clear();
        const { CimulateWindow, getAuthLinkKey } = await setup();
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'old-id' }));
        const { rerender } = render(<CimulateWindow config={config} identity={registered} />);
        await act(async () => {});
        storeToken('private-at-logout');
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={guest} />);
            await Promise.resolve();
        });
        await ready();
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        storeToken('replacement');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
    });

    it('latches logout rotation before a rapid login while SDK reset is pending', async () => {
        const { CimulateWindow, getAuthLinkKey, endConversation } = await setup();
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'old-id' }));
        const { rerender } = render(<CimulateWindow config={config} identity={registered} />);
        await act(async () => {});
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={guest} />);
            await Promise.resolve();
        });
        expect(endConversation).toHaveBeenCalledOnce();
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={registered} />);
            await Promise.resolve();
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        storeToken('fresh');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
    });

    it('excludes the current logout token even when an older ready rotation is pending', async () => {
        const { CimulateWindow, getAuthLinkKey } = await setup();
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'old-id' }));
        const { rerender } = render(<CimulateWindow config={config} identity={registered} />);
        await act(async () => {});
        await ready();
        storeToken('current-private-token');
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={guest} />);
            await Promise.resolve();
        });
        await act(async () => {
            rerender(<CimulateWindow config={config} identity={registered} />);
            await Promise.resolve();
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        storeToken('replacement');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
    });

    it('inherits a pending first-token wait with undefined exclusion across login and remount', async () => {
        sessionStorage.clear();
        const { CimulateWindow, getAuthLinkKey } = await setup();
        const first = render(<CimulateWindow config={config} identity={guest} />);
        await ready();
        localStorage.setItem(conversationKey, JSON.stringify({ conversationId: 'new-id' }));
        await act(async () => {
            first.rerender(<CimulateWindow config={config} identity={registered} />);
            await Promise.resolve();
        });
        expect(getAuthLinkKey).not.toHaveBeenCalled();
        first.unmount();
        render(<CimulateWindow config={config} identity={registered} />);
        storeToken('first-token');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();
    });

    it('waits for Retry-After and obtains a fresh AuthLink key for the bounded retry', async () => {
        vi.useFakeTimers();
        const getAuthLinkKey = vi.fn().mockResolvedValueOnce('key-1').mockResolvedValueOnce('key-2');
        window.CimulateMessaging = {
            CIMULATE_WIDGET_READY_EVENT: 'onCimulateWidgetReady',
            injectMessagingWidget: vi.fn(),
            getAuthLinkKey,
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    success: false,
                    error: { code: 'TOKEN_BRIDGE_RATE_LIMITED', retryable: true, retryAfterSeconds: 2 },
                })
            )
            .mockResolvedValueOnce(Response.json({ success: true }));
        vi.stubGlobal('fetch', fetchMock);
        (await import('./cimulate-conversation')).__resetCimulateLifecycleForTests();
        const { CimulateWindow } = await import('./cimulate-window');
        render(<CimulateWindow config={config} />);

        await act(async () => {
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(getAuthLinkKey).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledOnce();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1999);
        });
        expect(getAuthLinkKey).toHaveBeenCalledOnce();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });

        expect(getAuthLinkKey).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ auth_link_key: 'key-1' });
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ auth_link_key: 'key-2' });
    });
});
