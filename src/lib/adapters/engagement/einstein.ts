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
import type {
    AnalyticsEvent,
    AnalyticsUser,
    ConsentPreferences,
    EventSiteInfo,
} from '@salesforce/storefront-next-runtime/events';
import { hasConsent, type EngagementAdapter } from '@/lib/adapters';
import type { ShopperProducts, ShopperBasketsV2, ShopperSearch } from '@/scapi';
import { validateEinsteinConfig, type EinsteinConfig } from './einstein-config';

export const EINSTEIN_ADAPTER_NAME = 'einstein' as const;

const einsteinEventToEndpointMap: Record<AnalyticsEvent['eventType'], string> = {
    view_page: 'viewPage',
    view_product: 'viewProduct',
    view_search: 'viewSearch',
    view_category: 'viewCategory',
    view_recommender: 'viewReco',
    click_product_in_category: 'clickCategory',
    click_product_in_search: 'clickSearch',
    click_product_in_recommender: 'clickReco',
    cart_item_add: 'addToCart',
    checkout_start: 'beginCheckout',
    checkout_step: 'checkoutStep',
    view_search_suggestion: 'viewSearchSuggestion',
    click_search_suggestion: 'clickSearchSuggestion',
    wishlist_item_added: 'wishlistItemAdded',
    wishlist_item_removed: 'wishlistItemRemoved',
    wishlist_viewed: 'wishlistViewed',
    wishlist_item_merged: 'wishlistItemMerged',
    wishlist_merged: 'wishlistMerged',
};

export type EinsteinActivity = {
    userId?: string;
    cookieId: string;
    instanceType: 'prd' | 'sbx';
    clientIp?: string;
    clientUserAgent?: string;
    realm?: string;
    // Activity payloads accept event-specific extension fields (e.g. searchTerm, refinements,
    // products) whose shape varies per Einstein endpoint and is not statically declared here.
    [key: string]: unknown;
};

type EinsteinItem = {
    id: string;
    quantity: number;
    price: number;
    sku?: string;
    type?: string;
};

/**
 * Product format for Einstein API requests
 */
export type EinsteinProduct = {
    id: string;
    sku?: string;
    altId?: string;
    type?: string;
    price?: number;
};

/**
 * Map analytics event types to Einstein activity endpoints
 *
 * See https://developer.salesforce.com/docs/commerce/einstein-api/references/einstein-activities?meta=Summary
 * for the list of available endpoints
 *
 * @param eventType - The type of event to map
 * @returns The Einstein activity endpoint for the event type
 */
function mapEventTypeToEinsteinEndpoint(eventType: AnalyticsEvent['eventType']): string | undefined {
    return einsteinEventToEndpointMap[eventType] || undefined;
}

/**
 * Helper to extract base product mapping (id and sku) based on product type
 *
 * @param product - Product data to map
 * @param price - Optional price to include in mapping (undefined = not included, 0 = included as 0)
 */
function getProductMapping(product: Partial<ShopperProducts.schemas['Product']>, price?: number): EinsteinProduct {
    const productId = product.id || '';
    const masterId = product.master?.masterId ?? productId;

    let mapping: EinsteinProduct;

    if (product.type?.variant) {
        mapping = { id: masterId, sku: productId };
    } else if (product.type?.variationGroup) {
        mapping = { id: masterId, sku: productId, altId: productId, type: 'vgroup' };
    } else {
        // Handles all other product types or scenarios where type is not defined
        mapping = { id: productId };
    }

    // Only include price if explicitly provided (even if 0)
    if (price !== undefined) {
        mapping.price = price;
    }

    return mapping;
}

/**
 * Helper to map ProductSearchHit to Einstein product format
 * Used for consistent mapping of search results in analytics events
 */
function mapProductSearchHitToEinstein(p: ShopperSearch.schemas['ProductSearchHit']): EinsteinProduct {
    return {
        id: p.productId,
        sku: p.productId,
    };
}

/**
 * Given a cart item, returns the data that Einstein requires
 *
 * Assumes item is a ProductItem from SCAPI Shopper-Baskets:
 * https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-baskets?meta=type%3AProductItem
 */
function extractEinsteinItemInfoFromCartItem(item: ShopperBasketsV2.schemas['ProductItem']): EinsteinItem {
    const { product, productId, price, quantity } = item;

    // Type assertion: product can contain product data even though schema types it as {}
    const productData = product as Partial<ShopperProducts.schemas['Product']> | undefined;

    // If product data exists and has meaningful data (id or type), use it; otherwise use productId from item
    const hasProductData = productData && (productData.id || productData.type);
    const mapping = getProductMapping(hasProductData ? productData : { id: productId ?? '' });

    return {
        ...mapping,
        quantity: quantity ?? 0,
        price: price ?? 0,
    };
}

/**
 * Type guard to check if payload is AnalyticsUser
 */
function isAnalyticsUser(payload: unknown): payload is AnalyticsUser {
    return typeof payload === 'object' && payload !== null && 'userType' in payload;
}

/**
 * Convert an analytics event to an Einstein activity
 */
