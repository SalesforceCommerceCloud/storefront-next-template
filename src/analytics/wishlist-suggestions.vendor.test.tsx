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
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mockConfig } from '@/test-utils/config';
import { TrackingConsent } from '@/types/tracking-consent';
import type { SessionData } from '@/lib/api/types';
import { addAdapter, getAllAdapters, removeAdapter } from '@/lib/adapters';
import { createEinsteinAdapter } from '@/lib/adapters/engagement/einstein';
import Suggestions from '@/components/search/suggestions';
import type { SearchSuggestions } from '@/components/search/types';
import { WishlistPageAnalytics } from './wishlist-page-analytics';

vi.unmock('@/hooks/use-analytics');
const state = vi.hoisted(() => ({
    auth: undefined as SessionData | undefined,
    config: undefined as unknown as typeof mockConfig,
    location: { pathname: '/wishlist', search: '', hash: '', key: 'current' },
    navigation: { state: 'idle' },
    initialize: vi.fn<() => Promise<void>>(),
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
vi.mock('@/components/link', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('@/components/search/suggestions-list', () => ({ default: () => null }));
vi.mock('@/components/search/suggestions-grid', () => ({ default: () => null }));
vi.mock('@/components/search/recent-searches', () => ({ default: () => <div>Recent searches</div> }));

const beacon = vi.fn<(url: string, data?: Blob) => boolean>(() => true);
const flush = () => act(async () => {});
const suggestions = (name = 'Boots'): SearchSuggestions => ({
    searchPhrase: 'boot',
    productSuggestions: [{ name, link: '/product/boots', type: 'product' }],
});
const view = (surface: 'wishlist' | 'suggestions', data = suggestions(), open = true) =>
    surface === 'wishlist' ? (
        <WishlistPageAnalytics />
    ) : open ? (
        <Suggestions
            searchSuggestions={data}
            recentSearches={['old search']}
            closeAndNavigate={vi.fn()}
            clearRecentSearches={vi.fn()}
        />
    ) : null;

function registerVendor(enabled = true) {
    addAdapter(
        'einstein',
        createEinsteinAdapter({
            host: 'https://einstein.example',
            einsteinId: 'client',
            realm: 'realm',
            siteId: 'RefArch',
            isProduction: false,
            consentCategory: 'personalization',
            eventToggles: {
                ...mockConfig.engagement.adapters.einstein.eventToggles,
                wishlist_viewed: enabled,
                view_search_suggestion: enabled,
            },
        })
    );
}
async function payload(index = 0) {
    const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(beacon.mock.calls[index][1] as Blob);
    });
    return JSON.parse(text);
}
beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { usid: 'shopper', userType: 'guest' } as SessionData;
    state.config = structuredClone(mockConfig);
    state.config.engagement.analytics.trackingConsent = {
        enabled: true,
        defaultTrackingConsent: TrackingConsent.Declined,
        consentCategories: ['personalization'],
    };
    state.location = { pathname: '/wishlist', search: '', hash: '', key: 'current' };
    state.navigation = { state: 'idle' };
    state.initialize.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    registerVendor();
});
afterEach(() => {
    for (const adapter of getAllAdapters()) removeAdapter(adapter.name);
});

test.each([
    'guest',
    'registered',
] as const)('recovers the open %s wishlist after consent, without duplicate or action replay', async (userType) => {
    state.auth = {
        ...state.auth,
        userType,
        encUserId: userType === 'registered' ? 'encrypted' : undefined,
    } as SessionData;
    state.location.pathname = userType === 'registered' ? '/account/wishlist' : '/wishlist';
    const { rerender } = render(view('wishlist'));
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view('wishlist'));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(
        'https://einstein.example/v3/activities/realm-RefArch/wishlistViewed?clientId=client'
    );
    expect(await payload()).toMatchObject({
        cookieId: 'shopper',
        ...(userType === 'registered' ? { userId: 'encrypted' } : {}),
    });
    rerender(view('wishlist'));
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Declined } as SessionData;
    rerender(view('wishlist'));
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view('wishlist'));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
});

