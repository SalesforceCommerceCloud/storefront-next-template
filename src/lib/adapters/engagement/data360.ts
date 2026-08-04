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
import Cookies from 'js-cookie';
import { hasConsent, type EngagementAdapter } from '@/lib/adapters';
import { createLogger } from '@/lib/logger';
import { bytesToBase64 } from '@/lib/url';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import {
    validateData360Config,
    type Data360Config,
    type Data360Event,
    type Data360Interaction,
} from './data360-config';

export const DATA360_ADAPTER_NAME = 'data360' as const;

const logger = createLogger({ adapter: DATA360_ADAPTER_NAME });

const DEFAULT_WEB_STORE_ID = 'sfnext';

/**
 * Type guard to check if payload is AnalyticsUser
 */
function isAnalyticsUser(payload: unknown): payload is AnalyticsUser {
    return typeof payload === 'object' && payload !== null && 'userType' in payload;
}

/**
 * Resolve the Data 360 product id in the same priority order PWA Kit used:
 * variant sku (`id`) → search-hit sku (`productId`) → master sku (`masterId`).
 */
function resolveProductId(
    product: Partial<ShopperProducts.schemas['Product']> | ShopperSearch.schemas['ProductSearchHit']
): string | undefined {
    const p = product as { id?: string; productId?: string; master?: { masterId?: string } };
    return p?.id ?? p?.productId ?? p?.master?.masterId;
}

/**
 * The durable registered customer id, or `undefined` for guests / unresolved
 * sessions. Every SLAS session carries a `customerId` — guests get an ephemeral
 * `gcid`, registered shoppers a durable `rcid` — so `userType` alone decides
 * whether the id is the registered identity Data 360 should key on. A guest
 * `gcid` is deliberately dropped here: it is per-session and unattributable, no
 * better than the `usid` we already send.
 */
function registeredCustomerId(user: AnalyticsUser | null): string | undefined {
    return user?.userType === 'registered' && user.customerId ? user.customerId : undefined;
}

/**
 * The base event carried on every Data 360 event. `deviceId` prefers the
 * registered customer id and falls back to the guest `usid`; `customerId` is
 * only emitted for registered shoppers (a guest `gcid` is not). This matches
 * shipped PWA Kit exactly: its `use-datacloud.js` sets `deviceId = customerId ||
 * usid` (the "visitorId + guestId" formula from an early design doc never
 * shipped — `visitorId` is always null in PWA Kit).
 *
 * `sessionId` is `sid || usid`: PWA Kit reads the `sid` cookie for the session
 * id, so preferring it keeps parity — a customer migrating from PWA Kit to
 * Storefront Next keeps the same session id in Data 360. `sid` isn't
 * guaranteed present, though (it's tied to Active Data being enabled, and may
 * not have landed yet when a beacon fires), so `usid` — always present — is the
 * fallback. `sid` is read fresh at send time (see `sendEvent`), so whichever
 * value exists when each beacon fires wins; early beacons fall back to `usid`
 * and later ones pick up `sid` once it's set.
 */
function buildBaseEvent(user: AnalyticsUser | null, siteId: string, sid?: string): Data360Event {
    const usid = user?.usid ?? '';
    const customerId = registeredCustomerId(user);
    return {
        guestId: usid,
        siteId,
        sessionId: sid || usid,
        deviceId: customerId || usid,
        dateTime: new Date().toISOString(),
        ...(customerId && { customerId }),
    };
}

/** Per-event details block (unique event id + type + category). */
function buildEventDetails(eventType: string, category: string): Data360Event {
    return {
        eventId: crypto.randomUUID(),
        eventType,
        category,
    };
}

/**
 * Party identification block. Guest → `CC_USID` keyed on usid; registered →
 * `CC_REGISTERED_CUSTOMER_ID` keyed on customerId. A registered user without a
 * resolved customerId is keyed as a guest (`CC_USID`) rather than emitting a
 * blank registered id.
 *
 * Deliberately minimal PII: PWA Kit also ships `customerNo` + `firstName` /
 * `lastName` (and `email`) for identity resolution; we send none of them. The
 * client analytics payload (`getPublicSessionData`) never exposes those fields —
 * only `customerId`/`usid` — so the registered `customerId` is the sole identity
 * key. Keep it this way unless identity resolution demonstrably needs `customerNo`;
 * adding it back means widening the client session payload to carry more PII.
 */
