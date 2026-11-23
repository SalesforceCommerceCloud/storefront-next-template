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
import { StrictMode, useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { getConsentAwareEventMediator, resetEventMediator } from '@salesforce/storefront-next-runtime/events';
import { useAuth } from '@/providers/auth';
import { useAnalytics } from '@/hooks/use-analytics';
import { addAdapter, getAllAdapters, removeAdapter } from '@/lib/adapters/engagement/store';
import { ensureAdaptersInitialized } from '@/lib/adapters/engagement/initialize';
import type { AppConfig } from '@/types/config';
import { mockConfig } from '@/test-utils/config';
import { TrackingConsent } from '@/types/tracking-consent';
import { EngagementConsentObserver } from '@/analytics/engagement-consent-observer';
import { PageViewTracker } from '@/analytics/page-view-tracker';

vi.unmock('@/hooks/use-analytics');
vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: vi.fn() }));
vi.mock('@/providers/auth', () => ({ useAuth: vi.fn() }));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@salesforce/storefront-next-runtime/site-context')>()),
    useSite: () => ({ site: { id: 'test' }, locale: { id: 'en-US' } }),
}));
vi.mock('@/lib/adapters/engagement/initialize', () => ({ ensureAdaptersInitialized: vi.fn() }));

const onConsentChange = vi.fn();
const sendEvent = vi.fn().mockResolvedValue(undefined);
let config: AppConfig;

function AnalyticsProbe() {
    const analytics = useAnalytics();
    return (
        <button
            onClick={() => {
                void analytics.trackViewPage({ url: '/manual' });
            }}>
            Track
        </button>
    );
}

function Harness() {
    const [consent, setConsent] = useState<TrackingConsent | undefined>();
    vi.mocked(useAuth).mockReturnValue(
        consent === undefined ? undefined : { userType: 'guest', trackingConsent: consent }
    );
    return (
        <>
            <EngagementConsentObserver />
            <PageViewTracker />
            <AnalyticsProbe />
            <button onClick={() => setConsent(TrackingConsent.Accepted)}>Accept</button>
            <button onClick={() => setConsent(TrackingConsent.Declined)}>Decline</button>
        </>
    );
}

function mount() {
    return render(
        <StrictMode>
            <RouterProvider router={createMemoryRouter([{ path: '*', Component: Harness }])} />
        </StrictMode>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    resetEventMediator();
    for (const adapter of getAllAdapters()) removeAdapter(adapter.name);
    config = {
        ...mockConfig,
        engagement: {
            ...mockConfig.engagement,
            analytics: {
                ...mockConfig.engagement.analytics,
                pageViewsBlocklist: [],
                pageViewsResetDuration: 1500,
                trackingConsent: {
                    enabled: true,
                    defaultTrackingConsent: TrackingConsent.Declined,
                    consentCategories: ['analytics', 'marketing'],
                },
            },
        },
    };
    vi.mocked(useConfig).mockImplementation(() => config);
    vi.mocked(useAuth).mockReturnValue(undefined);
    vi.mocked(ensureAdaptersInitialized).mockResolvedValue(undefined);
});

afterEach(() => {
    resetEventMediator();
    for (const adapter of getAllAdapters()) removeAdapter(adapter.name);
});

