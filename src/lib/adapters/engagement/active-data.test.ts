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
 * Active Data Adapter Tests
 *
 * Tests the Active Data analytics adapter functionality including event transformation,
 * URL generation, parameter encoding, and URL splitting for various event types.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createActiveDataAdapter, type ActiveDataConfig } from './active-data';
import type { AnalyticsEvent, EventSiteInfo, ConsentPreferences } from '@salesforce/storefront-next-runtime/events';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import Cookies from 'js-cookie';
import { mockSiteObject } from '@/test-utils/config';

vi.mock('js-cookie', () => ({
    default: {
        get: vi.fn(),
    },
}));

const mockSendBeacon = vi.fn();
Object.defineProperty(navigator, 'sendBeacon', {
    value: mockSendBeacon,
    writable: true,
    configurable: true,
});

// Helper type that guarantees sendEvent is implemented
type ActiveDataAdapter = {
    name: string;
    sendEvent: (
        event: AnalyticsEvent,
        siteInfo?: EventSiteInfo,
        consentPreferences?: ConsentPreferences
    ) => Promise<unknown>;
};

/**
 * Extract the original Active Data URL from the proxy wrapper.
 * sendBeacon calls go through /resource/analytics-proxy?url=<encoded-url>,
 * so we need to unwrap to test the underlying analytics URL.
 */
function getActiveDataUrl(sendBeaconCall: unknown[]): string {
    const proxyUrl = sendBeaconCall[0] as string;
    const parsed = new URL(proxyUrl, 'https://localhost');
    return parsed.searchParams.get('url') ?? proxyUrl;
}

const mockSiteInfo: EventSiteInfo = {
    siteId: 'test-site-id',
    localeId: 'en-GB',
};

// Default consent preferences for non-consent tests — provides sufficient consent
// so tests can focus on event transformation and payload correctness
const defaultConsent: ConsentPreferences = ['necessary', 'analytics', 'marketing', 'personalization'];

const mockConfig: ActiveDataConfig = {
    enabled: true,
    host: 'https://analytics.example.com',
    sourceCode: 'test-source',
    siteCurrency: 'GBP',
    eventToggles: {
        view_page: true,
        view_product: true,
        view_search: true,
        view_category: true,
        view_recommender: true,
        click_product_in_category: false,
        click_product_in_search: false,
        click_product_in_recommender: false,
        cart_item_add: false,
        checkout_start: false,
        checkout_step: false,
        view_search_suggestion: false,
        click_search_suggestion: false,
        wishlist_item_added: false,
        wishlist_item_removed: false,
        wishlist_viewed: false,
        wishlist_item_merged: false,
        wishlist_merged: false,
    },
};

// Mock browser globals
const mockLocation = {
    href: 'https://example.com/test-page',
    origin: 'https://example.com',
    pathname: '/test-page',
};

const mockScreen = {
    width: 1920,
    height: 1080,
};

const mockDocument = {
    title: 'Test Page Title',
    referrer: 'https://referrer.com',
};

const mockNavigator = {
    cookieEnabled: true,
};

// Setup mocks before each test
beforeEach(() => {
    vi.clearAllMocks();

    // Reset mocks
    Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
        configurable: true,
    });

    Object.defineProperty(window, 'screen', {
        value: mockScreen,
        writable: true,
        configurable: true,
    });

    Object.defineProperty(window, 'document', {
        value: mockDocument,
        writable: true,
        configurable: true,
    });

    Object.defineProperty(navigator, 'cookieEnabled', {
        value: mockNavigator.cookieEnabled,
        writable: true,
        configurable: true,
    });

    // Mock Cookies.get to return undefined by default
    // oxlint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(Cookies.get).mockReturnValue(undefined as any);
});

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * Helper function to mock the dw_dnt cookie value
 * @param value - The value to return for the dw_dnt cookie, or undefined to return undefined
 */
function mockDwDntCookie(value: string | undefined): void {
    // oxlint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(Cookies.get).mockImplementation(((name?: string) => {
        if (name === 'dw_dnt') return value;
        return undefined;
    }) as any);
}

// Mock data
const mockProduct: ShopperProducts.schemas['Product'] = {
    id: 'test-product-id',
    name: 'Test Product',
    categoryId: 'test-category-id',
} as ShopperProducts.schemas['Product'];

