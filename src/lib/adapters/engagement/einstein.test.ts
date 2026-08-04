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
 * Einstein Adapter Tests
 *
 * Tests the Einstein analytics adapter functionality including event transformation,
 * product extraction, and activity creation for various event types.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEinsteinAdapter } from './einstein';
import type { EinsteinConfig } from './einstein-config';
import type { ShopperBasketsV2, ShopperProducts, ShopperSearch } from '@/scapi';
import type { AnalyticsEvent, ConsentPreferences } from '@salesforce/storefront-next-runtime/events';
import type { EngagementAdapter } from '@/lib/adapters';

// Helper type that guarantees sendEvent is implemented (Einstein adapter implements it)
type EinsteinAdapter = EngagementAdapter & {
    sendEvent: (event: AnalyticsEvent, siteInfo?: any, consentPreferences?: ConsentPreferences) => Promise<unknown>;
};

// Mock navigator.sendBeacon
const mockSendBeacon = vi.fn();
Object.defineProperty(navigator, 'sendBeacon', {
    value: mockSendBeacon,
    writable: true,
});

// Helper function to get the payload from the sendBeacon call
const getBeaconPayload = async (): Promise<any> => {
    const call = mockSendBeacon.mock.calls[0];
    const blob = call[1] as Blob;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const content = JSON.parse(reader.result as string);
                resolve(content);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsText(blob);
    });
};

// Mock configuration
const mockConfig: EinsteinConfig = {
    enabled: true,
    realm: 'realm',
    siteId: 'siteId',
    host: 'https://api.cquotient.com',
    einsteinId: 'test-einstein-id',
    isProduction: false,
    eventToggles: {
        view_page: true,
        view_product: true,
        view_search: true,
        view_category: true,
        view_recommender: true,
        click_product_in_category: true,
        click_product_in_search: true,
        click_product_in_recommender: true,
        cart_item_add: true,
        checkout_start: true,
        checkout_step: true,
        view_search_suggestion: true,
        click_search_suggestion: true,
        wishlist_item_added: true,
        wishlist_item_removed: true,
        wishlist_viewed: true,
        wishlist_item_merged: true,
        wishlist_merged: true,
    },
};

// Mock user data
const mockUser = {
    userType: 'registered' as const,
    usid: 'test-usid',
    encUserId: 'test-enc-user-id',
};

// Mock product data
const mockProduct: ShopperProducts.schemas['Product'] = {
    id: 'test-product-id',
    name: 'Test Product',
    type: {
        master: true,
    },
} as ShopperProducts.schemas['Product'];

