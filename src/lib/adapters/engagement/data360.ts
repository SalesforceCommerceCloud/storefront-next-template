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
import { resolvePrefix } from '@salesforce/storefront-next-runtime/site-context';
import Cookies from 'js-cookie';
import { initDataCloudSdk } from '@salesforce/cc-datacloud-typescript';
import {
    ViewPageBuilder,
    ProductViewStartBuilder,
    SearchBuilder,
    ViewProductImpressionsBuilder,
    type Event,
    type Identity,
    type PartyIdentification,
    type Catalog,
    type SearchResult,
    type ViewPage,
    type ProductViewStart,
    type Search,
    type ViewProductImpressions,
} from '@salesforce/cc-datacloud-typescript/models';
import { hasConsent, type EngagementAdapter } from '@/lib/adapters';
import { createLogger } from '@/lib/logger';
import { isPageViewBlocked } from '@/lib/url';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import { validateData360Config, type Data360Config } from './data360-config';

export const DATA360_ADAPTER_NAME = 'data360' as const;

const logger = createLogger({ adapter: DATA360_ADAPTER_NAME });

const DEFAULT_WEB_STORE_ID = 'sfnext';

type ViewSearchEvent = Extract<AnalyticsEvent, { eventType: 'view_search' }>;
type Data360Interaction = ViewPage | ProductViewStart | Search | ViewProductImpressions;
type BaseEvent = Omit<Event, 'eventId' | 'eventType' | 'category'>;

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
 * not have landed yet when an interaction is sent), so `usid` — always present — is the
 * fallback. `sid` is read fresh at send time (see `sendEvent`), so whichever
 * value exists at send time wins; early interactions fall back to `usid`
 * and later ones pick up `sid` once it's set.
 */