const mockSearchResult: ShopperSearch.schemas['ProductSearchHit'] = {
    productId: 'test-search-product-id',
    productName: 'Test Search Product',
} as ShopperSearch.schemas['ProductSearchHit'];

const mockCategory: ShopperProducts.schemas['Category'] = {
    id: 'test-category-id',
    name: 'Test Category',
} as ShopperProducts.schemas['Category'];

// Mock analytics events
const mockPageViewEvent: AnalyticsEvent = {
    eventType: 'view_page',
    path: '/test-page',
    payload: {},
} as AnalyticsEvent;

const mockProductViewEvent: AnalyticsEvent = {
    eventType: 'view_product',
    product: mockProduct,
    payload: {},
} as AnalyticsEvent;

const mockSearchEvent: AnalyticsEvent = {
    eventType: 'view_search',
    searchInputText: 'test search query',
    searchResults: [mockSearchResult],
    sort: 'price-asc',
    refinements: {
        color: 'red',
        size: 'large',
    },
    payload: {},
} as AnalyticsEvent;

const mockCategoryEvent: AnalyticsEvent = {
    eventType: 'view_category',
    category: mockCategory,
    searchResults: [mockSearchResult],
    sort: 'price-desc',
    refinements: {
        brand: 'test-brand',
    },
    payload: {},
} as AnalyticsEvent;

const mockRecommenderEvent: AnalyticsEvent = {
    eventType: 'view_recommender',
    recommenderId: 'test-recommender-id',
    recommenderName: 'Test Recommender',
    products: [mockSearchResult],
    payload: {},
} as AnalyticsEvent;

