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
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { endCimulateConversation, linkCimulateIdentity } from './cimulate-identity-link';
import { waitForRotatedConversationToken, type CimulateIdentitySnapshot } from './cimulate-conversation';

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('./cimulate-identity-link', () => ({
    linkCimulateIdentity: vi.fn(),
    endCimulateConversation: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('./cimulate-conversation', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./cimulate-conversation')>();
    return {
        ...actual,
        // Resolve the rotation poll instantly so these tests don't wait out the real backoff.
        waitForRotatedConversationToken: vi.fn().mockResolvedValue('rotated-token'),
    };
});

/** Reset module-level lifecycle state, then load the window from the same (mocked) module registry. */
async function loadWindow() {
    const conversation = await import('./cimulate-conversation');
    conversation.__resetCimulateLifecycleForTests();
    return import('./cimulate-window');
}

const conversationIdKey = 'cim_af_conv_00D000000000001_Commerce_Agent';
const tokenKey = 'cim_af_ct_00D000000000001_Commerce_Agent';
const storeConversation = (id = 'existing-conversation-id') =>
    localStorage.setItem(conversationIdKey, JSON.stringify({ conversationId: id, storedAt: 1 }));

const config = {
    enabled: true,
    commerceClientScriptSourceUrl: 'https://cdn.search.cimulate.ai/copilot-widget/1.39.0/messaging.umd.js',
    scrt2Url: 'https://example.salesforce-scrt.com',
    salesforceOrgId: '00D000000000001',
    esDeveloperName: 'Commerce_Agent',
};

describe('CimulateWindow identity linking', () => {
    const injectMessagingWidget = vi.fn();
    const mockLinkIdentity = vi.mocked(linkCimulateIdentity);

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockLinkIdentity.mockResolvedValue({ success: true });
        window.CimulateMessaging = {
            CIMULATE_WIDGET_READY_EVENT: 'onCimulateWidgetReady',
            injectMessagingWidget,
        };
    });

    afterEach(() => {
        cleanup();
        delete window.CimulateMessaging;
    });

    it('links on every widget-ready event, not just the first', async () => {
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);

        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());
        expect(mockLinkIdentity).not.toHaveBeenCalled();

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
    });

    it('subscribes before widget injection can synchronously signal readiness', async () => {
        injectMessagingWidget.mockImplementationOnce(() => {
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        });
        const { CimulateWindow } = await loadWindow();

        render(<CimulateWindow config={config} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
    });

    it('logs only the stable error code when identity linking fails', async () => {
        const { CimulateWindow } = await loadWindow();
        mockLinkIdentity.mockResolvedValue({
            success: false,
            error: { code: 'TOKEN_BRIDGE_AUTHORIZATION', retryable: false },
        });
        render(<CimulateWindow config={config} />);

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() =>
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Cimulate identity linking failed',
                expect.objectContaining({ code: 'TOKEN_BRIDGE_AUTHORIZATION' })
            )
        );
        expect(mockLinkIdentity).toHaveBeenCalledOnce();
    });

    it('removes the readiness listener on unmount', async () => {
        const { CimulateWindow } = await loadWindow();
        const { unmount } = render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        unmount();
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        expect(mockLinkIdentity).not.toHaveBeenCalled();
    });

    it('keeps identity linking active through Strict Mode effect replay', async () => {
        const { CimulateWindow } = await loadWindow();
        render(
            <StrictMode>
                <CimulateWindow config={config} />
            </StrictMode>
        );

        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
    });

    it('uses a fresh full-flow attempt after a retryable failure', async () => {
        const { CimulateWindow } = await loadWindow();
        mockLinkIdentity
            .mockResolvedValueOnce({
                success: false,
                error: { code: 'TOKEN_BRIDGE_UNAVAILABLE', retryable: true, retryAfterSeconds: 0 },
            })
            .mockResolvedValueOnce({ success: true });
        render(<CimulateWindow config={config} />);

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
        expect(mockLogger.error).not.toHaveBeenCalledWith('Cimulate identity linking failed', expect.anything());
    });

    it('keeps the readiness listener when widget options change after injection', async () => {
        const { CimulateWindow } = await loadWindow();
        const { rerender } = render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        rerender(<CimulateWindow config={{ ...config, headerText: 'Updated' }} />);
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(injectMessagingWidget).toHaveBeenCalledOnce();
    });
});