function buildPartyIdentification(user: AnalyticsUser | null, siteId: string): Data360Event {
    const customerId = registeredCustomerId(user);
    const identifier = customerId ?? user?.usid ?? '';
    const idType = customerId ? 'CC_REGISTERED_CUSTOMER_ID' : 'CC_USID';
    return {
        party: identifier,
        userId: identifier,
        IDName: idType,
        IDType: idType,
        partyIdentificationId: identifier,
        internalOrganizationId: siteId,
        creationEventId: crypto.randomUUID(),
    };
}

/**
 * Standard identity + partyIdentification events prepended to every
 * interaction. Consent is already confirmed by the time this runs (the
 * sendEvent gate blocks on `hasConsent`), so there is no separate DNT path.
 */
function buildStandardEvents(
    base: Data360Event,
    user: AnalyticsUser | null,
    siteId: string,
    identityExtras: Data360Event = {}
): Data360Event[] {
    const identity: Data360Event = {
        ...base,
        ...buildEventDetails('identity', 'Profile'),
        // Anonymous unless we have a durable registered id — same gate as the party
        // block, so a registered user whose customerId hasn't resolved yet isn't
        // reported as a known profile keyed only on the ephemeral usid.
        isAnonymous: registeredCustomerId(user) ? 0 : 1,
        ...identityExtras,
    };
    const partyIdentification: Data360Event = {
        ...base,
        ...buildEventDetails('partyIdentification', 'Profile'),
        ...buildPartyIdentification(user, siteId),
    };
    return [identity, partyIdentification];
}

/**
 * Base search metadata shared by category + search impression events.
 *
 * `searchResultTitle` carries the shopper's search query (PWA Kit parity — its
 * `_constructBaseSearchResult` sets `searchResultTitle: searchParams.q`), not the
 * per-hit product name, so this DLO field means the same thing across both sources.
 * Category browse has no query, so callers pass '' (matching PWA Kit's empty `q`).
 *
 * `searchResultPosition` is the global 0-based position (`offset + index`) and
 * `searchResultPageNumber` is `floor(offset/limit) + 1` — computed from the
 * `offset`/`limit` threaded through the mediator event (matching the pager's own
 * page-number formula). When paging is absent (undefined `offset`/`limit`) it
 * falls back to page-local values (position = per-page index, page = 1).
 */
function buildSearchResult(index: number, searchTitle: string, offset = 0, limit = 0): Data360Event {
    return {
        searchResultTitle: searchTitle,
        searchResultPosition: offset + index,
        searchResultPageNumber: limit > 0 ? Math.floor(offset / limit) + 1 : 1,
    };
}

/**
 * Map an analytics event to its Data 360 domain event(s). Returns `null`
 * when the event type has no Data 360 mapping (cart/checkout/wishlist/clicks
 * — PWA Kit parity only covers view/impression), so the caller can no-op
 * rather than throw and error the mediator's `Promise.allSettled` fan-out.
 */
function buildDomainEvents(event: AnalyticsEvent, base: Data360Event, webStoreId: string): Data360Event[] | null {
    switch (event.eventType) {
        case 'view_page':
            return [
                {
                    ...base,
                    ...buildEventDetails('userEngagement', 'Engagement'),
                    interactionName: 'page-view',
                    sourceUrl: event.path,
                },
            ];

        case 'view_product':
            return [
                {
                    ...base,
                    ...buildEventDetails('catalog', 'Engagement'),
                    id: resolveProductId(event.product),
                    type: 'Product',
                    webStoreId,
                    interactionName: 'catalog-object-view-start',
                },
            ];

        case 'view_category':
            // Category browse has no search query — '' matches PWA Kit's empty `q`.
            return event.searchResults.map((hit, index) => ({
                ...base,
                ...buildEventDetails('catalog', 'Engagement'),
                ...buildSearchResult(index, '', event.offset, event.limit),
                id: resolveProductId(hit),
                type: 'Product',
                webStoreId,
                categoryId: event.category.id,
                interactionName: 'catalog-object-impression',
            }));

        case 'view_search':
            return event.searchResults.map((hit, index) => ({
                ...base,
                ...buildEventDetails('catalog', 'Engagement'),
                ...buildSearchResult(index, event.searchInputText, event.offset, event.limit),
                searchResultId: crypto.randomUUID(),
                id: resolveProductId(hit),
                type: 'Product',
                webStoreId,
                interactionName: 'catalog-object-impression',
            }));

        case 'view_recommender':
            return event.products.map((product) => ({
                ...base,
                ...buildEventDetails('catalog', 'Engagement'),
                id: resolveProductId(product),
                type: 'Product',
                webStoreId,
                interactionName: 'catalog-object-impression',
                personalizationId: event.recommenderName,
                personalizationContentId: event.recommenderId,
            }));

        default:
            // No Data 360 mapping (cart/checkout/wishlist/click) — no-op.
            return null;
    }
}

