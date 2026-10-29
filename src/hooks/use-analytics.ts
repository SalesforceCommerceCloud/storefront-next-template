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
import { useRef, useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/providers/auth';
import type { SessionData } from '@/lib/api/types';
import type { ShopperBasketsV2, ShopperProducts, ShopperSearch } from '@/scapi';
import {
    createEvent,
    getEventMediator,
    type EventMediator,
    type AnalyticsEvent,
    type EventSiteInfo,
    type ConsentPreferences,
} from '@salesforce/storefront-next-runtime/events';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import type { AppConfig } from '@/types/config';
import { ensureAdaptersInitialized } from '@/lib/adapters/engagement/initialize';
import { getAllAdapters, buildConsentPreferences } from '@/lib/adapters';
import { useTrackingConsent } from './use-tracking-consent';
import { getSearchWithoutFiltersParam } from '@/hooks/use-filters-panel-state';

/**
 * Ensures adapters are initialized and returns the event mediator
 *
 * @param appConfig - The application configuration needed to initialize adapters
 * @returns EventMediator instance or undefined if not available
 */
async function getInitializedMediator(appConfig: AppConfig): Promise<EventMediator | undefined> {
    await ensureAdaptersInitialized(appConfig);
    return getEventMediator(getAllAdapters);
}

/**
 * Helper function to track an event with auth validation and mediator initialization
 *
 * @param getAuthPromise - Returns the current promise that resolves when auth is available
 * @param appConfig - The application configuration
 * @param consentPreferences - The visitor's granted consent categories (adapters use this for per-adapter filtering)
 * @param siteInfo - Site identification for multi-site support
 * @param eventType - The type of event to track
 * @param eventData - The event data (without user payload, as payload is added automatically)
 * @param isCurrent - Optional guard for cancellable current-view impressions
 * @returns Whether a consent-eligible event was handed to the mediator, not delivered
 */
// ⚠️ Build-time instrumentation check depends on this argument order.
// The `eventInstrumentationValidatorPlugin` in `storefront-next-dev` finds instrumented
// events with a regex that matches the FIRST string literal after the leading positional
// args (`trackEvent(...≥3 non-string args..., 'event_type', ...)`). If you add or remove a
// leading positional arg here (or move `eventType` off its position / pass it as a
// non-literal), update that regex in
// `packages/storefront-next-dev/src/plugins/eventInstrumentationValidator.ts` — otherwise the
// check silently stops finding events and reports false "never instrumented" warnings.
async function trackEvent<TEventType extends AnalyticsEvent['eventType']>(
    getAuthPromise: () => Promise<SessionData | undefined>,
    appConfig: AppConfig,
    consentPreferences: ConsentPreferences | undefined,
    siteInfo: EventSiteInfo | undefined,
    eventType: TEventType,
    eventData: Omit<Parameters<typeof createEvent<TEventType>>[1], 'payload'>,
    isCurrent: () => boolean = () => true
): Promise<boolean> {
    // Don't track if user has declined tracking or hasn't provided consent yet
    // (avoids unnecessary auth resolution and mediator initialization)
    if (!consentPreferences || consentPreferences.length === 0 || !isCurrent()) {
        return false;
    }

    // Wait for auth to be defined before tracking
    let auth = await getAuthPromise();
    if (auth === undefined || !isCurrent()) {
        // Auth not available - silently fail to not break the app
        return false;
    }

    const mediator = await getInitializedMediator(appConfig);
    if (!mediator || !isCurrent()) {
        return false;
    }

    // Auth may have changed while adapters initialized; wait for the current identity.
    auth = await getAuthPromise();
    if (auth === undefined || !isCurrent()) {
        return false;
    }

    const event = createEvent(eventType, {
        ...eventData,
        payload: {
            userType: auth.userType ?? 'guest',
            encUserId: auth.encUserId ?? undefined,
            usid: auth.usid,
            customerId: auth.customerId,
        },
    } as Parameters<typeof createEvent<TEventType>>[1]);
    mediator.track(event, siteInfo, consentPreferences);
    return true;
}

/**
 * Analytics hook provides tracking functions
 */
export const useAnalytics = () => {
    const auth = useAuth();
    const location = useLocation();
    const appConfig = useConfig();
    const { trackingConsent, isTrackingConsentEnabled } = useTrackingConsent();
    const { site, language } = useSite();
    const siteInfo = { siteId: site.id, localeId: language };
    const consentCategories = appConfig.engagement.analytics.trackingConsent?.consentCategories ?? [];
    const consentPreferences = buildConsentPreferences(trackingConsent, consentCategories, isTrackingConsentEnabled);
    const consentKey = JSON.stringify(consentPreferences ?? []);
    const viewKey = JSON.stringify([
        consentKey,
        site.id,
        language,
        location.pathname,
        getSearchWithoutFiltersParam(location.search),
    ]);
    const currentViewRef = useRef<{ key: string } | null>({ key: viewKey });
    // Refresh before consumers dispatch from layout effects, including deferred consent commits.
    useLayoutEffect(() => {
        currentViewRef.current = { key: viewKey };
        return () => {
            currentViewRef.current = null;
        };
    }, [viewKey]);
    const createCurrentViewGuard = (signal?: AbortSignal) => {
        const current = currentViewRef.current;
        return () => !signal?.aborted && current?.key === viewKey && currentViewRef.current === current;
    };

    // Store the promise resolver so we can resolve it when auth becomes available
    const authResolverRef = useRef<((value: SessionData | undefined) => void) | null>(null);

    // Create a promise that resolves when auth is available
    // This promise is updated via useEffect when auth changes
    const authPromiseRef = useRef<Promise<SessionData | undefined>>(Promise.resolve(auth));
    const getAuthPromise = () => authPromiseRef.current;

    // Update the promise when auth changes
    useEffect(() => {
        if (auth !== undefined) {
            // Auth is now available - resolve any pending promises
            if (authResolverRef.current) {
                authResolverRef.current(auth);
                authResolverRef.current = null;
            }
            // Create a new resolved promise for future calls
            authPromiseRef.current = Promise.resolve(auth);
        } else if (!authResolverRef.current) {
            // Auth is undefined - create a new pending promise
            authPromiseRef.current = new Promise<SessionData | undefined>((resolve) => {
                authResolverRef.current = resolve;
            });
        }
    }, [auth]);

    // On the server, return empty functions
    if (typeof window === 'undefined') {
        /* oxlint-disable @typescript-eslint/no-empty-function */
        return {
            consentKey,
            trackViewPage: () => {},
            trackViewProduct: (_data: { product: ShopperProducts.schemas['Product'] }, _signal?: AbortSignal) =>
                Promise.resolve(false),
            trackCartItemAdd: () => {},
            trackCheckoutStart: (_data: Parameters<typeof trackCheckoutStart>[0], _signal?: AbortSignal) =>
                Promise.resolve(false),
            trackCheckoutStep: (_data: Parameters<typeof trackCheckoutStep>[0], _signal?: AbortSignal) =>
                Promise.resolve(false),
            trackViewSearch: (_data: Parameters<typeof trackViewSearch>[0], _signal?: AbortSignal) =>
                Promise.resolve(false),
            trackViewCategory: (_data: Parameters<typeof trackViewCategory>[0], _signal?: AbortSignal) =>
                Promise.resolve(false),
            trackClickProductInCategory: () => {},
            trackClickProductInSearch: () => {},
            trackViewRecommender: (_data: Parameters<typeof trackViewRecommender>[0], _signal?: AbortSignal) =>
                Promise.resolve(false),
            trackClickProductInRecommender: () => {},
            trackViewSearchSuggestions: (
                _data: Parameters<typeof trackViewSearchSuggestions>[0],
                _signal?: AbortSignal
            ) => Promise.resolve(false),
            trackClickSearchSuggestion: () => {},
            trackWishlistItemAdded: () => {},
            trackWishlistItemRemoved: () => {},
            trackWishlistViewed: (_signal?: AbortSignal) => Promise.resolve(false),
            trackWishlistItemMerged: () => {},
            trackWishlistMerged: () => {},
        };
        /* oxlint-enable @typescript-eslint/no-empty-function */
    }

    /**
     * Tracks a page view event
     *
     * Page view events are sent automatically by the PageViewTracker component but this
     * function is provided for manual firing of page views.
     */
    const trackViewPage = async (data: { url: string }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'view_page', {
            path: data.url,
        });
    };

    /**
     * Track a product view
     */
    const trackViewProduct = async (data: { product: ShopperProducts.schemas['Product'] }, signal?: AbortSignal) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'view_product',
            {
                path: `${location.pathname}${location.search}${location.hash}`,
                product: data.product,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track add to cart
     */
    const trackCartItemAdd = async (data: { cartItems: ShopperBasketsV2.schemas['ProductItem'][] }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'cart_item_add', {
            cartItems: data.cartItems,
        });
    };

    /**
     * Track start of checkout process
     */
    const trackCheckoutStart = async (data: { basket: ShopperBasketsV2.schemas['Basket'] }, signal?: AbortSignal) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'checkout_start',
            {
                basket: data.basket,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track start of given checkout step
     */
    const trackCheckoutStep = async (
        data: {
            stepName: string;
            stepNumber: number;
            basket: ShopperBasketsV2.schemas['Basket'];
        },
        signal?: AbortSignal
    ) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'checkout_step',
            {
                stepName: data.stepName,
                stepNumber: data.stepNumber,
                basket: data.basket,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track search
     */
    const trackViewSearch = async (
        data: {
            searchResultId: string;
            startsSearchExecution: boolean;
            searchInputText: string;
            searchResults: ShopperSearch.schemas['ProductSearchHit'][];
            sort: string;
            refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
            offset?: number;
            limit?: number;
            total?: number;
        },
        signal?: AbortSignal
    ) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'view_search',
            {
                path: `${location.pathname}${location.search}${location.hash}`,
                searchResultId: data.searchResultId,
                startsSearchExecution: data.startsSearchExecution,
                searchInputText: data.searchInputText,
                searchResults: data.searchResults,
                sort: data.sort || '',
                refinements: data.refinements || {},
                offset: data.offset,
                limit: data.limit,
                total: data.total,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track category view
     */
    const trackViewCategory = async (
        data: {
            category: ShopperProducts.schemas['Category'];
            isNavigation?: boolean;
            searchResults: ShopperSearch.schemas['ProductSearchHit'][];
            sort: string;
            refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
            offset?: number;
            limit?: number;
            total?: number;
        },
        signal?: AbortSignal
    ) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'view_category',
            {
                path: `${location.pathname}${location.search}${location.hash}`,
                category: data.category,
                isNavigation: data.isNavigation,
                searchResults: data.searchResults,
                sort: data.sort || '',
                refinements: data.refinements || {},
                offset: data.offset,
                limit: data.limit,
                total: data.total,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track click on a product in a category
     */
    const trackClickProductInCategory = async (data: {
        category: ShopperProducts.schemas['Category'];
        product: ShopperSearch.schemas['ProductSearchHit'];
    }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'click_product_in_category', {
            category: data.category,
            product: data.product,
        });
    };

    /**
     * Track click on a product in a search
     */
    const trackClickProductInSearch = async (data: {
        searchInputText: string;
        product: ShopperSearch.schemas['ProductSearchHit'];
    }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'click_product_in_search', {
            searchInputText: data.searchInputText,
            product: data.product,
        });
    };

    /**
     * Track a recommender impression (carousel scrolled into view with resolved recs)
     */
    const trackViewRecommender = async (
        data: {
            recommenderId: string;
            recommenderName: string;
            products: ShopperSearch.schemas['ProductSearchHit'][];
        },
        signal?: AbortSignal
    ) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'view_recommender',
            {
                recommenderId: data.recommenderId,
                recommenderName: data.recommenderName,
                products: data.products,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track click on a product in a recommender carousel
     */
    const trackClickProductInRecommender = async (data: {
        recommenderId: string;
        recommenderName: string;
        product: ShopperSearch.schemas['ProductSearchHit'];
    }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'click_product_in_recommender', {
            recommenderId: data.recommenderId,
            recommenderName: data.recommenderName,
            product: data.product,
        });
    };

    /**
     * Track view of search suggestions
     */
    const trackViewSearchSuggestions = async (
        data: { searchInputText: string; suggestions: Array<string> },
        signal?: AbortSignal
    ) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'view_search_suggestion',
            {
                searchInputText: data.searchInputText,
                suggestions: data.suggestions,
            },
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track click on a search suggestion
     */
    const trackClickSearchSuggestion = async (data: { searchInputText: string; suggestion: string }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'click_search_suggestion', {
            searchInputText: data.searchInputText,
            suggestion: data.suggestion,
        });
    };

    /**
     * Track wishlist item added
     */
    const trackWishlistItemAdded = async (data: {
        surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
        productId: string;
    }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'wishlist_item_added', {
            surface: data.surface,
            productId: data.productId,
        });
    };

    /**
     * Track wishlist item removed
     */
    const trackWishlistItemRemoved = async (data: {
        surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
        productId: string;
    }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'wishlist_item_removed', {
            surface: data.surface,
            productId: data.productId,
        });
    };

    /**
     * Track wishlist page view
     */
    const trackWishlistViewed = async (signal?: AbortSignal) => {
        return trackEvent(
            getAuthPromise,
            appConfig,
            consentPreferences,
            siteInfo,
            'wishlist_viewed',
            {},
            createCurrentViewGuard(signal)
        );
    };

    /**
     * Track individual product merged from guest to registered wishlist
     */
    const trackWishlistItemMerged = async (data: { productId: string }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'wishlist_item_merged', {
            productId: data.productId,
        });
    };

    /**
     * Track wishlist merge operation summary on login
     */
    const trackWishlistMerged = async (data: {
        merged: number;
        skipped: number;
        failed: number;
        mergedProductIds: string[];
        skippedProductIds: string[];
        failedProductIds: string[];
    }) => {
        return trackEvent(getAuthPromise, appConfig, consentPreferences, siteInfo, 'wishlist_merged', data);
    };

    return {
        consentKey,
        trackViewPage,
        trackViewProduct,
        trackCartItemAdd,
        trackCheckoutStart,
        trackCheckoutStep,
        trackViewSearch,
        trackViewCategory,
        trackClickProductInCategory,
        trackClickProductInSearch,
        trackViewRecommender,
        trackClickProductInRecommender,
        trackViewSearchSuggestions,
        trackClickSearchSuggestion,
        trackWishlistItemAdded,
        trackWishlistItemRemoved,
        trackWishlistViewed,
        trackWishlistItemMerged,
        trackWishlistMerged,
    };
};