describe('CimulateWindow new vs resumed conversation', () => {
    const injectMessagingWidget = vi.fn();
    const mockLinkIdentity = vi.mocked(linkCimulateIdentity);
    const mockWaitForRotatedToken = vi.mocked(waitForRotatedConversationToken);

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockLinkIdentity.mockResolvedValue({ success: true });
        mockWaitForRotatedToken.mockResolvedValue('rotated-token');
        window.CimulateMessaging = {
            CIMULATE_WIDGET_READY_EVENT: 'onCimulateWidgetReady',
            injectMessagingWidget,
        };
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
        sessionStorage.clear();
        document.querySelector('[data-cimulate-quarantine]')?.remove();
        document.querySelector('.commerce-client-shopper-agent')?.remove();
        vi.restoreAllMocks();
        delete window.CimulateMessaging;
    });

    it('waits for a rotated conversation token before linking a brand-new conversation', async () => {
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());
        expect(mockLinkIdentity).not.toHaveBeenCalled();

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(mockWaitForRotatedToken).toHaveBeenCalledOnce();
    });

    it('excludes the last attempted token when waiting for the next new conversation', async () => {
        mockWaitForRotatedToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));

        expect(mockWaitForRotatedToken.mock.calls[0][1]).toBeUndefined();
        expect(mockWaitForRotatedToken.mock.calls[1][1]).toBe('token-1');
    });

    it('links a resumed conversation on mount without a ready event or token wait', async () => {
        storeConversation();
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(mockWaitForRotatedToken).not.toHaveBeenCalled();
    });

    it('does not re-link a resumed conversation after a remount', async () => {
        storeConversation();
        const { CimulateWindow } = await loadWindow();
        const { unmount } = render(<CimulateWindow config={config} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        unmount();
        render(<CimulateWindow config={config} />);

        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalled());
        expect(mockLinkIdentity).toHaveBeenCalledOnce();
    });

    it('does not link on mount when there is no stored conversation', async () => {
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        expect(mockLinkIdentity).not.toHaveBeenCalled();
    });

    it('does not link when no new conversation token appears', async () => {
        mockWaitForRotatedToken.mockResolvedValue(undefined);
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLogger.warn).toHaveBeenCalled());
        expect(mockLinkIdentity).not.toHaveBeenCalled();
    });

    it('falls back to the last linked token when excluding the previous conversation', async () => {
        mockWaitForRotatedToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} identity={{ siteId: 'RefArch', userType: 'guest', usid: 'u' }} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        sessionStorage.setItem(tokenKey, JSON.stringify({ accessToken: 'token-1' }));
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockWaitForRotatedToken).toHaveBeenCalledTimes(2));

        expect(mockWaitForRotatedToken.mock.calls[1][1]).toBe('token-1');
    });

    it('re-links on ready even for the same conversation and identity when a token is excluded', async () => {
        storeConversation();
        sessionStorage.setItem(tokenKey, JSON.stringify({ accessToken: 'token-1' }));
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} identity={{ siteId: 'RefArch', userType: 'guest', usid: 'u' }} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
    });

    it('serializes ready-event links with the queue so they never overlap', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        mockLinkIdentity.mockImplementation(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 10));
            inFlight -= 1;
            return { success: true };
        });
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        // The first event's generation is superseded by the second, so only the newest links.
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(maxInFlight).toBe(1);
    });
});