describe('Active Data Adapter', () => {
    describe('createActiveDataAdapter', () => {
        it('should create adapter with valid config', () => {
            const adapter = createActiveDataAdapter(mockConfig);
            expect(adapter.name).toBe('active-data');
            expect(typeof adapter.sendEvent).toBe('function');
        });

        it('should throw error when host is missing', () => {
            const invalidConfig = { ...mockConfig, host: '' };
            expect(() => createActiveDataAdapter(invalidConfig)).toThrow(
                /Active Data adapter configuration is invalid:.*Missing required field: host/
            );
        });

        it('should throw error when host is whitespace', () => {
            const invalidConfig = { ...mockConfig, host: '   ' };
            expect(() => createActiveDataAdapter(invalidConfig)).toThrow(
                /Active Data adapter configuration is invalid:.*Missing required field: host/
            );
        });

        it('should skip event when siteInfo is missing', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, undefined, defaultConsent);
            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should skip event when siteInfo has empty siteId', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, { siteId: '', localeId: 'en-GB' }, defaultConsent);
            expect(mockSendBeacon).not.toHaveBeenCalled();
        });
    });

    describe('sendEvent', () => {
        it('should not send event when event toggle is disabled', async () => {
            const config = { ...mockConfig, eventToggles: { ...mockConfig.eventToggles, view_page: false } };
            const adapter = createActiveDataAdapter(config) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should not send event for unsupported event types', async () => {
            const unsupportedEvent = {
                eventType: 'cart_item_add',
                payload: {},
            } as AnalyticsEvent;
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(unsupportedEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should send view_page event through the analytics proxy', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const rawUrl = mockSendBeacon.mock.calls[0][0] as string;
            expect(rawUrl).toMatch(/^\/resource\/analytics-proxy\?url=/);

            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Check base URL
            expect(url).toContain(
                'https://analytics.example.com/on/demandware.store/Sites-test-site-id-Site/en_GB/__Analytics-Start'
            );

            // Check context params
            expect(url).toMatch(/[?&]dwac=/);
            expect(url).toMatch(/[?&]cmpn=test-source/);
            expect(url).toMatch(/[?&]tz=/);
            expect(url).toMatch(/[?&]pcc=GBP/);
            expect(url).toMatch(/[?&]pct=__ANONYMOUS__/);

            // Check base params
            expect(url).toMatch(/[?&]url=/);
            expect(url).toMatch(/[?&]res=1920x1080/);
            expect(url).toMatch(/[?&]cookie=1/);
            expect(url).toMatch(/[?&]ref=/);
            expect(url).toMatch(/[?&]title=/);

            // Check plugin params
            expect(url).toMatch(/[?&]pdf=0/);
            expect(url).toMatch(/[?&]qt=0/);
        });

        it('should send view_product event with product data', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockProductViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Check pcat parameter
            expect(url).toMatch(/[?&]pcat=test-category-id/);

            // Check product data (pid, pev)
            expect(url).toMatch(/[?&]pid-0=/);
            expect(url).toMatch(/[?&]pev-0=event4/);
        });

        it('should send view_search event with search params and product data', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockSearchEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Check search params
            expect(url).toMatch(/[?&]pst-q=/);
            expect(url).toMatch(/[?&]pst-show=true/);
            expect(url).toMatch(/[?&]pst-sort=price-asc/);
            // Check that pst-refs contains JSON stringified refinements
            expect(url).toMatch(/[?&]pst-refs=/);
            const pstRefsMatch = url.match(/[?&]pst-refs=([^&]*)/);
            expect(pstRefsMatch).toBeTruthy();
            if (pstRefsMatch) {
                const decodedRefs = decodeURIComponent(pstRefsMatch[1]);
                const parsedRefs = JSON.parse(decodedRefs);
                expect(parsedRefs).toEqual({ color: 'red', size: 'large' });
            }

            // Check product data (event3 for search)
            expect(url).toMatch(/[?&]pid-0=/);
            expect(url).toMatch(/[?&]pev-0=event3/);
        });

        it('should send view_category event with category and product data', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockCategoryEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Check pcat parameter
            expect(url).toMatch(/[?&]pcat=test-category-id/);

            // Check search params
            expect(url).toMatch(/[?&]pst-show=true/);
            expect(url).toMatch(/[?&]pst-sort=price-desc/);
            expect(url).toMatch(/[?&]pst-refs=/);

            // Check product data
            expect(url).toMatch(/[?&]pid-0=/);
            expect(url).toMatch(/[?&]pev-0=event3/);
        });

        it('should send view_recommender event with recommendation product data', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockRecommenderEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Check product data with evr4 for recommendations
            expect(url).toMatch(/[?&]pid-0=/);
            expect(url).toMatch(/[?&]pev-0=event3/);
            expect(url).toMatch(/[?&]evr4-0=Yes/);
        });

        it('should handle search event with no results', async () => {
            const searchEventNoResults = {
                ...mockSearchEvent,
                searchResults: [],
            } as AnalyticsEvent;
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(searchEventNoResults, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            expect(url).toMatch(/[?&]pst-show=false/);
            // Should not have product data
            expect(url).not.toMatch(/[?&]pid-/);
        });

        it('should handle product without categoryId', async () => {
            const productNoCategory = {
                ...mockProduct,
                categoryId: undefined,
            };
            const productEvent = {
                ...mockProductViewEvent,
                product: productNoCategory,
            } as AnalyticsEvent;
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(productEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // pcat should be empty string
            expect(url).toMatch(/[?&]pcat=/);
        });

        it('should add dw_dnt cookie when present and valid', async () => {
            mockDwDntCookie('1');

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            expect(url).toMatch(/[?&]dw_dnt=1/);
        });

        it('should not add dw_dnt cookie when value is invalid', async () => {
            mockDwDntCookie('invalid');

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            expect(url).not.toMatch(/[?&]dw_dnt=/);
        });

        it('should add dw_dnt cookie when value is 0 (tracking allowed)', async () => {
            mockDwDntCookie('0');

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // dw_dnt=0 should still be added (it's a valid value)
            expect(url).toMatch(/[?&]dw_dnt=0/);
        });

        it('should split URLs when exceeding MAX_URL_LENGTH', async () => {
            // Create a search event with many products to trigger URL splitting
            const manyProducts = Array.from({ length: 100 }, (_, i) => ({
                productId: `product-${i}-${'x'.repeat(50)}`, // Long product IDs
                productName: `Product ${i}`,
            })) as ShopperSearch.schemas['ProductSearchHit'][];

            const largeSearchEvent = {
                ...mockSearchEvent,
                searchResults: manyProducts,
            } as AnalyticsEvent;

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(largeSearchEvent, mockSiteInfo, defaultConsent);

            // Should have multiple URLs
            expect(mockSendBeacon.mock.calls.length).toBeGreaterThan(1);

            // All URLs should have context params
            mockSendBeacon.mock.calls.forEach((call) => {
                const url = getActiveDataUrl(call);
                expect(url).toMatch(/[?&]dwac=/);
                expect(url).toMatch(/[?&]cmpn=/);
            });

            // dw_dnt should only be on the last URL (if cookie is set)
            // If dw_dnt cookie is not set, it won't be in the URL, which is fine
        });

        it('should use custom sourceCode and siteCurrency from config', async () => {
            const customConfig = {
                ...mockConfig,
                sourceCode: 'custom-source',
                siteCurrency: 'EUR',
            };
            const adapter = createActiveDataAdapter(customConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            expect(url).toMatch(/[?&]cmpn=custom-source/);
            expect(url).toMatch(/[?&]pcc=EUR/);
        });

        it('should use default siteCurrency when not provided', async () => {
            const configWithoutCurrency = {
                ...mockConfig,
                siteCurrency: undefined,
            };
            const adapter = createActiveDataAdapter(configWithoutCurrency) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Should default to GBP
            expect(url).toMatch(/[?&]pcc=GBP/);
        });

        it('should handle multiple products correctly', async () => {
            const multiProductEvent = {
                ...mockSearchEvent,
                searchResults: [
                    { productId: 'product-1' } as ShopperSearch.schemas['ProductSearchHit'],
                    { productId: 'product-2' } as ShopperSearch.schemas['ProductSearchHit'],
                    { productId: 'product-3' } as ShopperSearch.schemas['ProductSearchHit'],
                ],
            } as AnalyticsEvent;

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(multiProductEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Should have pid-0, pid-1, pid-2
            expect(url).toMatch(/[?&]pid-0=/);
            expect(url).toMatch(/[?&]pid-1=/);
            expect(url).toMatch(/[?&]pid-2=/);
            expect(url).toMatch(/[?&]pev-0=event3/);
            expect(url).toMatch(/[?&]pev-1=event3/);
            expect(url).toMatch(/[?&]pev-2=event3/);
        });

        it('should skip products without id or productId', async () => {
            const productWithoutId = {
                name: 'Product without ID',
            } as unknown as ShopperProducts.schemas['Product'];

            const productEvent = {
                ...mockProductViewEvent,
                product: productWithoutId,
            } as AnalyticsEvent;

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(productEvent, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // Should not have product data
            expect(url).not.toMatch(/[?&]pid-/);
        });

        it('should handle empty refinements', async () => {
            const searchEventNoRefinements = {
                ...mockSearchEvent,
                refinements: undefined,
            } as AnalyticsEvent;

            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(searchEventNoRefinements, mockSiteInfo, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);

            // pst-refs should be empty string (followed by & or end of string)
            expect(url).toMatch(/[?&]pst-refs=(?=&|$)/);
        });
    });

    describe('consent category filtering', () => {
        it('should send event when adapter consentCategory is in consentPreferences', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createActiveDataAdapter(configWithConsent) as ActiveDataAdapter;

            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, ['necessary', 'analytics']);

            expect(mockSendBeacon).toHaveBeenCalled();
        });

        it('should not send event when adapter consentCategory is not in consentPreferences', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createActiveDataAdapter(configWithConsent) as ActiveDataAdapter;

            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, ['necessary']);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should not send event when consentPreferences is an empty array (all declined)', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createActiveDataAdapter(configWithConsent) as ActiveDataAdapter;

            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, []);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should send event when no consentCategory is configured on adapter', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;

            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, ['necessary']);

            expect(mockSendBeacon).toHaveBeenCalled();
        });

        it('should not send event when consentPreferences is undefined (consent not yet determined)', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createActiveDataAdapter(configWithConsent) as ActiveDataAdapter;

            await adapter.sendEvent(mockPageViewEvent, mockSiteInfo, undefined);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });
    });

    describe('dynamic site/locale', () => {
        it('should use siteInfo siteId and locale in the endpoint URL', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(mockPageViewEvent, { siteId: 'SiteGenesis', localeId: 'fr-FR' }, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalled();
            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);
            expect(url).toContain('Sites-SiteGenesis-Site/fr_FR/__Analytics-Start');
        });

        it('should convert locale from BCP-47 to underscore format', async () => {
            const adapter = createActiveDataAdapter(mockConfig) as ActiveDataAdapter;
            await adapter.sendEvent(
                mockPageViewEvent,
                { siteId: mockSiteObject.id, localeId: 'ja-JP' },
                defaultConsent
            );

            const url = getActiveDataUrl(mockSendBeacon.mock.calls[0]);
            expect(url).toContain(`Sites-${mockSiteObject.id}-Site/ja_JP/__Analytics-Start`);
        });
    });
});
