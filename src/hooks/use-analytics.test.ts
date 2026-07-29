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

/**
 * Analytics Hook Tests
 *
 * Tests the useAnalytics hook functionality including event tracking,
 * user context integration, and analytics provider integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Unmock useAnalytics for this specific test file (overrides global mock)
vi.unmock('@/hooks/use-analytics');
import { useAnalytics } from './use-analytics';
import type { SessionData } from '@/lib/api/types';
import type { ShopperBasketsV2, ShopperProducts, ShopperSearch } from '@/scapi';
import { TrackingConsent } from '@/types/tracking-consent';
import { mockSiteObject } from '@/test-utils/config';

vi.mock('@/providers/auth', () => ({
    useAuth: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: vi.fn(() => ({
        site: { id: mockSiteObject.id },
        language: mockSiteObject.defaultLocale,
        currency: mockSiteObject.defaultCurrency,
    })),
}));

vi.mock('react-i18next', () => ({
    useTranslation: vi.fn(),
}));

vi.mock('./use-tracking-consent', () => ({
    useTrackingConsent: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/events', () => ({
    createEvent: vi.fn(),
    getEventMediator: vi.fn(),
}));

vi.mock('@/lib/adapters', () => ({
    getAllAdapters: vi.fn(),
    buildConsentPreferences: vi.fn(),
}));

vi.mock('@/lib/adapters/engagement/register', () => ({
    initializeEngagementAdapters: vi.fn(),
}));

vi.mock('@/lib/adapters/engagement/initialize', () => ({
    ensureAdaptersInitialized: vi.fn(),
}));

import { useAuth } from '@/providers/auth';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useTranslation } from 'react-i18next';
import { getAllAdapters, buildConsentPreferences } from '@/lib/adapters';
import { initializeEngagementAdapters } from '@/lib/adapters/engagement/register';
import { createEvent, getEventMediator, type EventMediator } from '@salesforce/storefront-next-runtime/events';
import { ensureAdaptersInitialized } from '@/lib/adapters/engagement/initialize';
import { useTrackingConsent } from './use-tracking-consent';

const mockAnalytics: EventMediator = {
    track: vi.fn(),
};

// Mock user
const mockAuth: SessionData = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh-token',
    usid: 'test-usid',
    customerId: 'test-customer-id',
    idpAccessToken: 'test-idp-token',
    userType: 'registered',
};

// Mock product data
const mockProduct: ShopperProducts.schemas['Product'] = {
    id: 'test-product-id',
    name: 'Test Product',
    type: {
        master: true,
    },
} as ShopperProducts.schemas['Product'];

// Mock cart item data
const mockCartItem: ShopperBasketsV2.schemas['ProductItem'] = {
    itemId: 'test-cart-item-id',
    productId: 'test-product-id',
    quantity: 2,
    price: 29.99,
    product: {} as Partial<ShopperProducts.schemas['Product']>,
} as ShopperBasketsV2.schemas['ProductItem'];

// Mock basket data
const mockBasket: ShopperBasketsV2.schemas['Basket'] = {
    basketId: 'test-basket-id',
    productSubTotal: 59.98,
    productItems: [mockCartItem],
} as ShopperBasketsV2.schemas['Basket'];

// Mock search result data
const mockSearchResult: ShopperSearch.schemas['ProductSearchHit'] = {
    productId: 'test-product-id',
    productName: 'Test Product',
    currency: mockSiteObject.defaultCurrency,
    price: 29.99,
} as ShopperSearch.schemas['ProductSearchHit'];

// Mock category data
const mockCategory: ShopperProducts.schemas['Category'] = {
    id: 'test-category-id',
    name: 'Test Category',
} as ShopperProducts.schemas['Category'];

describe('useAnalytics', () => {
    const mockConsentCategories = ['necessary', 'analytics', 'marketing', 'personalization'];
    const mockConsentPreferences = [...mockConsentCategories];
    const mockConfig = {
        engagement: {
            adapters: {
                einstein: { enabled: true },
            },
            analytics: {
                trackingConsent: {
                    consentCategories: mockConsentCategories,
                },
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mocks
        vi.mocked(useConfig).mockReturnValue(mockConfig as any);
        vi.mocked(useSite).mockReturnValue({
            site: { id: mockSiteObject.id },
            language: mockSiteObject.defaultLocale,
            currency: mockSiteObject.defaultCurrency,
        } as any);
        vi.mocked(useTranslation).mockReturnValue({ i18n: { language: mockSiteObject.defaultLocale } } as any);
        vi.mocked(getAllAdapters).mockReturnValue([]);
        vi.mocked(initializeEngagementAdapters).mockResolvedValue(undefined);
        vi.mocked(ensureAdaptersInitialized).mockResolvedValue(undefined);
        vi.mocked(getEventMediator).mockReturnValue(mockAnalytics);
        vi.mocked(createEvent).mockImplementation(
            (eventType, data) =>
                ({
                    eventType,
                    ...data,
                }) as any
        );

        // Default to tracking consent accepted for all existing tests
        vi.mocked(useTrackingConsent).mockReturnValue({
            trackingConsent: TrackingConsent.Accepted,
            isTrackingConsentEnabled: true,
            shouldShowBanner: false,
            setTrackingConsent: vi.fn(),
            defaultTrackingConsent: TrackingConsent.Declined,
        });

        // Default: accepted consent returns all categories
        vi.mocked(buildConsentPreferences).mockReturnValue(mockConsentPreferences);

        // Mock window.__APP_CONFIG__
        if (typeof window !== 'undefined') {
            (window as { __APP_CONFIG__?: unknown }).__APP_CONFIG__ = {
                engagement: {
                    adapters: {
                        einstein: { enabled: true },
                    },
                },
            };
        }
    });

    describe('trackViewPage', () => {
        it('should track page view for user', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_page',
                    path: '/test-page',
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });

        it('should not track when auth is undefined', async () => {
            vi.mocked(useAuth).mockReturnValue(undefined);

            const { result } = renderHook(() => useAnalytics());

            // Call tracking function - promise will hang waiting for auth
            void result.current.trackViewPage({ url: '/test-page' });

            // Wait a bit to ensure no tracking happens when auth is undefined
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 100));
            });

            // Tracking should not have occurred because auth is undefined
            expect(mockAnalytics.track).not.toHaveBeenCalled();

            // The promise is still pending (won't resolve without auth)
            // We can't easily test the promise resolution in this scenario,
            // but we've verified that tracking doesn't happen when auth is undefined
        });

        it('should track page view for guest user', async () => {
            const guestAuth: SessionData = {
                userType: 'guest',
            };

            vi.mocked(useAuth).mockReturnValue(guestAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_page',
                    path: '/test-page',
                    payload: {
                        userType: 'guest',
                        usid: undefined,
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackViewProduct', () => {
        it('should track product view with correct user context', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewProduct({ product: mockProduct });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_product',
                    product: mockProduct,
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackCartItemAdd', () => {
        it('should track add to cart with cart items', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackCartItemAdd({ cartItems: [mockCartItem] });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'cart_item_add',
                    cartItems: [mockCartItem],
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackCheckoutStart', () => {
        it('should track checkout start with basket data', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackCheckoutStart({ basket: mockBasket });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'checkout_start',
                    basket: mockBasket,
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackCheckoutStep', () => {
        it('should track checkout step with step name, number, and basket', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackCheckoutStep({
                stepName: 'shipping',
                stepNumber: 1,
                basket: mockBasket,
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'checkout_step',
                    stepName: 'shipping',
                    stepNumber: 1,
                    basket: mockBasket,
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackViewSearch', () => {
        it('should track search with query and results', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewSearch({
                searchInputText: 'test search',
                searchResults: [mockSearchResult],
                sort: 'price-asc',
                refinements: {},
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_search',
                    searchInputText: 'test search',
                    searchResults: [mockSearchResult],
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackViewCategory', () => {
        it('should track category view with category and search results', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewCategory({
                category: mockCategory,
                searchResults: [mockSearchResult],
                sort: 'price-asc',
                refinements: {},
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_category',
                    category: mockCategory,
                    searchResults: [mockSearchResult],
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('paging fields (FU4)', () => {
        it('forwards offset/limit/total on trackViewSearch', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewSearch({
                searchInputText: 'test search',
                searchResults: [mockSearchResult],
                sort: 'price-asc',
                refinements: {},
                offset: 24,
                limit: 12,
                total: 100,
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_search',
                    offset: 24,
                    limit: 12,
                    total: 100,
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });

        it('forwards offset/limit/total on trackViewCategory', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewCategory({
                category: mockCategory,
                searchResults: [mockSearchResult],
                sort: 'price-asc',
                refinements: {},
                offset: 24,
                limit: 12,
                total: 100,
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_category',
                    offset: 24,
                    limit: 12,
                    total: 100,
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackViewRecommender', () => {
        it('tracks a recommender impression with recommender ids and products', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewRecommender({
                recommenderId: 'reco-uuid-1',
                recommenderName: 'pdp-similar-items',
                products: [mockSearchResult],
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_recommender',
                    recommenderId: 'reco-uuid-1',
                    recommenderName: 'pdp-similar-items',
                    products: [mockSearchResult],
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackClickProductInRecommender', () => {
        it('tracks a recommender product click with recommender ids and product', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackClickProductInRecommender({
                recommenderId: 'reco-uuid-1',
                recommenderName: 'pdp-similar-items',
                product: mockSearchResult,
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'click_product_in_recommender',
                    recommenderId: 'reco-uuid-1',
                    recommenderName: 'pdp-similar-items',
                    product: mockSearchResult,
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackClickProductInSearch', () => {
        it('should track product click in search with search text and product', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackClickProductInSearch({
                searchInputText: 'test search',
                product: mockSearchResult,
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'click_product_in_search',
                    searchInputText: 'test search',
                    product: mockSearchResult,
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('trackClickProductInCategory', () => {
        it('should track product click in category with category and product', async () => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackClickProductInCategory({
                category: mockCategory,
                product: mockSearchResult,
            });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'click_product_in_category',
                    category: mockCategory,
                    product: mockSearchResult,
                    payload: {
                        userType: 'registered',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('user context handling', () => {
        it('should use guest as fallback when userType is undefined', async () => {
            const mockAuthWithUndefinedUserType = {
                ...mockAuth,
                userType: undefined,
            };

            vi.mocked(useAuth).mockReturnValue(mockAuthWithUndefinedUserType);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: {
                        userType: 'guest',
                        usid: 'test-usid',
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });

        it('should handle undefined usid gracefully', async () => {
            const mockAuthWithUndefinedUsid = {
                ...mockAuth,
                usid: undefined,
            };

            vi.mocked(useAuth).mockReturnValue(mockAuthWithUndefinedUsid);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: {
                        userType: 'registered',
                        usid: undefined,
                        customerId: 'test-customer-id',
                    },
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });
    });

    describe('tracking consent', () => {
        beforeEach(() => {
            vi.mocked(useAuth).mockReturnValue(mockAuth);
        });

        it('should not track when tracking consent is declined', async () => {
            vi.mocked(useTrackingConsent).mockReturnValue({
                trackingConsent: TrackingConsent.Declined,
                isTrackingConsentEnabled: true,
                shouldShowBanner: false,
                setTrackingConsent: vi.fn(),
                defaultTrackingConsent: TrackingConsent.Declined,
            });
            vi.mocked(buildConsentPreferences).mockReturnValue([]);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).not.toHaveBeenCalled();
        });

        it('should not track when tracking consent is undefined', async () => {
            vi.mocked(useTrackingConsent).mockReturnValue({
                trackingConsent: undefined,
                isTrackingConsentEnabled: true,
                shouldShowBanner: true,
                setTrackingConsent: vi.fn(),
                defaultTrackingConsent: TrackingConsent.Declined,
            });
            vi.mocked(buildConsentPreferences).mockReturnValue(undefined);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).not.toHaveBeenCalled();
        });

        it('should track when tracking consent is accepted', async () => {
            vi.mocked(useTrackingConsent).mockReturnValue({
                trackingConsent: TrackingConsent.Accepted,
                isTrackingConsentEnabled: true,
                shouldShowBanner: false,
                setTrackingConsent: vi.fn(),
                defaultTrackingConsent: TrackingConsent.Declined,
            });

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewPage({ url: '/test-page' });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_page',
                    path: '/test-page',
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                mockConsentPreferences
            );
        });

        it('should pass consentPreferences to mediator.track', async () => {
            const customPreferences = ['necessary', 'analytics'];
            vi.mocked(buildConsentPreferences).mockReturnValue(customPreferences);

            const { result } = renderHook(() => useAnalytics());

            await result.current.trackViewProduct({ product: mockProduct });

            expect(mockAnalytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'view_product',
                }),
                { siteId: mockSiteObject.id, localeId: mockSiteObject.defaultLocale },
                customPreferences
            );
        });
    });
});