describe('CimulateWindow identity-change lifecycle', () => {
    const injectMessagingWidget = vi.fn();
    const mockLinkIdentity = vi.mocked(linkCimulateIdentity);
    const mockEndConversation = vi.mocked(endCimulateConversation);

    const guestIdentity = (suffix = '1'): CimulateIdentitySnapshot => ({
        siteId: 'RefArch',
        userType: 'guest',
        usid: `usid-${suffix}`,
    });
    const registeredIdentity = (suffix = '1'): CimulateIdentitySnapshot => ({
        siteId: 'RefArch',
        userType: 'registered',
        customerId: `cust-${suffix}`,
    });

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockLinkIdentity.mockResolvedValue({ success: true });
        mockEndConversation.mockResolvedValue({ success: true });
        vi.mocked(waitForRotatedConversationToken).mockResolvedValue('rotated-token');
        window.CimulateMessaging = {
            CIMULATE_WIDGET_READY_EVENT: 'onCimulateWidgetReady',
            injectMessagingWidget,
        };
        storeConversation();
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
        sessionStorage.clear();
        document.querySelector('[data-cimulate-quarantine]')?.remove();
        document.querySelectorAll('.commerce-client-shopper-agent').forEach((portal) => portal.remove());
        vi.restoreAllMocks();
        delete window.CimulateMessaging;
    });

    it('re-links on login without ending the conversation', async () => {
        const { CimulateWindow } = await loadWindow();
        const { rerender } = render(<CimulateWindow config={config} identity={guestIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        rerender(<CimulateWindow config={config} identity={registeredIdentity()} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
        expect(mockEndConversation).not.toHaveBeenCalled();
    });

    it('re-links when a guest usid rotates', async () => {
        const { CimulateWindow } = await loadWindow();
        const { rerender } = render(<CimulateWindow config={config} identity={guestIdentity('a')} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        rerender(<CimulateWindow config={config} identity={guestIdentity('b')} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
    });

    it('ends the conversation on logout and links nothing until the next ready event', async () => {
        const { CimulateWindow } = await loadWindow();
        const { rerender } = render(<CimulateWindow config={config} identity={registeredIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        rerender(<CimulateWindow config={config} identity={guestIdentity()} />);

        await waitFor(() => expect(mockEndConversation).toHaveBeenCalledOnce());
        expect(mockLinkIdentity).toHaveBeenCalledOnce();

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
    });

    it('ends the conversation on logout without waiting behind queued link work', async () => {
        sessionStorage.setItem(tokenKey, JSON.stringify({ accessToken: 'token-1' }));
        const { CimulateWindow } = await loadWindow();
        const { rerender } = render(<CimulateWindow config={config} identity={registeredIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        let releaseLink: (() => void) | undefined;
        mockLinkIdentity.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseLink = () => resolve({ success: true });
                })
        );
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));

        rerender(<CimulateWindow config={config} identity={guestIdentity()} />);

        await waitFor(() => expect(mockEndConversation).toHaveBeenCalledOnce());
        releaseLink?.();
    });

    it.each([
        false,
        true,
    ])('quarantines failed logout across ready and remount (storage throws: %s)', async (storageThrows) => {
        mockEndConversation.mockResolvedValue({ success: false });
        const portal = document.createElement('div');
        portal.className = 'commerce-client-shopper-agent';
        portal.innerHTML = '<button>Private transcript</button>';
        document.body.appendChild(portal);
        for (const storage of [localStorage, sessionStorage]) {
            storage.setItem(tokenKey, JSON.stringify({ accessToken: 'private-token' }));
            storage.setItem(conversationIdKey, JSON.stringify({ conversationId: 'private-id' }));
            storage.setItem('unrelated', 'keep');
        }
        const { CimulateWindow } = await loadWindow();
        const { rerender, unmount } = render(<CimulateWindow config={config} identity={registeredIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(screen.getByRole('button', { name: 'Private transcript' })).toBeVisible();
        const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
        if (storageThrows)
            removeItem.mockImplementation(() => {
                throw new Error('private storage body');
            });

        rerender(<CimulateWindow config={config} identity={guestIdentity()} />);

        await waitFor(() => expect(portal).not.toBeVisible());
        expect(screen.queryByRole('button', { name: 'Private transcript' })).toBeNull();
        expect(screen.getByTestId('cimulate-agent-widget')).toHaveAttribute('inert');
        expect(mockLinkIdentity).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith('Cimulate logout quarantined', {
            code: 'CONVERSATION_END_FAILED',
            reason: 'logout',
        });
        expect(toast.error).toHaveBeenCalledWith(expect.any(String));
        expect(removeItem.mock.calls.every(([key]) => key === tokenKey || key === conversationIdKey)).toBe(true);
        for (const storage of [localStorage, sessionStorage]) {
            expect(storage.getItem('unrelated')).toBe('keep');
            if (!storageThrows) {
                expect(storage.getItem(tokenKey)).toBeNull();
                expect(storage.getItem(conversationIdKey)).toBeNull();
            }
        }
        await act(async () => {
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
            await Promise.resolve();
        });
        unmount();
        render(<CimulateWindow config={config} identity={registeredIdentity('new')} />);
        await act(async () => {
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
            await Promise.resolve();
        });
        expect(mockLinkIdentity).toHaveBeenCalledOnce();
        expect(screen.getByTestId('cimulate-agent-widget')).not.toBeVisible();
        expect(document.querySelectorAll('[data-cimulate-quarantine]')).toHaveLength(1);
    });

    it('hides the remounted container when an earlier logout fails asynchronously', async () => {
        let failLogout: (() => void) | undefined;
        mockEndConversation.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    failLogout = () => resolve({ success: false });
                })
        );
        const { CimulateWindow } = await loadWindow();
        const { rerender, unmount } = render(<CimulateWindow config={config} identity={registeredIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        rerender(<CimulateWindow config={config} identity={guestIdentity()} />);
        unmount();
        render(<CimulateWindow config={config} identity={guestIdentity()} />);
        await act(async () => {
            failLogout?.();
            await Promise.resolve();
        });
        expect(screen.getByTestId('cimulate-agent-widget')).not.toBeVisible();
        expect(screen.getByTestId('cimulate-agent-widget')).toHaveAttribute('inert');
        expect(mockLinkIdentity).toHaveBeenCalledOnce();
    });

    it('does not link an identity change when no conversation exists yet', async () => {
        localStorage.clear();
        const { CimulateWindow } = await loadWindow();
        const { rerender } = render(<CimulateWindow config={config} identity={guestIdentity()} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        rerender(<CimulateWindow config={config} identity={registeredIdentity()} />);

        await Promise.resolve();
        expect(mockLinkIdentity).not.toHaveBeenCalled();
    });

    it('keeps the identity baseline across a remount so a change is still detected', async () => {
        const { CimulateWindow } = await loadWindow();
        const first = render(<CimulateWindow config={config} identity={guestIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        first.unmount();

        render(<CimulateWindow config={config} identity={registeredIdentity()} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledTimes(2));
    });

    it('does not treat the first known identity as a change', async () => {
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} identity={guestIdentity()} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(mockEndConversation).not.toHaveBeenCalled();
    });

    it('skips a ready re-link for the same conversation and identity when no token is excluded', async () => {
        const { CimulateWindow } = await loadWindow();
        render(<CimulateWindow config={config} identity={guestIdentity()} />);
        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        await waitFor(() => expect(vi.mocked(waitForRotatedConversationToken)).toHaveBeenCalledOnce());

        expect(mockLinkIdentity).toHaveBeenCalledOnce();
    });
});
