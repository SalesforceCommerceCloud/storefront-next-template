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
import { StrictMode, startTransition, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act, render } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { mockConfig } from '@/test-utils/config';
import { TrackingConsent } from '@/types/tracking-consent';
import type { SessionData } from '@/lib/api/types';
import { addAdapter, getAllAdapters, removeAdapter } from '@/lib/adapters';
import { createEinsteinAdapter } from '@/lib/adapters/engagement/einstein';
import { createActiveDataAdapter } from '@/lib/adapters/engagement/active-data';
import type { Recommendation } from '@/hooks/recommenders/use-recommenders';
import ProductRecommendations from './index';

vi.unmock('@/hooks/use-analytics');
const state = vi.hoisted(() => ({
    auth: undefined as SessionData | undefined,
    config: undefined as unknown as typeof mockConfig & {
        engagement: {
            analytics: { trackingConsent: NonNullable<typeof mockConfig.engagement.analytics.trackingConsent> };
        };
    },
    visible: true,
    loading: false,
    recommendation: undefined as Recommendation | undefined,
    location: { pathname: '/product/current', search: '', hash: '', key: 'current' },
    navigation: { state: 'idle' },
    initialize: vi.fn<() => Promise<void>>(),
    getRecommendations: vi.fn(),
}));
vi.mock('@/providers/auth', () => ({ useAuth: () => state.auth }));
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useConfig: () => state.config,
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useSite: () => ({ site: { id: 'RefArch' }, locale: { id: 'en-US' }, language: 'en-US', currency: 'USD' }),
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useLocation: () => state.location,
    useNavigation: () => state.navigation,
    useFetcher: () => ({ submit: vi.fn() }),
}));
vi.mock('@/lib/adapters/engagement/initialize', () => ({ ensureAdaptersInitialized: () => state.initialize() }));
vi.mock('@/hooks/recommenders/use-recommenders', () => ({
    useRecommenders: () => ({
        recommendations: state.recommendation,
        isLoading: state.loading,
        getRecommendations: state.getRecommendations,
        getZoneRecommendations: state.getRecommendations,
    }),
}));
vi.mock('@/providers/product-context', () => ({ useProduct: () => undefined }));
vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: () => ({ isDesignMode: false }),
}));
vi.mock('@/hooks/use-intersection-observer', () => ({
    // Model the shared hook's latched useOnce option as well as live visibility.
    useIntersectionObserver: (_ref: unknown, options?: { useOnce?: boolean }) =>
        options?.useOnce ? true : state.visible,
}));
vi.mock('@/components/product-carousel/carousel', () => ({ default: () => <div>Recommendations</div> }));
vi.mock('@/components/product/skeletons', () => ({ ProductRecommendationSkeleton: () => <div>Loading</div> }));

const recommendation: Recommendation = {
    recoUUID: 'reco-current',
    recommenderName: 'pdp-similar-items',
    displayMessage: 'You May Also Like',
    recs: [{ productId: 'product-1', productName: 'Product One' }],
};
const beacon = vi.fn<(url: string, data?: Blob) => boolean>(() => true);
const view = () => <ProductRecommendations recommenderName="pdp-similar-items" />;
const flush = () => act(async () => {});

function registerVendors(einstein = true, activeData = true) {
    addAdapter(
        'einstein',
        createEinsteinAdapter({
            host: 'https://einstein.example',
            einsteinId: 'client',
            realm: 'realm',
            siteId: 'RefArch',
            isProduction: false,
            consentCategory: 'personalization',
            eventToggles: { ...mockConfig.engagement.adapters.einstein.eventToggles, view_recommender: einstein },
        })
    );
    addAdapter(
        'active-data',
        createActiveDataAdapter({
            host: 'https://commerce.example',
            consentCategory: 'analytics',
            eventToggles: { ...mockConfig.engagement.adapters.activeData.eventToggles, view_recommender: activeData },
        })
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { usid: 'shopper', userType: 'guest' } as SessionData;
    state.config = structuredClone(mockConfig) as typeof state.config;
    state.config.engagement.analytics.trackingConsent = {
        enabled: true,
        defaultTrackingConsent: TrackingConsent.Declined,
        consentCategories: ['analytics', 'personalization'],
    };
    state.visible = true;
    state.loading = false;
    state.recommendation = recommendation;
    state.location = { pathname: '/product/current', search: '', hash: '', key: 'current' };
    state.navigation = { state: 'idle' };
    state.initialize.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    registerVendors();
});
afterEach(() => {
    for (const adapter of getAllAdapters()) removeAdapter(adapter.name);
});

