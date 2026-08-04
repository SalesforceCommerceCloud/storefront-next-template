import { a as ShopperSearch, i as ShopperProducts, n as ShopperBasketsV2, t as ShopperBasketsV1 } from "./types2.js";
import "openapi-fetch";

//#region src/events/types.d.ts

type BasketProductItem = ShopperBasketsV1.schemas['ProductItem'] | ShopperBasketsV2.schemas['ProductItem'];
type Basket = ShopperBasketsV1.schemas['Basket'] | ShopperBasketsV2.schemas['Basket'];
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
interface AnalyticsUser {
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
interface PayloadTbd {}
/**
 * Union type for analytics event payloads.
 * Currently includes AnalyticsUser, with PayloadTbd as a placeholder for future types.
 */
type AnalyticsPayload = AnalyticsUser | PayloadTbd;
type BaseEvent = {
  eventType: string;
  payload: AnalyticsPayload;
  deviceInfo?: string;
};
interface ViewPageEvent extends BaseEvent {
  eventType: 'view_page';
  path: string;
}
interface ViewProductEvent extends BaseEvent {
  eventType: 'view_product';
  product: ShopperProducts.schemas['Product'];
}
interface ViewSearchEvent extends BaseEvent {
  eventType: 'view_search';
  searchInputText: string;
  searchResults: ShopperSearch.schemas['ProductSearchHit'][];
  sort: string;
  refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
  /** Paging metadata for global (not page-local) search-result position/page number. */
  offset?: number;
  limit?: number;
  total?: number;
}
interface ViewCategoryEvent extends BaseEvent {
  eventType: 'view_category';
  category: ShopperProducts.schemas['Category'];
  searchResults: ShopperSearch.schemas['ProductSearchHit'][];
  sort: string;
  refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
  /** Paging metadata for global (not page-local) search-result position/page number. */
  offset?: number;
  limit?: number;
  total?: number;
}
interface ViewRecommenderEvent extends BaseEvent {
  eventType: 'view_recommender';
  recommenderId: string;
  recommenderName: string;
  products: ShopperSearch.schemas['ProductSearchHit'][];
}
interface ClickProductInCategoryEvent extends BaseEvent {
  eventType: 'click_product_in_category';
  category: ShopperProducts.schemas['Category'];
  product: ShopperSearch.schemas['ProductSearchHit'];
}
interface ClickProductInSearchEvent extends BaseEvent {
  eventType: 'click_product_in_search';
  searchInputText: string;
  product: ShopperSearch.schemas['ProductSearchHit'];
}
interface ClickProductInRecommenderEvent extends BaseEvent {
  eventType: 'click_product_in_recommender';
  recommenderId: string;
  recommenderName: string;
  product: ShopperSearch.schemas['ProductSearchHit'];
}
interface CartItemAddEvent extends BaseEvent {
  eventType: 'cart_item_add';
  cartItems: Array<BasketProductItem>;
}
interface CheckoutStartEvent extends BaseEvent {
  eventType: 'checkout_start';
  basket: Basket;
}
interface CheckoutStepEvent extends BaseEvent {
  eventType: 'checkout_step';
  stepName: string;
  stepNumber: number;
  basket: Basket;
}
interface ViewSearchSuggestionEvent extends BaseEvent {
  eventType: 'view_search_suggestion';
  searchInputText: string;
  suggestions: Array<string>;
}
interface ClickSearchSuggestionEvent extends BaseEvent {
  eventType: 'click_search_suggestion';
  searchInputText: string;
  suggestion: string;
}
/** Wishlist item added by shopper */
interface WishlistItemAddedEvent extends BaseEvent {
  eventType: 'wishlist_item_added';
  surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
  productId: string;
}
/** Wishlist item removed by shopper */
interface WishlistItemRemovedEvent extends BaseEvent {
  eventType: 'wishlist_item_removed';
  surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
  productId: string;
}
/** Wishlist page viewed */
interface WishlistViewedEvent extends BaseEvent {
  eventType: 'wishlist_viewed';
}
/** Individual product merged from guest to registered wishlist */
interface WishlistItemMergedEvent extends BaseEvent {
  eventType: 'wishlist_item_merged';
  productId: string;
}
/** Summary of guest wishlist merge operation on login */
interface WishlistMergedEvent extends BaseEvent {
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
interface AnalyticsEventExtensions {}
/**
 * Union type for all analytics events.
 *
 * Custom types can be added by extending the AnalyticsEventExtensions interface.
 */
type AnalyticsEvent = ViewPageEvent | ViewProductEvent | ViewSearchEvent | ViewCategoryEvent | ViewRecommenderEvent | ClickProductInCategoryEvent | ClickProductInSearchEvent | ClickProductInRecommenderEvent | CartItemAddEvent | CheckoutStartEvent | CheckoutStepEvent | ViewSearchSuggestionEvent | ClickSearchSuggestionEvent | WishlistItemAddedEvent | WishlistItemRemovedEvent | WishlistViewedEvent | WishlistItemMergedEvent | WishlistMergedEvent | AnalyticsEventExtensions[keyof AnalyticsEventExtensions];
/**
 * Helper type for mapping event_type to the corresponding event type.
 */
type EventTypeMap = { [K in AnalyticsEvent as K['eventType']]: K };
/**
 * Helper type for extracting event payload data for a given event type.
 */
type EventPayload<T extends AnalyticsEvent['eventType']> = Omit<EventTypeMap[T], 'eventType' | 'payload'> & {
  payload: AnalyticsPayload;
};
/** Site identification passed to adapters at event-send time */
type EventSiteInfo = {
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
type ConsentCategory = string;
/**
 * The set of consent categories a shopper has granted.
 *
 * Each adapter checks whether its required `consentCategory` is included
 * in the preferences before sending events.
 */
type ConsentPreferences = ConsentCategory[];
/**
 * Minimal interface for engagement adapters that can send analytics events.
 * Engagement Adapters must implement this interface to work with the event mediator.
 */
interface EventAdapter {
  name: string;
  sendEvent?: (event: AnalyticsEvent, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences) => Promise<unknown>;
}
/**
 * Generic event mediator interface for tracking events.
 * This can be used for analytics, telemetry, or any other event tracking system.
 */
type EventMediator = {
  track: (event: AnalyticsEvent, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences) => void;
};
//#endregion
//#region src/events/events.d.ts
/**
 * Type-safe event creation function
 *
 * This generic function allows creating any event type under AnalyticsEvent
 * with full type safety. The event type is inferred from the string literal
 * passed as the first parameter, and TypeScript will enforce the correct
 * data properties for that specific event type.
 *
 * @example
 * ```typescript
 * const viewPageEvent = createEvent('view_page', { path: '/products', payload });
 * const viewProductEvent = createEvent('view_product', { product, payload });
 * ```
 */
declare function createEvent<T extends AnalyticsEvent['eventType']>(eventType: T, data: EventPayload<T>): EventTypeMap[T];
/**
 * Send a view page event to the event mediator
 *
 * This wrapper function is used in the automated page view event tracking client middleware.
 * This function exists to support build-time checks and type safety.
 *
 * @param event - The view page event to send
 * @param eventMediator - The event mediator to send the event to
 */
declare function sendViewPageEvent(event: ViewPageEvent, eventMediator: EventMediator, siteInfo?: EventSiteInfo, consentPreferences?: ConsentPreferences): void;
//#endregion
//#region src/events/mediator.d.ts
/**
 * Get the event mediator singleton instance
 *
 * Returns the singleton EventMediator instance, creating it if it doesn't exist.
 *
 * @param getAdapters - Function that returns the current array of engagement adapters.
 * @returns EventMediator instance (singleton) or undefined if not on client side
 */
declare function getEventMediator(getAdapters: () => EventAdapter[]): EventMediator | undefined;
/**
 * Reset the event mediator singleton (for testing only)
 *
 * This function clears the singleton instance, allowing tests to create a fresh mediator.
 */
declare function resetEventMediator(): void;
//#endregion
export { AnalyticsEvent, AnalyticsEventExtensions, AnalyticsPayload, AnalyticsUser, BaseEvent, CartItemAddEvent, CheckoutStartEvent, CheckoutStepEvent, ClickProductInCategoryEvent, ClickProductInRecommenderEvent, ClickProductInSearchEvent, ClickSearchSuggestionEvent, ConsentCategory, ConsentPreferences, EventAdapter, EventMediator, EventPayload, EventSiteInfo, EventTypeMap, PayloadTbd, ViewCategoryEvent, ViewPageEvent, ViewProductEvent, ViewRecommenderEvent, ViewSearchEvent, ViewSearchSuggestionEvent, WishlistItemAddedEvent, WishlistItemMergedEvent, WishlistItemRemovedEvent, WishlistMergedEvent, WishlistViewedEvent, createEvent, getEventMediator, resetEventMediator, sendViewPageEvent };
//# sourceMappingURL=events.d.ts.map