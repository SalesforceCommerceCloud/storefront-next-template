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
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));

const config = {
    enabled: true,
    commerceClientScriptSourceUrl: 'https://cdn.search.cimulate.ai/copilot-widget/1.32.0/messaging.umd.js',
    scrt2Url: 'https://example.salesforce-scrt.com',
    salesforceOrgId: '00D000000000001',
    esDeveloperName: 'Commerce_Agent',
};

describe('CimulateWindow identity-link retry integration', () => {
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        delete window.CimulateMessaging;
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