const mockVariantProduct: ShopperProducts.schemas['Product'] = {
    id: 'test-variant-id',
    name: 'Test Variant',
    type: {
        variant: true,
    },
    master: {
        masterId: 'test-master-id',
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
    currency: 'USD',
    price: 29.99,
} as ShopperSearch.schemas['ProductSearchHit'];

// Mock analytics events
const mockPageViewEvent: AnalyticsEvent = {
    eventType: 'view_page',
    payload: mockUser,
    path: '/test-page',
} as AnalyticsEvent;

const mockProductViewEvent: AnalyticsEvent = {
    eventType: 'view_product',
    payload: mockUser,
    product: mockProduct,
} as AnalyticsEvent;

const mockSearchEvent: AnalyticsEvent = {
    eventType: 'view_search',
    payload: mockUser,
    searchInputText: 'test search',
    searchResults: [mockSearchResult],
} as AnalyticsEvent;

const mockCartItemAddEvent: AnalyticsEvent = {
    eventType: 'cart_item_add',
    payload: mockUser,
    cartItems: [mockCartItem],
} as AnalyticsEvent;

const mockCheckoutStartEvent: AnalyticsEvent = {
    eventType: 'checkout_start',
    payload: mockUser,
    basket: mockBasket,
} as AnalyticsEvent;

// Default consent preferences for non-consent tests — provides sufficient consent
// so tests can focus on event transformation and payload correctness
const defaultConsent: ConsentPreferences = ['necessary', 'analytics', 'marketing', 'personalization'];

describe('Einstein Adapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('sendEvent', () => {
        it('should send page view event with correct payload', async () => {
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(mockPageViewEvent, undefined, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'https://api.cquotient.com/v3/activities/realm-siteId/viewPage?clientId=test-einstein-id',
                expect.any(Blob)
            );

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                currentLocation: '/test-page',
            });
        });

        it('should send product view event with correct payload', async () => {
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(mockProductViewEvent, undefined, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'https://api.cquotient.com/v3/activities/realm-siteId/viewProduct?clientId=test-einstein-id',
                expect.any(Blob)
            );

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                product: {
                    id: 'test-product-id',
                },
            });
        });

        it('should send search event with correct payload', async () => {
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(mockSearchEvent, undefined, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'https://api.cquotient.com/v3/activities/realm-siteId/viewSearch?clientId=test-einstein-id',
                expect.any(Blob)
            );

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                searchText: 'test search',
                showProducts: true,
                products: [
                    {
                        id: 'test-product-id',
                        sku: 'test-product-id',
                    },
                ],
            });
        });

        it('should send cart item add event with correct payload', async () => {
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(mockCartItemAddEvent, undefined, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'https://api.cquotient.com/v3/activities/realm-siteId/addToCart?clientId=test-einstein-id',
                expect.any(Blob)
            );

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                products: [
                    {
                        id: 'test-product-id',
                        quantity: 2,
                        price: 29.99,
                    },
                ],
            });
        });

        it('should send checkout start event with correct payload', async () => {
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(mockCheckoutStartEvent, undefined, defaultConsent);

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'https://api.cquotient.com/v3/activities/realm-siteId/beginCheckout?clientId=test-einstein-id',
                expect.any(Blob)
            );

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                products: [
                    {
                        id: 'test-product-id',
                        quantity: 2,
                        price: 29.99,
                    },
                ],
                amount: 59.98,
                checkoutType: 'one-click',
            });
        });

        it('should handle guest user correctly', async () => {
            const guestUser = { ...mockUser, userType: 'guest' as const };
            const guestEvent = { ...mockPageViewEvent, payload: guestUser };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(guestEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: undefined,
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                currentLocation: '/test-page',
            });
        });

        it('should use production instance type when configured', async () => {
            const prodConfig = { ...mockConfig, isProduction: true };
            const adapter = createEinsteinAdapter(prodConfig) as EinsteinAdapter;
            await adapter.sendEvent(mockPageViewEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload.instanceType).toBe('prd');
        });

        it('should handle undefined usid gracefully', async () => {
            const userWithoutUsid = { ...mockUser, usid: undefined };
            const eventWithoutUsid = { ...mockPageViewEvent, payload: userWithoutUsid };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(eventWithoutUsid, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload.cookieId).toBe('');
        });

        it('should throw error for unsupported event types', async () => {
            const unsupportedEvent = { ...mockPageViewEvent, eventType: 'unsupported' };
            const configWithUnsupported = {
                ...mockConfig,
                eventToggles: {
                    ...mockConfig.eventToggles,
                    unsupported: true,
                },
            };
            const adapter = createEinsteinAdapter(configWithUnsupported) as EinsteinAdapter;

            await expect(adapter.sendEvent(unsupportedEvent as any, undefined, defaultConsent)).rejects.toThrow(
                'Unsupported event type in Einstein adapter'
            );
            expect(mockSendBeacon).not.toHaveBeenCalled();
        });
    });

    describe('consent category filtering', () => {
        it('should send event when adapter consentCategory is in consentPreferences', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createEinsteinAdapter(configWithConsent) as EinsteinAdapter;

            await adapter.sendEvent(mockPageViewEvent, undefined, ['necessary', 'analytics']);

            expect(mockSendBeacon).toHaveBeenCalled();
        });

        it('should not send event when adapter consentCategory is not in consentPreferences', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createEinsteinAdapter(configWithConsent) as EinsteinAdapter;

            await adapter.sendEvent(mockPageViewEvent, undefined, ['necessary']);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should not send event when consentPreferences is an empty array (all declined)', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createEinsteinAdapter(configWithConsent) as EinsteinAdapter;

            await adapter.sendEvent(mockPageViewEvent, undefined, []);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('should send event when no consentCategory is configured on adapter', async () => {
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;

            await adapter.sendEvent(mockPageViewEvent, undefined, ['necessary']);

            expect(mockSendBeacon).toHaveBeenCalled();
        });

        it('should not send event when consentPreferences is undefined (consent not yet determined)', async () => {
            const configWithConsent = { ...mockConfig, consentCategory: 'analytics' };
            const adapter = createEinsteinAdapter(configWithConsent) as EinsteinAdapter;

            await adapter.sendEvent(mockPageViewEvent, undefined, undefined);

            expect(mockSendBeacon).not.toHaveBeenCalled();
        });
    });

    describe('additional event types', () => {
        it('should send category view event with correct payload', async () => {
            const categoryViewEvent: AnalyticsEvent = {
                eventType: 'view_category',
                payload: mockUser,
                category: {
                    id: 'test-category-id',
                },
                searchResults: [mockSearchResult],
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(categoryViewEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                category: {
                    id: 'test-category-id',
                },
                showProducts: true,
                products: [
                    {
                        id: 'test-product-id',
                        sku: 'test-product-id',
                    },
                ],
            });
        });

        it('should send recommender view event with correct payload', async () => {
            const recommenderViewEvent: AnalyticsEvent = {
                eventType: 'view_recommender',
                payload: mockUser,
                recommenderId: 'test-recommender-id',
                recommenderName: 'Test Recommender',
                products: [mockSearchResult],
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(recommenderViewEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                recoId: 'test-recommender-id',
                recommenderName: 'Test Recommender',
                products: [{ id: 'test-product-id', sku: 'test-product-id' }],
            });
        });

        it('should send click product in category event with correct payload', async () => {
            const clickProductInCategoryEvent: AnalyticsEvent = {
                eventType: 'click_product_in_category',
                payload: mockUser,
                category: {
                    id: 'test-category-id',
                },
                product: mockSearchResult,
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(clickProductInCategoryEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                category: {
                    id: 'test-category-id',
                },
                product: {
                    id: 'test-product-id',
                    sku: 'test-product-id',
                },
            });
        });

        it('should send click product in search event with correct payload', async () => {
            const clickProductInSearchEvent: AnalyticsEvent = {
                eventType: 'click_product_in_search',
                payload: mockUser,
                searchInputText: 'test search',
                product: mockSearchResult,
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(clickProductInSearchEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                searchText: 'test search',
                product: {
                    id: 'test-product-id',
                    sku: 'test-product-id',
                },
            });
        });

        it('should send click product in recommender event with correct payload', async () => {
            const clickProductInRecommenderEvent: AnalyticsEvent = {
                eventType: 'click_product_in_recommender',
                payload: mockUser,
                recommenderId: 'test-recommender-id',
                recommenderName: 'Test Recommender',
                product: mockSearchResult,
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(clickProductInRecommenderEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                recoId: 'test-recommender-id',
                recommenderName: 'Test Recommender',
                product: {
                    id: 'test-product-id',
                    sku: 'test-product-id',
                },
            });
        });

        it('should send checkout step event with correct payload', async () => {
            const checkoutStepEvent: AnalyticsEvent = {
                eventType: 'checkout_step',
                payload: mockUser,
                stepName: 'shipping',
                stepNumber: 1,
                basket: mockBasket,
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(checkoutStepEvent, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload).toEqual({
                userId: 'test-enc-user-id',
                cookieId: 'test-usid',
                instanceType: 'sbx',
                realm: 'realm',
                stepName: 'shipping',
                stepNumber: 1,
                basketId: 'test-basket-id',
                checkoutType: 'one-click',
            });
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle missing product data gracefully', async () => {
            const eventWithoutProduct = { ...mockProductViewEvent, product: undefined };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;

            // This should throw because the adapter expects product data for product_view events
            await expect(adapter.sendEvent(eventWithoutProduct as any, undefined, defaultConsent)).rejects.toThrow();
        });

        it('should handle missing cart items gracefully', async () => {
            const eventWithoutCartItems = { ...mockCartItemAddEvent, cartItems: undefined };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;

            // This should throw because the adapter expects cartItems for cart_item_add events
            await expect(adapter.sendEvent(eventWithoutCartItems as any, undefined, defaultConsent)).rejects.toThrow();
        });

        it('should handle missing basket data gracefully', async () => {
            const eventWithoutBasket = { ...mockCheckoutStartEvent, basket: undefined };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;

            // This should throw because the adapter expects basket for checkout_start events
            await expect(adapter.sendEvent(eventWithoutBasket as any, undefined, defaultConsent)).rejects.toThrow();
        });

        it('should handle products with missing master data', async () => {
            const productWithoutMaster = {
                ...mockVariantProduct,
                master: undefined,
            };
            const productViewEventWithoutMaster: AnalyticsEvent = {
                eventType: 'view_product',
                payload: mockUser,
                product: productWithoutMaster,
            } as AnalyticsEvent;
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(productViewEventWithoutMaster, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload.product).toEqual({
                id: 'test-variant-id', // Should fallback to product.id
                sku: 'test-variant-id',
            });
        });

        it('should handle cart items with missing quantity and price', async () => {
            const cartItemWithMissingData = {
                ...mockCartItem,
                quantity: undefined,
                price: undefined,
            };
            const cartEventWithMissingData = {
                ...mockCartItemAddEvent,
                cartItems: [cartItemWithMissingData],
            };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(cartEventWithMissingData, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload.products[0]).toEqual({
                id: 'test-product-id',
                quantity: 0,
                price: 0,
            });
        });

        it('should handle basket with missing subtotal', async () => {
            const basketWithoutSubtotal = {
                ...mockBasket,
                productSubTotal: undefined,
            };
            const checkoutEventWithoutSubtotal = {
                ...mockCheckoutStartEvent,
                basket: basketWithoutSubtotal,
            };
            const adapter = createEinsteinAdapter(mockConfig) as EinsteinAdapter;
            await adapter.sendEvent(checkoutEventWithoutSubtotal, undefined, defaultConsent);

            const payload = await getBeaconPayload();

            expect(payload.amount).toBe(0);
        });
    });

    describe('configuration validation', () => {
        it('throws when the shared validator reports an invalid config', () => {
            // Per-field matrix lives in einstein-config.test.ts; this is a wiring smoke test
            // that the adapter surfaces validator failures as a thrown error.
            expect(() => createEinsteinAdapter({ ...mockConfig, host: '' })).toThrow(
                /Einstein adapter configuration is invalid:.*Missing required field: host/
            );
        });

        it('throws when eventToggles is missing (adapter-specific check)', () => {
            const partial: Partial<EinsteinConfig> = { ...mockConfig };
            delete partial.eventToggles;
            expect(() => createEinsteinAdapter(partial as EinsteinConfig)).toThrow(
                /Einstein adapter configuration is invalid:.*Missing required field: eventToggles/
            );
        });

        it('accepts a valid configuration', () => {
            expect(() => createEinsteinAdapter(mockConfig)).not.toThrow();
        });
    });
});
