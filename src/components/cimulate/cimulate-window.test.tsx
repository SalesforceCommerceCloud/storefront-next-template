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
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkCimulateIdentity } from './cimulate-identity-link';

const mockLogger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));
vi.mock('./cimulate-identity-link', () => ({ linkCimulateIdentity: vi.fn() }));

const config = {
    enabled: true,
    commerceClientScriptSourceUrl: 'https://cdn.search.cimulate.ai/copilot-widget/1.32.0/messaging.umd.js',
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

    it('links identity once when the connected widget signals readiness', async () => {
        const { CimulateWindow } = await import('./cimulate-window');
        render(<CimulateWindow config={config} />);

        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());
        expect(mockLinkIdentity).not.toHaveBeenCalled();

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
    });

    it('subscribes before widget injection can synchronously signal readiness', async () => {
        injectMessagingWidget.mockImplementationOnce(() => {
            window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));
        });
        const { CimulateWindow } = await import('./cimulate-window');

        render(<CimulateWindow config={config} />);

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
    });

    it('logs only the stable error code when identity linking fails', async () => {
        const { CimulateWindow } = await import('./cimulate-window');
        mockLinkIdentity.mockResolvedValue({
            success: false,
            error: { code: 'TOKEN_BRIDGE_AUTHORIZATION', retryable: false },
        });
        render(<CimulateWindow config={config} />);

        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() =>
            expect(mockLogger.error).toHaveBeenCalledWith('Cimulate identity linking failed', {
                code: 'TOKEN_BRIDGE_AUTHORIZATION',
            })
        );
        expect(mockLinkIdentity).toHaveBeenCalledOnce();
    });

    it('removes the readiness listener on unmount', async () => {
        const { CimulateWindow } = await import('./cimulate-window');
        const { unmount } = render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        unmount();
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        expect(mockLinkIdentity).not.toHaveBeenCalled();
    });

    it('keeps identity linking active through Strict Mode effect replay', async () => {
        const { CimulateWindow } = await import('./cimulate-window');
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
        const { CimulateWindow } = await import('./cimulate-window');
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
        const { CimulateWindow } = await import('./cimulate-window');
        const { rerender } = render(<CimulateWindow config={config} />);
        await waitFor(() => expect(injectMessagingWidget).toHaveBeenCalledOnce());

        rerender(<CimulateWindow config={{ ...config, headerText: 'Updated' }} />);
        window.dispatchEvent(new CustomEvent('onCimulateWidgetReady'));

        await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledOnce());
        expect(injectMessagingWidget).toHaveBeenCalledOnce();
    });
});