function convertEventToEinsteinActivity(event: AnalyticsEvent, realm: string, isProduction: boolean): EinsteinActivity {
    // For now, payload will always be AnalyticsUser, but we check for type safety
    const user = isAnalyticsUser(event.payload) ? event.payload : null;
    const baseActivity: EinsteinActivity = {
        userId: user?.userType === 'registered' ? user?.encUserId : undefined,
        cookieId: user?.usid ?? '', // Ensure string type for cookieId
        instanceType: isProduction ? 'prd' : 'sbx',
        realm,
    };

    switch (event.eventType) {
        case 'view_product':
            return {
                ...baseActivity,
                product: getProductMapping(event.product, event.product.price),
            };

        case 'cart_item_add':
            return {
                ...baseActivity,
                products: event.cartItems.map((item: ShopperBasketsV2.schemas['ProductItem']) =>
                    extractEinsteinItemInfoFromCartItem(item)
                ),
            };

        case 'view_search':
            return {
                ...baseActivity,
                searchText: event.searchInputText,
                showProducts: Boolean(event.searchResults.length),
                products: event.searchResults.map(mapProductSearchHitToEinstein),
            };

        case 'view_category':
            return {
                ...baseActivity,
                category: {
                    id: event.category.id,
                },
                showProducts: Boolean(event.searchResults.length),
                products: event.searchResults.map(mapProductSearchHitToEinstein),
            };

        case 'view_recommender':
            return {
                ...baseActivity,
                recoId: event.recommenderId,
                // The Einstein `viewReco` endpoint validates `recommenderName` (not `recoType`) and
                // requires each product as an `{ id, sku }` object, not a bare id string.
                recommenderName: event.recommenderName,
                products: event.products.map(mapProductSearchHitToEinstein),
            };

        case 'click_product_in_category':
            return {
                ...baseActivity,
                category: {
                    id: event.category.id,
                },
                product: mapProductSearchHitToEinstein(event.product),
            };
        case 'click_product_in_search':
            return {
                ...baseActivity,
                searchText: event.searchInputText,
                product: mapProductSearchHitToEinstein(event.product),
            };
        case 'click_product_in_recommender':
            return {
                ...baseActivity,
                recoId: event.recommenderId,
                // Einstein `clickReco` validates `recommenderName` (not `recoType`).
                recommenderName: event.recommenderName,
                product: mapProductSearchHitToEinstein(event.product),
            };

        case 'checkout_start':
            return {
                ...baseActivity,
                products: event.basket.productItems?.map((item: ShopperBasketsV2.schemas['ProductItem']) =>
                    extractEinsteinItemInfoFromCartItem(item)
                ),
                amount: event.basket.productSubTotal ?? 0,
                checkoutType: 'one-click',
            };

        case 'checkout_step':
            return {
                ...baseActivity,
                stepName: event.stepName,
                stepNumber: event.stepNumber,
                basketId: event.basket.basketId,
                checkoutType: 'one-click',
            };

        case 'view_page':
            return {
                ...baseActivity,
                currentLocation: event.path,
            };

        case 'view_search_suggestion':
            return {
                ...baseActivity,
                searchText: event.searchInputText,
                suggestions: event.suggestions,
            };

        case 'click_search_suggestion':
            return {
                ...baseActivity,
                searchText: event.searchInputText,
                suggestion: event.suggestion,
            };

        case 'wishlist_item_added':
            return {
                ...baseActivity,
                productId: event.productId,
                surface: event.surface,
            };

        case 'wishlist_item_removed':
            return {
                ...baseActivity,
                productId: event.productId,
                surface: event.surface,
            };

        case 'wishlist_viewed':
            return {
                ...baseActivity,
            };

        case 'wishlist_item_merged':
            return {
                ...baseActivity,
                productId: event.productId,
            };

        case 'wishlist_merged':
            return {
                ...baseActivity,
                merged: event.merged,
                skipped: event.skipped,
                failed: event.failed,
                mergedProductIds: event.mergedProductIds,
                skippedProductIds: event.skippedProductIds,
                failedProductIds: event.failedProductIds,
            };

        default:
            // If this error is reached, the type of `event` is incorrect or a new event type needs to be handled.
            throw new Error('Unsupported event type in Einstein adapter', {
                cause: (event as Record<string, unknown>)?.eventType,
            });
    }
}

/**
 * Create an Einstein adapter that implements the EngagementAdapter interface for analytics events.
 */
export function createEinsteinAdapter(config: EinsteinConfig): EngagementAdapter {
    const { errors } = validateEinsteinConfig(config);
    if (!config.eventToggles) {
        errors.push(`Missing required field: eventToggles`);
    }
    if (errors.length > 0) {
        throw new Error(`Einstein adapter configuration is invalid: ${errors.join('; ')}`, { cause: errors });
    }

    return {
        name: EINSTEIN_ADAPTER_NAME,

        sendEvent: async (
            event: AnalyticsEvent,
            _siteInfo?: EventSiteInfo,
            consentPreferences?: ConsentPreferences
        ): Promise<unknown> => {
            // Don't send events if adapter lacks required consent
            if (!hasConsent(config.consentCategory, consentPreferences)) {
                return Promise.resolve({});
            }

            // Don't send events that are not enabled for this adapter
            if (!config.eventToggles[event.eventType]) {
                return Promise.resolve({});
            }

            const endpoint = mapEventTypeToEinsteinEndpoint(event.eventType);
            if (!endpoint) throw new Error('Unsupported event type in Einstein adapter', { cause: event.eventType });

            const activity = convertEventToEinsteinActivity(event, config.realm, config.isProduction);

            const targetEndpointUrl = `${config.host}/v3/activities/${config.realm}-${config.siteId}/${endpoint}?clientId=${config.einsteinId}`;
            const payload = new Blob([JSON.stringify(activity)], { type: 'application/json' });

            const success = navigator.sendBeacon(targetEndpointUrl, payload);

            return Promise.resolve({ success });
        },
    };
}
