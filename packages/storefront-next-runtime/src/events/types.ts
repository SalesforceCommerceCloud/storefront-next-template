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

import type { ShopperBasketsV1, ShopperBasketsV2, ShopperProducts, ShopperSearch } from '../scapi-client';

// Union types to support both V1 and V2 basket APIs
type BasketProductItem = ShopperBasketsV1.schemas['ProductItem'] | ShopperBasketsV2.schemas['ProductItem'];
type Basket = ShopperBasketsV1.schemas['Basket'] | ShopperBasketsV2.schemas['Basket'];

// ============================================================================
// Analytics Payload Types
// ============================================================================

/**
 * Interface for analytics user properties.
 * This can be extended by external code via module augmentation without modifying the events module.
 *
 * @example
 * ```typescript
 * declare module '@storefront-next/runtime/events' {
 *   interface AnalyticsUser {
 *     customField: string;
 *     preferences: Record<string, any>;
 *     loyaltyTier?: 'bronze' | 'silver' | 'gold';
 *   }
 * }
 * ```
 */
export interface AnalyticsUser {
    userType: 'registered' | 'guest';
    usid?: string;
    sid?: string;
    encUserId?: string;
    customerId?: string;
    customerNo?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
}

/**
 * Placeholder type for future payload types.
 * This allows the payload union to be extended in the future.
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PayloadTbd {
    // Placeholder for future payload types
}

/**
 * Union type for analytics event payloads.
 * Currently includes AnalyticsUser, with PayloadTbd as a placeholder for future types.
 */
export type AnalyticsPayload = AnalyticsUser | PayloadTbd;

// ============================================================================
// Event Types
// ============================================================================

export type BaseEvent = {
    eventType: string;
    payload: AnalyticsPayload;
    deviceInfo?: string;
};

export interface ViewPageEvent extends BaseEvent {
    eventType: 'view_page';
    path: string;
}

export interface ViewProductEvent extends BaseEvent {
    eventType: 'view_product';
    product: ShopperProducts.schemas['Product'];
}

export interface ViewSearchEvent extends BaseEvent {
    eventType: 'view_search';
    searchInputText: string;
    searchResults: ShopperSearch.schemas['ProductSearchHit'][];
    sort: string;
    refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
}

export interface ViewCategoryEvent extends BaseEvent {
    eventType: 'view_category';
    category: ShopperProducts.schemas['Category'];
    searchResults: ShopperSearch.schemas['ProductSearchHit'][];
    sort: string;
    refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
}

export interface ViewRecommenderEvent extends BaseEvent {
    eventType: 'view_recommender';
    recommenderId: string;
    recommenderName: string;
    products: ShopperSearch.schemas['ProductSearchHit'][];
}

export interface ClickProductInCategoryEvent extends BaseEvent {
    eventType: 'click_product_in_category';
    category: ShopperProducts.schemas['Category'];
    product: ShopperSearch.schemas['ProductSearchHit'];
}

export interface ClickProductInSearchEvent extends BaseEvent {
    eventType: 'click_product_in_search';
    searchInputText: string;
    product: ShopperSearch.schemas['ProductSearchHit'];
}

export interface ClickProductInRecommenderEvent extends BaseEvent {
    eventType: 'click_product_in_recommender';
    recommenderId: string;
    recommenderName: string;
    product: ShopperSearch.schemas['ProductSearchHit'];
}

export interface CartItemAddEvent extends BaseEvent {
    eventType: 'cart_item_add';
    cartItems: Array<BasketProductItem>;
}

export interface CheckoutStartEvent extends BaseEvent {
    eventType: 'checkout_start';
    basket: Basket;
}

export interface CheckoutStepEvent extends BaseEvent {
    eventType: 'checkout_step';
    stepName: string;
    stepNumber: number;
    basket: Basket;
}

export interface ViewSearchSuggestionEvent extends BaseEvent {
    eventType: 'view_search_suggestion';
    searchInputText: string;
    suggestions: Array<string>;
}

export interface ClickSearchSuggestionEvent extends BaseEvent {
    eventType: 'click_search_suggestion';
    searchInputText: string;
    suggestion: string;
}