test('recovers the visible resolved recommender after consent at both vendor outputs, without replay', async () => {
    const { rerender } = render(view());
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(beacon.mock.calls[0][0]).toBe(
        'https://einstein.example/v3/activities/realm-RefArch/viewReco?clientId=client'
    );
    const payload = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(beacon.mock.calls[0][1] as Blob);
    });
    expect(JSON.parse(payload)).toMatchObject({
        cookieId: 'shopper',
        recoId: 'reco-current',
        recommenderName: 'pdp-similar-items',
        products: [{ id: 'product-1', sku: 'product-1' }],
    });
    const proxy = new URL(beacon.mock.calls[1][0], window.location.origin);
    const activeData = new URL(proxy.searchParams.get('url') as string);
    expect(activeData.pathname).toBe('/on/demandware.store/Sites-RefArch-Site/en_US/__Analytics-Start');
    expect(activeData.searchParams.get('pid-0')).toBe('product-1');
    expect(activeData.searchParams.get('pev-0')).toBe('event3');
    expect(activeData.searchParams.get('evr4-0')).toBe('Yes');
    rerender(view());
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Declined } as SessionData;
    rerender(view());
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});

test('recovers consent committed in a transition before passive effects flush', async () => {
    // act() flushes passive effects before layout microtasks and hides this race.
    const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const actEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT;
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = false;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const committed = vi.fn();
    function View() {
        useEffect(() => {
            committed();
        });
        return view();
    }
    try {
        root.render(<View />);
        await vi.waitFor(() => expect(committed).toHaveBeenCalledTimes(1));
        expect(beacon).not.toHaveBeenCalled();
        state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
        startTransition(() => root.render(<View />));
        await vi.waitFor(() => expect(committed).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(beacon).toHaveBeenCalledTimes(2));
        expect(beacon.mock.calls[0][0]).toContain('/viewReco?');
        expect(beacon.mock.calls[1][0]).toContain('/resource/analytics-proxy?');
    } finally {
        root.unmount();
        container.remove();
        reactGlobal.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    }
});

test('equivalent recommendation snapshots preserve pending initialization and emit once', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    const releases: Array<() => void> = [];
    state.initialize.mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)));
    const { rerender } = render(view());
    await flush();
    for (let snapshot = 0; snapshot < 3; snapshot++) {
        state.recommendation = structuredClone(recommendation);
        rerender(view());
        await flush();
    }
    expect(beacon).not.toHaveBeenCalled();
    await act(async () => {
        releases[0]();
        await Promise.resolve();
    });
    expect(beacon).toHaveBeenCalledTimes(2);
    state.recommendation = structuredClone(recommendation);
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});

test.each([
    ['both enabled', true, true, 2],
    ['Einstein disabled', false, true, 1],
    ['Active Data default off', true, mockConfig.engagement.adapters.activeData.eventToggles.view_recommender, 1],
    ['both disabled', false, false, 0],
] as const)('preserves vendor toggles: %s', async (_label, einstein, activeData, count) => {
    registerVendors(einstein, activeData);
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    render(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(count);
    expect(beacon.mock.calls.filter(([url]) => url.includes('/viewReco?'))).toHaveLength(einstein ? 1 : 0);
    expect(beacon.mock.calls.filter(([url]) => url.includes('/resource/analytics-proxy?'))).toHaveLength(
        activeData ? 1 : 0
    );
});

test('preserves each vendor consent category', async () => {
    state.config.engagement.analytics.trackingConsent.consentCategories = ['analytics'];
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    render(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toContain('/resource/analytics-proxy?');
});

test('consent while hidden waits for live visibility and does not replay after re-entry', async () => {
    const { rerender } = render(view());
    await flush();
    state.visible = false;
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view());
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.visible = true;
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
    state.visible = false;
    rerender(view());
    state.visible = true;
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});

test.each(['loading', 'titleless', 'empty'] as const)('never emits for %s content', async (content) => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    if (content === 'loading') state.loading = true;
    if (content === 'titleless') state.recommendation = { ...recommendation, displayMessage: undefined };
    if (content === 'empty') state.recommendation = { ...recommendation, recs: [] };
    render(view());
    await flush();
    expect(beacon).not.toHaveBeenCalled();
});