/**
 * Build the full interaction envelope for an event, or `null` when the event
 * type has no Data 360 mapping.
 */
function buildInteraction(
    event: AnalyticsEvent,
    siteId: string,
    webStoreId: string,
    sid?: string
): Data360Interaction | null {
    const user = isAnalyticsUser(event.payload) ? event.payload : null;
    const base = buildBaseEvent(user, siteId, sid);

    const domainEvents = buildDomainEvents(event, base, webStoreId);
    // `null` = event type has no DC mapping; `[]` = a mapped event (search/category/
    // recommender) with an empty result list — nothing to impress, so no-op rather
    // than send an identity-only beacon PWA Kit never emitted.
    if (!domainEvents || domainEvents.length === 0) {
        return null;
    }

    // page-view carries the source URL on its identity event too (PWA Kit parity).
    const identityExtras: Data360Event = event.eventType === 'view_page' ? { sourceUrl: event.path } : {};
    const standardEvents = buildStandardEvents(base, user, siteId, identityExtras);

    return { events: [...standardEvents, ...domainEvents] };
}

/**
 * Create a Data 360 adapter that implements the EngagementAdapter interface.
 *
 * Delivers interactions to `https://{tenantId}.c360a.salesforce.com/web/events/{appSourceId}/`
 * via `navigator.sendBeacon` with a base64 `event=` form body — the transform
 * the Data 360 SDK's `DataCloudMiddleware` applies. Never throws for delivery.
 */
export function createData360Adapter(config: Data360Config): EngagementAdapter {
    const { errors } = validateData360Config(config);
    if (!config.eventToggles) {
        errors.push(`Missing required field: eventToggles`);
    }
    if (errors.length > 0) {
        throw new Error(`Data 360 adapter configuration is invalid: ${errors.join('; ')}`, { cause: errors });
    }

    const webStoreId = config.webStoreId || DEFAULT_WEB_STORE_ID;
    const url = `https://${config.tenantId}.c360a.salesforce.com/web/events/${config.appSourceId}/`;

    return {
        name: DATA360_ADAPTER_NAME,

        sendEvent: async (
            event: AnalyticsEvent,
            siteInfo?: EventSiteInfo,
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

            // Prefer the shopper's current site (the mediator passes it per event) over
            // the configured default, so events on a multi-site storefront carry the
            // right `siteId`/`internalOrganizationId`. Falls back to config.siteId
            // (a required, validated field) when the mediator omits siteInfo.
            const siteId = siteInfo?.siteId || config.siteId;
            // Read `sid` fresh per beacon (PWA Kit parity — its use-datacloud hook
            // reads Cookies.get('sid') at build time). `sid` is not httpOnly, so it's
            // readable here; it may be absent (Active Data disabled, or not yet set),
            // in which case buildBaseEvent falls back to usid.
            const sid = Cookies.get('sid');
            const interaction = buildInteraction(event, siteId, webStoreId, sid);
            if (!interaction) {
                // No Data 360 mapping for this event type — no-op (don't throw).
                return Promise.resolve({});
            }

            // UTF-8-safe base64 — raw btoa throws on non-Latin1 chars (e.g. accented
            // or emoji product names in searchResultTitle).
            const body = `event=${bytesToBase64(new TextEncoder().encode(JSON.stringify(interaction)))}`;
            const success = navigator.sendBeacon(url, new Blob([body], { type: 'application/x-www-form-urlencoded' }));

            if (!success) {
                // sendBeacon returns false when the browser refuses to queue the
                // payload — most commonly a large fan-out (view_category/view_search
                // impressions) exceeding the ~64KB beacon cap. The event is dropped;
                // log it so the drop is diagnosable rather than silent.
                logger.debug('sendBeacon refused the Data 360 payload (dropped)', {
                    eventType: event.eventType,
                    bytes: body.length,
                });
            }

            return Promise.resolve({ success });
        },
    };
}