/** Wishlist item added by shopper */
export interface WishlistItemAddedEvent extends BaseEvent {
    eventType: 'wishlist_item_added';
    surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
    productId: string;
}

/** Wishlist item removed by shopper */
export interface WishlistItemRemovedEvent extends BaseEvent {
    eventType: 'wishlist_item_removed';
    surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
    productId: string;
}

/** Wishlist page viewed */
export interface WishlistViewedEvent extends BaseEvent {
    eventType: 'wishlist_viewed';
}

/** Individual product merged from guest to registered wishlist */
export interface WishlistItemMergedEvent extends BaseEvent {
    eventType: 'wishlist_item_merged';
    productId: string;
}

/** Summary of guest wishlist merge operation on login */
export interface WishlistMergedEvent extends BaseEvent {
    eventType: 'wishlist_merged';
    merged: number;
    skipped: number;
    failed: number;
    mergedProductIds: string[];
    skippedProductIds: string[];
    failedProductIds: string[];
}

/**
 * Interface for custom analytics events.
 * Extend this interface via module augmentation.
 *
 * @example
 * ```typescript
 * declare module '@storefront-next/runtime/events' {
 *   interface AnalyticsEventExtensions {
 *     CustomEvent: BaseEvent & { eventType: 'custom'; data: string };
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AnalyticsEventExtensions {
    // This interface can be extended by external code
}

/**
 * Union type for all analytics events.
 *
 * Custom types can be added by extending the AnalyticsEventExtensions interface.
 */
export type AnalyticsEvent =
    | ViewPageEvent
    | ViewProductEvent
    | ViewSearchEvent
    | ViewCategoryEvent
    | ViewRecommenderEvent
    | ClickProductInCategoryEvent
    | ClickProductInSearchEvent
    | ClickProductInRecommenderEvent
    | CartItemAddEvent
    | CheckoutStartEvent
    | CheckoutStepEvent
    | ViewSearchSuggestionEvent
    | ClickSearchSuggestionEvent
    | WishlistItemAddedEvent
    | WishlistItemRemovedEvent
    | WishlistViewedEvent
    | WishlistItemMergedEvent
    | WishlistMergedEvent
    | AnalyticsEventExtensions[keyof AnalyticsEventExtensions];

/**
 * Helper type for mapping event_type to the corresponding event type.
 */
export type EventTypeMap = {
    [K in AnalyticsEvent as K['eventType']]: K;
};

/**
 * Helper type for extracting event payload data for a given event type.
 */
export type EventPayload<T extends AnalyticsEvent['eventType']> = Omit<EventTypeMap[T], 'eventType' | 'payload'> & {
    payload: AnalyticsPayload;
};

// ============================================================================
// Event System Types
// ============================================================================

/** Site identification passed to adapters at event-send time */
export type EventSiteInfo = {
    siteId: string;
    localeId: string;
};

/**
 * Consent categories for granular tracking control.
 *
 * Adapters declare which consent category they require via configuration.
 * The event system passes the shopper's granted categories (consentPreferences) to each adapter,
 * allowing per-adapter consent decisions.
 *
 * This is typed as `string` so projects can define categories that match their
 * consent management platform. Common conventions:
 *
 * - `'necessary'` — Essential cookies/tracking required for site functionality
 * - `'analytics'` — Usage analytics and performance measurement
 * - `'marketing'` — Marketing, advertising, and retargeting
 * - `'personalization'` — Product recommendations and personalized experiences
 */
export type ConsentCategory = string;

/**
 * The set of consent categories a shopper has granted.
 *
 * Each adapter checks whether its required `consentCategory` is included
 * in the preferences before sending events.
 */
export type ConsentPreferences = ConsentCategory[];

/**
 * Minimal interface for engagement adapters that can send analytics events.
 * Engagement Adapters must implement this interface to work with the event mediator.
 */
export interface EventAdapter {
    name: string;
    sendEvent?: (
        event: AnalyticsEvent,
        siteInfo?: EventSiteInfo,
        consentPreferences?: ConsentPreferences
    ) => Promise<unknown>;
}

/**
 * Generic event mediator interface for tracking events.
 * This can be used for analytics, telemetry, or any other event tracking system.
 */
export type EventMediator = {
    track: (event: AnalyticsEvent, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences) => void;
};