test('emits changed recommendation products even when the UUID is reused, not equivalent rerenders', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    const { rerender } = render(view());
    await flush();
    state.recommendation = { ...recommendation, recs: [{ productId: 'product-2' }] };
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(4);
    const proxy = new URL(beacon.mock.calls[3][0], window.location.origin);
    expect(new URL(proxy.searchParams.get('url') as string).searchParams.get('pid-0')).toBe('product-2');
    state.recommendation = { ...state.recommendation, recs: [...(state.recommendation.recs ?? [])] };
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(4);
});

test.each([
    'hidden',
    'loading',
    'titleless',
    'empty',
    'data',
    'consent',
    'navigation',
    'location',
    'unmount',
] as const)('cancels pending initialization on %s before vendor output', async (change) => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender, unmount } = render(view());
    await flush();
    expect(state.initialize).toHaveBeenCalledTimes(1);
    if (change === 'hidden') state.visible = false;
    if (change === 'loading') state.loading = true;
    if (change === 'titleless') state.recommendation = { ...recommendation, displayMessage: undefined };
    if (change === 'empty') state.recommendation = { ...recommendation, recs: [] };
    if (change === 'data')
        state.recommendation = { ...recommendation, recoUUID: 'reco-new', recs: [{ productId: 'product-2' }] };
    if (change === 'consent') state.auth = { ...state.auth, trackingConsent: TrackingConsent.Declined } as SessionData;
    if (change === 'navigation') state.navigation = { state: 'loading' };
    if (change === 'location') {
        state.location = { ...state.location, pathname: '/product/new', key: 'new' };
        state.visible = false;
    }
    if (change === 'unmount') unmount();
    else rerender(view());
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).toHaveBeenCalledTimes(change === 'data' ? 2 : 0);
    if (change === 'data') {
        const proxy = new URL(beacon.mock.calls[1][0], window.location.origin);
        expect(new URL(proxy.searchParams.get('url') as string).searchParams.get('pid-0')).toBe('product-2');
    }
});

test('cancelled attempts remain eligible when visibility returns', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender } = render(view());
    await flush();
    state.visible = false;
    rerender(view());
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
    state.visible = true;
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});

test('StrictMode hands off a resolved visible recommendation only once', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    render(<StrictMode>{view()}</StrictMode>);
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});

test('loader recommendations recover after consent without fetching on the client', async () => {
    const data = Promise.resolve(recommendation);
    const { rerender } = render(<ProductRecommendations data={data} />);
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(<ProductRecommendations data={data} />);
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(state.getRecommendations).not.toHaveBeenCalled();
});

test('pending loader replacement cancels the previous visible recommendation', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender } = render(<ProductRecommendations data={Promise.resolve(recommendation)} />);
    await flush();
    expect(state.initialize).toHaveBeenCalledTimes(1);
    rerender(<ProductRecommendations data={new Promise<Recommendation>(() => {})} fallback={<div>Loading</div>} />);
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
});

test('pending auth is cancelled before output and recovers on the next visible attempt', async () => {
    state.config.engagement.analytics.trackingConsent.enabled = false;
    state.auth = undefined;
    const { rerender } = render(view());
    await flush();
    state.visible = false;
    state.auth = { usid: 'shopper', userType: 'guest' } as SessionData;
    rerender(view());
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.visible = true;
    rerender(view());
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});
