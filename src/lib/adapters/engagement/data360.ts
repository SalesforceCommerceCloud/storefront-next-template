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
 * analytics call. Consent is already confirmed by the time this runs (the
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
    base: BaseEvent,
    profiles: [Identity, PartyIdentification],
    webStoreId: string,
    searchResultId: string
): Search {
    const [identity, party] = profiles;
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
    base: BaseEvent,
    profiles: [Identity, PartyIdentification],
    webStoreId: string
): Data360Interaction | null {
    const [identity, party] = profiles;

    if (event.eventType === 'view_page') {
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
    // Exercise public SDK validation/serialization without sending preflight envelopes.
    const preflight = initDataCloudSdk(config.tenantId, config.appSourceId, {
        fetchApi: () => Promise.resolve(new Response(null, { status: 204 })),
    });

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
            let sid: string | undefined;
            // All slices use one context; deferred builds keep local failures isolated.
            let base: BaseEvent;
            let profiles: [Identity, PartyIdentification];
            const interactions: Array<{
                eventType: AnalyticsEvent['eventType'];
                build: () => Data360Interaction | null;
            }> = [];
            let pageViewPrefix: string;
            let searchResultId: string | undefined;
            try {
                sid = Cookies.get('sid');
                pageViewPrefix =
                    config.urlPrefix && siteInfo
                        ? resolvePrefix({
                              prefix: config.urlPrefix,
                              params: {
                                  siteId: config.siteAliasMap?.[siteInfo.siteId] ?? siteInfo.siteId,
                                  localeId: config.localeAliasMap?.[siteInfo.localeId] ?? siteInfo.localeId,
                              },
                          })
                        : '';

                searchResultId =
                    event.eventType === 'view_search' ? (event.searchResultId ?? crypto.randomUUID()) : undefined;
            } catch {
                logger.debug('Rejected Data 360 call (context construction failed)', { eventType: event.eventType });
                return { success: false };
            }

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
                            base,
                            profiles,
                            webStoreId
                        ),
                });
            }

            if (
                config.eventToggles.view_search &&
                event.eventType === 'view_search' &&
                event.startsSearchExecution !== false &&
                searchResultId
            ) {
                const correlatedSearchResultId = searchResultId;
                interactions.push({
                    eventType: 'view_search',
                    build: () => buildSearchInteraction(event, base, profiles, webStoreId, correlatedSearchResultId),
                });
            }

            if (config.eventToggles[event.eventType]) {
                interactions.push({
                    eventType: event.eventType,
                    build: () =>
                        buildInteraction(
                            event.eventType === 'view_search' && searchResultId ? { ...event, searchResultId } : event,
                            base,
                            profiles,
                            webStoreId
                        ),
                });
            }

            if (interactions.length === 0) {
                // No Data 360 mapping for this event type — no-op (don't throw).
                return Promise.resolve({});
            }

            try {
                const user = isAnalyticsUser(event.payload) ? event.payload : null;
                base = buildBaseEvent(user, siteId, sid);
                profiles = buildStandardEvents(
                    base,
                    user,
                    siteId,
                    interactions.some((slice) => slice.eventType === 'view_page')
                        ? { sourceUrl: ('path' in event && event.path) || '/' }
                        : {}
                );
                await preflight.webEventsAppSourceIdPost({ events: profiles });
            } catch {
                logger.debug('Rejected Data 360 call (profile construction/validation/serialization failed)', {
                    eventType: event.eventType,
                });
                return { success: false };
            }

            const events: Array<Data360Interaction['events'][number]> = [...profiles];
            let success = true;
            for (const { eventType, build } of interactions) {
                try {
                    const interaction = build();
                    if (!interaction) continue;
                    await preflight.webEventsAppSourceIdPost(interaction);
                    events.push(...interaction.events.slice(2));
                } catch {
                    logger.debug('Omitted Data 360 slice (construction/validation/serialization failed)', {
                        eventType,
                    });
                    success = false;
                }
            }
            // No engagement events survived; do not send a profile-only request.
            if (events.length === profiles.length) return { success };

            let transportStarted = false;
            let oversized = false;
            const client = initDataCloudSdk(config.tenantId, config.appSourceId, {
                keepalive: true,
                fetchApi: (input, init) => {
                    const bytes = new TextEncoder().encode(String(init?.body)).byteLength;
                    // Reject outright oversized SDK-encoded bodies so drops are easy to diagnose.
                    // The 64 KiB keepalive budget is shared across unfinished requests; this check
                    // cannot prevent quota failures for smaller bodies when other requests are in flight.
                    if (bytes > 65_536) {
                        oversized = true;
                        logger.debug('Rejected Data 360 call (encoded body exceeds keepalive limit)', {
                            eventType: event.eventType,
                            bytes,
                            limit: 65_536,
                        });
                        throw new Error('Oversized Data 360 body');
                    }
                    transportStarted = true;
                    return globalThis.fetch(input, init);
                },
            });
            try {
                await client.webEventsAppSourceIdPost({ events });
                return { success };
            } catch {
                if (!oversized) {
                    logger.debug(
                        transportStarted
                            ? 'Failed to deliver the Data 360 payload (shared request dropped)'
                            : 'Rejected Data 360 call (combined validation/serialization failed)',
                        { eventType: event.eventType }
                    );
                }
                return { success: false };
            }
        },
    };
}