function buildBaseEvent(user: AnalyticsUser | null, siteId: string, sid?: string): BaseEvent {
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
function buildEventDetails(
    eventType: Event['eventType'],
    category: Event['category']
): Pick<Event, 'eventId' | 'eventType' | 'category'> {
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
function buildPartyIdentification(
    user: AnalyticsUser | null,
    siteId: string
): Pick<
    PartyIdentification,
    'party' | 'userId' | 'IDName' | 'IDType' | 'partyIdentificationId' | 'internalOrganizationId'
> {
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
    };
}

/**
 * Standard identity + partyIdentification events prepended to every
 * interaction. Consent is already confirmed by the time this runs (the
 * sendEvent gate blocks on `hasConsent`), so there is no separate DNT path.
 */
function buildStandardEvents(
    base: BaseEvent,
    user: AnalyticsUser | null,
    siteId: string,
    identityExtras: Pick<Identity, 'sourceUrl'> = {}
): [Identity, PartyIdentification] {
    const identity: Identity = {
        ...base,
        ...buildEventDetails('identity', 'Profile'),
        // Anonymous unless we have a durable registered id — same gate as the party
        // block, so a registered user whose customerId hasn't resolved yet isn't
        // reported as a known profile keyed only on the ephemeral usid.
        isAnonymous: registeredCustomerId(user) ? '0' : '1',
        ...identityExtras,
    };
    const partyIdentification: PartyIdentification = {
        ...base,
        ...buildEventDetails('partyIdentification', 'Profile'),
        ...buildPartyIdentification(user, siteId),
    };
    return [identity, partyIdentification];
}

/**
 * Search position metadata shared by category + search impression events.
 * `searchResultPosition` is the global 1-based position (`offset + index + 1`) and
 * `searchResultPositionInPage` is the page-local 1-based position. The
 * `searchResultPageNumber` is `floor(offset/limit) + 1` — computed from the
 * `offset`/`limit` threaded through the mediator event (matching the pager's own
 * page-number formula). When paging is absent (undefined `offset`/`limit`) it
 * falls back to page-local values (positions = per-page index + 1, page = 1).
 */
function buildSearchPosition(index: number, offset = 0, limit = 0): SearchResult {
    return {
        searchResultPosition: offset + index + 1,
        searchResultPositionInPage: index + 1,
        searchResultPageNumber: limit > 0 ? Math.floor(offset / limit) + 1 : 1,
    };
}

/**
 * Map an analytics event to its Data 360 domain event(s). Returns `null`
 * when the event type has no Data 360 mapping (cart/checkout/wishlist/clicks
 * — PWA Kit parity only covers view/impression), so the caller can no-op
 * rather than throw and error the mediator's `Promise.allSettled` fan-out.
 */
function buildDomainEvents(event: AnalyticsEvent, base: BaseEvent, webStoreId: string): Catalog[] | null {
    const catalog = (
        product: Partial<ShopperProducts.schemas['Product']> | ShopperSearch.schemas['ProductSearchHit'],
        extras: Pick<
            Catalog,
            'categoryId' | 'searchResultTitle' | 'searchResultId' | 'personalizationId' | 'personalizationContentId'
        > &
            SearchResult = {}
    ): Catalog[] => {
        const id = resolveProductId(product);
        if (typeof id !== 'string' || id.trim() === '') {
            logger.debug('Skipping Data 360 catalog item with an invalid identifier', { eventType: event.eventType });
            return [];
        }
        return [
            {
                ...base,
                ...buildEventDetails('catalog', 'Engagement'),
                id,
                type: 'Product',
                webStoreId,
                interactionName:
                    event.eventType === 'view_product' ? 'catalog-object-view-start' : 'catalog-object-impression',
                ...extras,
            },
        ];
    };
    switch (event.eventType) {
        case 'view_product':
            return catalog(event.product);

        case 'view_category':
            return event.searchResults.flatMap((hit, index) =>
                catalog(hit, {
                    ...buildSearchPosition(index, event.offset, event.limit),
                    categoryId: event.category.id,
                })
            );

        case 'view_search':
            return event.searchResults.flatMap((hit, index) =>
                catalog(hit, {
                    ...buildSearchPosition(index, event.offset, event.limit),
                    ...(hit.productName && { searchResultTitle: hit.productName }),
                    searchResultId: event.searchResultId,
                })
            );

        case 'view_recommender':
            return event.products.flatMap((product) =>
                catalog(product, {
                    personalizationId: event.recommenderName,
                    personalizationContentId: event.recommenderId,
                })
            );

        default:
            // No Data 360 mapping (cart/checkout/wishlist/click) — no-op.
            return null;
    }
}

/** Build the self-contained Search interaction sent once per Search Execution. */
function buildSearchInteraction(
    event: ViewSearchEvent,
    siteId: string,
    webStoreId: string,
    searchResultId: string,
    sid?: string
): Search {
    const user = isAnalyticsUser(event.payload) ? event.payload : null;
    const base = buildBaseEvent(user, siteId, sid);
    const [identity, party] = buildStandardEvents(base, user, siteId);
    return new SearchBuilder()
        .withIdentity(identity)
        .withPartyIdentification(party)
        .withSearchEvent({
            ...base,
            ...buildEventDetails('searchEvent', 'Engagement'),
            interactionName: 'search',
            eventStatus: 'success',
            searchQuery: event.searchInputText,
            searchResultId,
            numberOfResultsReturned: event.searchResults.length,
            resultsReturnedQuantity: event.total ?? event.searchResults.length,
            webStoreId,
        })
        .build();
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

    if (event.eventType === 'view_page') {
        const [identity, party] = buildStandardEvents(base, user, siteId, { sourceUrl: event.path });
        return new ViewPageBuilder()
            .withIdentity(identity)
            .withPartyIdentification(party)
            .withUserEngagement({
                ...base,
                ...buildEventDetails('userEngagement', 'Engagement'),
                interactionName: 'page-view',
                sourceUrl: event.path,
            })
            .build();
    }
    const domainEvents = buildDomainEvents(event, base, webStoreId);
    // `null` = event type has no DC mapping; `[]` = a mapped event (search/category/
    // recommender) with an empty result list — nothing to impress, so no-op rather
    // than send an identity-only interaction PWA Kit never emitted.
    if (!domainEvents || domainEvents.length === 0) {
        return null;
    }

    const [identity, party] = buildStandardEvents(base, user, siteId);
    const builder =
        event.eventType === 'view_product' ? new ProductViewStartBuilder() : new ViewProductImpressionsBuilder();
    builder.withIdentity(identity).withPartyIdentification(party);
    for (const domain of domainEvents) {
        builder.withCatalog(domain);
    }
    return builder.build();
}

/**
 * Create a Data 360 adapter that implements the EngagementAdapter interface.
 *
 * Delivers interactions to `https://{tenantId}.c360a.salesforce.com/web/events/{appSourceId}/`
 * via the public SDK's fetch transport with keepalive and form serialization.
 * HTTP completion does not prove ingestion. Never throws for delivery.
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
    const client = initDataCloudSdk(config.tenantId, config.appSourceId, { keepalive: true });

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

            // Prefer the shopper's current site (the mediator passes it per event) over
            // the configured default, so events on a multi-site storefront carry the
            // right `siteId`/`internalOrganizationId`. Falls back to config.siteId
            // (a required, validated field) when the mediator omits siteInfo.
            const siteId = siteInfo?.siteId || config.siteId;
            // Read `sid` fresh per send (PWA Kit parity — its use-datacloud hook
            // reads Cookies.get('sid') at build time). `sid` is not httpOnly, so it's
            // readable here; it may be absent (Active Data disabled, or not yet set),
            // in which case buildBaseEvent falls back to usid.
            const sid = Cookies.get('sid');
            // Defer each build to its caught delivery attempt so a builder failure does not block sibling envelopes.
            const interactions: Array<{
                eventType: AnalyticsEvent['eventType'];
                build: () => Data360Interaction | null;
            }> = [];
            const pageViewPrefix =
                config.urlPrefix && siteInfo
                    ? resolvePrefix({
                          prefix: config.urlPrefix,
                          params: {
                              siteId: config.siteAliasMap?.[siteInfo.siteId] ?? siteInfo.siteId,
                              localeId: config.localeAliasMap?.[siteInfo.localeId] ?? siteInfo.localeId,
                          },
                      })
                    : '';

            const searchResultId =
                event.eventType === 'view_search' ? (event.searchResultId ?? crypto.randomUUID()) : undefined;

            if (
                config.eventToggles.view_page &&
                (event.eventType === 'view_category' ||
                    event.eventType === 'view_product' ||
                    event.eventType === 'view_search') &&
                (event.eventType !== 'view_category' || event.isNavigation !== false) &&
                isPageViewBlocked(event.path ?? '/', pageViewPrefix, config.pageViewsBlocklist)
            ) {
                interactions.push({
                    eventType: 'view_page',
                    build: () =>
                        buildInteraction(
                            { eventType: 'view_page', path: event.path ?? '/', payload: event.payload },
                            siteId,
                            webStoreId,
                            sid
                        ),
                });
            }

            if (
                config.eventToggles.view_search &&
                event.eventType === 'view_search' &&
                event.startsSearchExecution !== false &&
                searchResultId
            ) {
                interactions.push({
                    eventType: 'view_search',
                    build: () => buildSearchInteraction(event, siteId, webStoreId, searchResultId, sid),
                });
            }

            if (config.eventToggles[event.eventType]) {
                interactions.push({
                    eventType: event.eventType,
                    build: () =>
                        buildInteraction(
                            event.eventType === 'view_search' && searchResultId ? { ...event, searchResultId } : event,
                            siteId,
                            webStoreId,
                            sid
                        ),
                });
            }

            if (interactions.length === 0) {
                // No Data 360 mapping for this event type — no-op (don't throw).
                return Promise.resolve({});
            }

            const results = await Promise.all(
                interactions.map(async ({ eventType, build }) => {
                    try {
                        const interaction = build();
                        if (!interaction) return true;
                        await client.webEventsAppSourceIdPost(interaction);
                        return true;
                    } catch {
                        logger.debug('Failed to deliver the Data 360 payload (dropped)', { eventType });
                        return false;
                    }
                })
            );

            return Promise.resolve({ success: results.every(Boolean) });
        },
    };
}