test('recovers only current suggestions after consent and tracks changed names with equal counts', async () => {
    const { rerender } = render(view('suggestions'));
    await flush();
    rerender(view('suggestions', suggestions('Current Boots')));
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view('suggestions', suggestions('Current Boots')));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(
        'https://einstein.example/v3/activities/realm-RefArch/viewSearchSuggestion?clientId=client'
    );
    expect(await payload()).toMatchObject({ searchText: 'boot', suggestions: ['Current Boots'] });
    rerender(view('suggestions', suggestions('New Boots')));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(await payload(1)).toMatchObject({ searchText: 'boot', suggestions: ['New Boots'] });
    rerender(view('suggestions', suggestions('New Boots')));
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Declined } as SessionData;
    rerender(view('suggestions', suggestions('New Boots')));
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view('suggestions', suggestions('New Boots')));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(2);
});

test.each([
    'wishlist',
    'suggestions',
] as const)('cancels %s during initialization and retries after a cancelled attempt', async (surface) => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender } = render(view(surface));
    await flush();
    state.navigation = { state: 'loading' };
    rerender(view(surface));
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
    state.navigation = { state: 'idle' };
    rerender(view(surface));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
});

test.each([
    'wishlist',
    'suggestions',
] as const)('%s cancels pending auth on navigation and recovers the next current view', async (surface) => {
    state.config.engagement.analytics.trackingConsent = {
        enabled: false,
        defaultTrackingConsent: TrackingConsent.Declined,
        consentCategories: ['personalization'],
    };
    state.auth = undefined;
    const { rerender } = render(view(surface));
    await flush();
    state.navigation = { state: 'loading' };
    state.auth = { usid: 'shopper', userType: 'guest' } as SessionData;
    rerender(view(surface));
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    state.navigation = { state: 'idle' };
    state.location = { ...state.location, pathname: '/account/wishlist', key: 'next' };
    rerender(view(surface));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
});

test.each([
    'wishlist',
    'suggestions',
] as const)('%s cancels pending initialization on consent, location, and unmount', async (surface) => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender, unmount } = render(view(surface));
    await flush();
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Declined } as SessionData;
    rerender(view(surface));
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    rerender(view(surface));
    await flush();
    state.location = { ...state.location, pathname: '/new', key: 'next' };
    state.navigation = { state: 'loading' };
    rerender(view(surface));
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
    state.navigation = { state: 'idle' };
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    rerender(view(surface));
    await flush();
    unmount();
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
});

test('replacing pending suggestion names cancels the old payload even with equal counts', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender } = render(view('suggestions'));
    await flush();
    rerender(view('suggestions', suggestions('Current Boots')));
    await flush();
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(await payload()).toMatchObject({ suggestions: ['Current Boots'] });
});

test('closed suggestions never recover historical data; reopening tracks only the displayed data', async () => {
    const { rerender } = render(view('suggestions'));
    await flush();
    rerender(view('suggestions', suggestions(), false));
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    rerender(view('suggestions', suggestions(), false));
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    rerender(view('suggestions', suggestions('Reopened Boots')));
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(await payload()).toMatchObject({ suggestions: ['Reopened Boots'] });
});

test('closing suggestions cancels pending initialization before output', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    let release!: () => void;
    state.initialize.mockReturnValue(
        new Promise<void>((resolve) => {
            release = resolve;
        })
    );
    const { rerender } = render(view('suggestions'));
    await flush();
    rerender(view('suggestions', suggestions(), false));
    await act(async () => {
        release();
        await Promise.resolve();
    });
    expect(beacon).not.toHaveBeenCalled();
});

test('recent searches are not suggestion impressions', async () => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    render(
        view('suggestions', {
            searchPhrase: 'old search',
            recentSearchSuggestions: [{ name: 'old search', link: '/search', type: 'recent' }],
        })
    );
    await flush();
    expect(beacon).not.toHaveBeenCalled();
});

test.each(['wishlist', 'suggestions'] as const)('StrictMode hands off %s once', async (surface) => {
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    render(<StrictMode>{view(surface)}</StrictMode>);
    await flush();
    expect(beacon).toHaveBeenCalledTimes(1);
});

test.each([
    'wishlist',
    'suggestions',
] as const)('%s preserves vendor toggles and consent categories', async (surface) => {
    registerVendor(false);
    state.auth = { ...state.auth, trackingConsent: TrackingConsent.Accepted } as SessionData;
    const { unmount } = render(view(surface));
    await flush();
    expect(beacon).not.toHaveBeenCalled();
    unmount();
    registerVendor();
    state.config.engagement.analytics.trackingConsent = {
        enabled: true,
        defaultTrackingConsent: TrackingConsent.Declined,
        consentCategories: ['analytics'],
    };
    render(view(surface));
    await flush();
    expect(beacon).not.toHaveBeenCalled();
});