describe('EngagementConsentObserver integration', () => {
    it('notifies withdrawal and re-grant without an event, while hook/page-view tracking stays suppressed', async () => {
        addAdapter('recording', { name: 'recording', onConsentChange, sendEvent });
        mount();
        // Strict Mode must not duplicate the initial unknown state. No auth needed.
        expect(onConsentChange.mock.calls).toEqual([[undefined]]);
        fireEvent.click(screen.getByText('Track'));
        await act(async () => {});
        expect(sendEvent).not.toHaveBeenCalled();
        expect(ensureAdaptersInitialized).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Accept'));
        await waitFor(() => expect(sendEvent).toHaveBeenCalled());
        expect(onConsentChange.mock.calls).toEqual([[undefined], [['analytics', 'marketing']]]);
        const eventsAfterGrant = sendEvent.mock.calls.length;
        fireEvent.click(screen.getByText('Decline'));
        await act(async () => {});
        expect(onConsentChange).toHaveBeenLastCalledWith([]);
        expect(sendEvent).toHaveBeenCalledTimes(eventsAfterGrant);
        fireEvent.click(screen.getByText('Track'));
        await act(async () => {});
        expect(sendEvent).toHaveBeenCalledTimes(eventsAfterGrant);
        fireEvent.click(screen.getByText('Accept'));
        expect(onConsentChange.mock.calls).toEqual([
            [undefined],
            [['analytics', 'marketing']],
            [[]],
            [['analytics', 'marketing']],
        ]);
        fireEvent.click(screen.getByText('Track'));
        await waitFor(() => expect(sendEvent.mock.calls.length).toBeGreaterThan(eventsAfterGrant));
    });

    it('delivers latest consent to late and replacement registrations, excluding removed instances', () => {
        mount();
        fireEvent.click(screen.getByText('Accept'));
        fireEvent.click(screen.getByText('Decline'));
        addAdapter('recording', { name: 'recording', onConsentChange, sendEvent });
        expect(onConsentChange).toHaveBeenCalledExactlyOnceWith([]);
        const replacement = vi.fn();
        addAdapter('recording', { name: 'recording', onConsentChange: replacement });
        expect(replacement).toHaveBeenCalledExactlyOnceWith([]);
        removeAdapter('recording');
        fireEvent.click(screen.getByText('Accept'));
        expect(onConsentChange).toHaveBeenCalledTimes(1);
        expect(replacement).toHaveBeenCalledTimes(1);
    });

    it('uses withdrawn consent when adapter initialization completes after an accepted event starts', async () => {
        config.engagement.analytics.pageViewsBlocklist = ['.*'];
        let finishInitialization: (() => void) | undefined;
        vi.mocked(ensureAdaptersInitialized).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishInitialization = () => {
                        addAdapter('recording', { name: 'recording', onConsentChange, sendEvent });
                        resolve();
                    };
                })
        );
        mount();
        fireEvent.click(screen.getByText('Accept'));
        fireEvent.click(screen.getByText('Track'));
        await waitFor(() => expect(finishInitialization).toBeDefined());
        fireEvent.click(screen.getByText('Decline'));
        await act(async () => {
            if (!finishInitialization) throw new Error('Expected pending initialization');
            finishInitialization();
            await Promise.resolve();
        });
        expect(onConsentChange).toHaveBeenCalledExactlyOnceWith([]);
        expect(sendEvent).not.toHaveBeenCalled();
    });

    it.each([true, false])('revokes existing consent on assisted entry with consent controls enabled=%s', (enabled) => {
        config.engagement.analytics.trackingConsent = {
            enabled,
            defaultTrackingConsent: TrackingConsent.Declined,
            consentCategories: ['analytics', 'marketing'],
        };
        addAdapter('recording', { name: 'recording', onConsentChange, sendEvent });
        function AssistedHarness() {
            const [assisted, setAssisted] = useState(false);
            vi.mocked(useAuth).mockReturnValue({
                userType: 'registered',
                trackingConsent: TrackingConsent.Accepted,
                ...(assisted && { authMode: 'trusted-agent' as const }),
            });
            return (
                <>
                    <EngagementConsentObserver />
                    <button onClick={() => setAssisted(true)}>Enter assisted session</button>
                    <button onClick={() => setAssisted(false)}>Return to shopper</button>
                </>
            );
        }
        render(
            <StrictMode>
                <RouterProvider router={createMemoryRouter([{ path: '*', Component: AssistedHarness }])} />
            </StrictMode>
        );
        expect(onConsentChange).toHaveBeenLastCalledWith(['analytics', 'marketing']);
        fireEvent.click(screen.getByText('Enter assisted session'));
        expect(onConsentChange).toHaveBeenLastCalledWith([]);
        fireEvent.click(screen.getByText('Return to shopper'));
        expect(onConsentChange.mock.calls).toEqual([[['analytics', 'marketing']], [[]], [['analytics', 'marketing']]]);
        expect(ensureAdaptersInitialized).not.toHaveBeenCalled();
        expect(sendEvent).not.toHaveBeenCalled();
    });

    it('synchronizes disabled-consent policy before analytics effects without initializing adapters itself', () => {
        config.engagement.analytics.trackingConsent = {
            enabled: false,
            defaultTrackingConsent: TrackingConsent.Declined,
            consentCategories: ['analytics', 'marketing'],
        };
        addAdapter('recording', { name: 'recording', onConsentChange, sendEvent });
        function EffectProbe() {
            useEffect(() => {
                expect(onConsentChange).toHaveBeenCalledExactlyOnceWith(['analytics', 'marketing']);
            }, []);
            return null;
        }
        render(
            <StrictMode>
                <RouterProvider
                    router={createMemoryRouter([
                        {
                            path: '*',
                            element: (
                                <>
                                    <EngagementConsentObserver />
                                    <EffectProbe />
                                </>
                            ),
                        },
                    ])}
                />
            </StrictMode>
        );
        expect(ensureAdaptersInitialized).not.toHaveBeenCalled();
        expect(sendEvent).not.toHaveBeenCalled();
        expect(getConsentAwareEventMediator(getAllAdapters)).toBeDefined();
    });
});
