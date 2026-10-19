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
 * Data 360 Adapter Tests
 *
 * Mirrors the PWA Kit `use-datacloud.test.js` payload assertions: standard
 * identity + partyIdentification events prepended to per-event domain events,
 * base64 `event=` form body, public SDK keepalive fetch delivery.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createData360Adapter } from './data360';
import type { Data360Config } from './data360-config';
import { SearchBuilder, type Interaction as Data360Interaction } from '@salesforce/cc-datacloud-typescript/models';
import { validateInteraction } from '@salesforce/cc-datacloud-typescript';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import type { AnalyticsEvent, ConsentPreferences } from '@salesforce/storefront-next-runtime/events';
import type { EngagementAdapter } from '@/lib/adapters';

// Capture the adapter's logger so we can assert on sanitized delivery-failure logs.
// vi.hoisted so the fn exists before vi.mock's hoisted factory references it.
const { mockLoggerDebug } = vi.hoisted(() => ({ mockLoggerDebug: vi.fn() }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: mockLoggerDebug,
    }),
}));

// Mock the `sid` cookie read. Default: absent (undefined) so sessionId falls
// back to usid; individual tests set `mockSidCookie` to exercise the sid path.
const { mockCookiesGet } = vi.hoisted(() => ({ mockCookiesGet: vi.fn(() => undefined as string | undefined) }));
vi.mock('js-cookie', () => ({ default: { get: mockCookiesGet } }));

type Data360Adapter = EngagementAdapter & {
    sendEvent: (event: AnalyticsEvent, siteInfo?: any, consentPreferences?: ConsentPreferences) => Promise<unknown>;
};

// Leave SDK initialization, builders, validation, and serialization real.
const mockFetch = vi.fn<typeof fetch>();

// Deterministic UUIDs so payload snapshots are stable
let uuidCounter = 0;
Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: vi.fn(() => `uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`),
    writable: true,
});

// Decode the base64 form body of the Nth SDK fetch call into the interaction.
// Parse the form normally before decoding its UTF-8 base64 event value.
const getInteraction = (callIndex = 0): Promise<Data360Interaction> => {
    const init = mockFetch.mock.calls[callIndex][1];
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('Expected SDK form body string');
    const base64 = new URLSearchParams(body).get('event');
    if (base64 === null) throw new Error('Missing event form value');
    // Decode the SDK's UTF-8-safe base64 serialization.
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)) as Data360Interaction);
};

const getRequestUrl = (callIndex = 0): string => String(mockFetch.mock.calls[callIndex][0]);

const mockConfig: Data360Config = {
    enabled: true,
    appSourceId: 'app-source-id',
    tenantId: 'test-tenant',
    siteId: 'RefArch',
    webStoreId: 'sfnext',
    pageViewsBlocklist: ['/product', '/category', '/search'],
    urlPrefix: '/:siteId/:localeId',
    siteAliasMap: { RefArch: 'global' },
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

const registeredUser = {
    userType: 'registered' as const,
    usid: 'test-usid',
    encUserId: 'test-enc-user-id',
    customerId: 'test-customer-id',
};

const guestUser = {
    userType: 'guest' as const,
    usid: 'test-usid',
};

const mockProduct = {
    id: 'test-product-id',
    type: { master: true },
} as ShopperProducts.schemas['Product'];

const mockSearchHit = {
    productId: 'hit-product-id',
    productName: 'Hit Product',
} as ShopperSearch.schemas['ProductSearchHit'];

const defaultConsent: ConsentPreferences = ['necessary', 'analytics', 'marketing', 'personalization'];

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', mockFetch);
    uuidCounter = 0;
    mockCookiesGet.mockReturnValue(undefined);
    window.history.replaceState({}, '', '/');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Data 360 Adapter', () => {
    it('delivers adapter envelopes through public SDK keepalive fetch serialization', async () => {
        const adapter = createData360Adapter(mockConfig);
        if (!adapter.sendEvent) throw new Error('Missing Data 360 sendEvent');
        const result = await adapter.sendEvent(
            {
                eventType: 'view_search',
                path: '/search?q=unicode',
                payload: registeredUser,
                searchInputText: '\u00e9\u6f22\ud83d\ude3e + / = &',
                searchResultId: 'qualification-search',
                searchResults: [{ ...mockSearchHit, productName: '\u00e9\u6f22\ud83d\ude3e + / = &' }],
                total: 7,
                sort: '',
                refinements: {},
            },
            { siteId: 'current-site', localeId: 'en-US' },
            defaultConsent
        );
        expect(result).toEqual({ success: true });
        expect(mockFetch).toHaveBeenCalledTimes(3);
        const interactions = await Promise.all([getInteraction(0), getInteraction(1), getInteraction(2)]);
        for (const [index, [, init]] of mockFetch.mock.calls.entries()) {
            if (!init) throw new Error('Missing request init');
            expect(getRequestUrl(index)).toBe('https://test-tenant.c360a.salesforce.com/web/events/app-source-id/');
            expect(init).toMatchObject({ method: 'POST', keepalive: true });
            expect(init.credentials).toBeUndefined();
            expect(new Headers(init.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
            for (const event of interactions[index].events) {
                expect(event).toMatchObject({ siteId: 'current-site' });
            }
        }
        expect(interactions[0].events[2]).toMatchObject({ interactionName: 'page-view' });
        expect(interactions[1].events[2]).toMatchObject({
            eventType: 'searchEvent',
            interactionName: 'search',
            searchQuery: '\u00e9\u6f22\ud83d\ude3e + / = &',
            searchResultId: 'qualification-search',
            numberOfResultsReturned: 1,
            resultsReturnedQuantity: 7,
        });
        expect(interactions[2].events[2]).toMatchObject({
            interactionName: 'catalog-object-impression',
            searchResultTitle: '\u00e9\u6f22\ud83d\ude3e + / = &',
            searchResultId: 'qualification-search',
        });
    });

    describe('invalid catalog identifiers', () => {
        it.each([undefined, '', ' \t '])('preserves identifier precedence for product ID %j', async (id) => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/product/invalid',
                    payload: guestUser,
                    product: {
                        id,
                        productId: 'must-not-fallback',
                        master: { masterId: 'master-id' },
                    } as ShopperProducts.schemas['Product'],
                },
                undefined,
                defaultConsent
            );
            // Missing id falls through to productId; blank ids must not.
            expect(mockFetch).toHaveBeenCalledTimes(id === undefined ? 2 : 1);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
            if (id === undefined) {
                expect((await getInteraction(1)).events[2]).toMatchObject({ id: 'must-not-fallback' });
            } else {
                expect(mockLoggerDebug).toHaveBeenCalledWith(
                    'Skipping Data 360 catalog item with an invalid identifier',
                    { eventType: 'view_product' }
                );
            }
        });

        it('retains only the Page View when a product has no identifier', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/product/invalid',
                    payload: guestUser,
                    product: {} as ShopperProducts.schemas['Product'],
                },
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
        });

        it('retains Page View and Search when every search hit is invalid', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search',
                    payload: guestUser,
                    searchInputText: '',
                    searchResultId: 'empty-query-search',
                    searchResults: [{ productId: '' }, { productId: ' ' }],
                    sort: '',
                    refinements: {},
                },
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
            expect((await getInteraction(1)).events[2]).toMatchObject({
                eventType: 'searchEvent',
                interactionName: 'search',
                searchQuery: '',
                searchResultId: 'empty-query-search',
                numberOfResultsReturned: 2,
                resultsReturnedQuantity: 2,
            });
        });

        it('retains the category Page View for all-invalid results and sends nothing for all-invalid recommendations', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    path: '/category/shoes',
                    payload: guestUser,
                    category: { id: 'shoes' },
                    searchResults: [{ productId: '' }],
                    sort: '',
                    refinements: {},
                },
                undefined,
                defaultConsent
            );
            await adapter.sendEvent(
                {
                    eventType: 'view_recommender',
                    payload: guestUser,
                    recommenderId: 'reco',
                    recommenderName: 'Reco',
                    products: [{ productId: ' \t ' }],
                },
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
        });

        it('skips invalid search hits without renumbering valid siblings or changing search counts', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search?q=shoes',
                    payload: registeredUser,
                    searchResultId: 'search-result-id',
                    searchInputText: 'shoes',
                    searchResults: [
                        { productId: '' },
                        { productId: ' valid-id ', productName: 'Valid Product' },
                        { productName: 'Missing ID' } as ShopperSearch.schemas['ProductSearchHit'],
                        { productId: ' \t ' },
                        mockSearchHit,
                    ],
                    sort: '',
                    refinements: {},
                    offset: 12,
                    limit: 12,
                    total: 40,
                },
                undefined,
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect((await getInteraction(1)).events[2]).toMatchObject({
                numberOfResultsReturned: 5,
                resultsReturnedQuantity: 40,
            });
            const { events } = await getInteraction(2);
            expect(events).toHaveLength(4);
            expect(events[2]).toMatchObject({
                id: ' valid-id ',
                searchResultPosition: 14,
                searchResultPositionInPage: 2,
                searchResultTitle: 'Valid Product',
                searchResultId: 'search-result-id',
            });
            expect(events[3]).toMatchObject({ id: 'hit-product-id', searchResultPosition: 17 });
            expect(mockLoggerDebug.mock.calls).toEqual([
                ['Skipping Data 360 catalog item with an invalid identifier', { eventType: 'view_search' }],
                ['Skipping Data 360 catalog item with an invalid identifier', { eventType: 'view_search' }],
                ['Skipping Data 360 catalog item with an invalid identifier', { eventType: 'view_search' }],
            ]);
        });
    });

    describe('endpoint + envelope', () => {
        it('preserves complete envelopes, repeated items, and fresh identity/session/site values across sends', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            mockCookiesGet.mockReturnValue('first-sid');
            await adapter.sendEvent(
                {
                    eventType: 'view_recommender',
                    payload: registeredUser,
                    recommenderId: 'reco-1',
                    recommenderName: 'Recently Viewed',
                    products: [mockSearchHit, { productId: '' }, mockSearchHit],
                },
                { siteId: 'OtherSite', localeId: 'en-US' },
                defaultConsent
            );
            const base = {
                guestId: 'test-usid',
                customerId: 'test-customer-id',
                deviceId: 'test-customer-id',
                sessionId: 'first-sid',
                siteId: 'OtherSite',
                dateTime: expect.any(String),
                eventId: expect.any(String),
            };
            const catalog = {
                ...base,
                eventType: 'catalog',
                category: 'Engagement',
                id: 'hit-product-id',
                type: 'Product',
                webStoreId: 'sfnext',
                interactionName: 'catalog-object-impression',
                personalizationId: 'Recently Viewed',
                personalizationContentId: 'reco-1',
            };
            expect(await getInteraction()).toEqual({
                events: [
                    { ...base, eventType: 'identity', category: 'Profile', isAnonymous: '0' },
                    {
                        ...base,
                        eventType: 'partyIdentification',
                        category: 'Profile',
                        party: 'test-customer-id',
                        userId: 'test-customer-id',
                        IDName: 'CC_REGISTERED_CUSTOMER_ID',
                        IDType: 'CC_REGISTERED_CUSTOMER_ID',
                        partyIdentificationId: 'test-customer-id',
                        internalOrganizationId: 'OtherSite',
                    },
                    catalog,
                    catalog,
                ],
            });

            mockCookiesGet.mockReturnValue('second-sid');
            await adapter.sendEvent(
                { eventType: 'view_page', payload: guestUser, path: '/next' },
                undefined,
                defaultConsent
            );
            const guestBase = {
                guestId: 'test-usid',
                deviceId: 'test-usid',
                sessionId: 'second-sid',
                siteId: 'RefArch',
                dateTime: expect.any(String),
                eventId: expect.any(String),
            };
            expect(await getInteraction(1)).toEqual({
                events: [
                    { ...guestBase, eventType: 'identity', category: 'Profile', isAnonymous: '1', sourceUrl: '/next' },
                    {
                        ...guestBase,
                        eventType: 'partyIdentification',
                        category: 'Profile',
                        party: 'test-usid',
                        userId: 'test-usid',
                        IDName: 'CC_USID',
                        IDType: 'CC_USID',
                        partyIdentificationId: 'test-usid',
                        internalOrganizationId: 'RefArch',
                    },
                    {
                        ...guestBase,
                        eventType: 'userEngagement',
                        category: 'Engagement',
                        interactionName: 'page-view',
                        sourceUrl: '/next',
                    },
                ],
            });
        });

        it('POSTs to the tenant/appSourceId endpoint with a base64 event= body', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/home' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            expect(getRequestUrl()).toBe('https://test-tenant.c360a.salesforce.com/web/events/app-source-id/');
            const interaction = await getInteraction();
            expect(Array.isArray(interaction.events)).toBe(true);
            expect(() => validateInteraction(interaction)).not.toThrow();
        });
    });

    describe('view_page', () => {
        it('prepends identity + partyIdentification and adds a page-view userEngagement event', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/plp/shoes' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            const { events } = await getInteraction();
            expect(events).toHaveLength(3);

            const [identity, party, engagement] = events as Array<Record<string, any>>;
            expect(identity.eventType).toBe('identity');
            expect(identity.category).toBe('Profile');
            expect(identity.isAnonymous).toBe('0'); // registered
            expect(identity.sourceUrl).toBe('/plp/shoes');

            expect(party.eventType).toBe('partyIdentification');
            expect(party.category).toBe('Profile');

            expect(engagement.eventType).toBe('userEngagement');
            expect(engagement.category).toBe('Engagement');
            expect(engagement.interactionName).toBe('page-view');
            expect(engagement.sourceUrl).toBe('/plp/shoes');
        });

        it('sets isAnonymous "1" for guests', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: guestUser, path: '/home' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.isAnonymous).toBe('1');
        });

        it('registered with missing customerId → isAnonymous "1" (consistent with the CC_USID party fallback)', async () => {
            // Mirrors the party-block fallback: with no resolved customerId there is no
            // durable identity, so the identity event must not claim isAnonymous 0 while
            // the party block is keyed on the ephemeral usid.
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_page',
                    payload: { userType: 'registered' as const, usid: 'test-usid' },
                    path: '/home',
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.isAnonymous).toBe('1');
        });
    });

    describe('base event identity', () => {
        it('registered: guestId=usid, deviceId=customerId, customerId present', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.guestId).toBe('test-usid');
            expect(identity.deviceId).toBe('test-customer-id');
            expect(identity.customerId).toBe('test-customer-id');
            expect(identity.siteId).toBe('RefArch');
        });

        it('prefers the current site from siteInfo over config.siteId (multi-site)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                { siteId: 'OtherSite', localeId: 'en-US' },
                defaultConsent
            );
            const { events } = await getInteraction();
            const identity = events[0] as Record<string, any>;
            const party = events[1] as Record<string, any>;
            expect(identity.siteId).toBe('OtherSite');
            expect(party.internalOrganizationId).toBe('OtherSite');
        });

        it('falls back to config.siteId when siteInfo is absent', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.siteId).toBe('RefArch');
        });

        it('guest: deviceId falls back to usid, no customerId key', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: guestUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.guestId).toBe('test-usid');
            expect(identity.deviceId).toBe('test-usid');
            expect('customerId' in identity).toBe(false);
        });

        it('sessionId uses the sid cookie when present (PWA Kit parity)', async () => {
            mockCookiesGet.mockReturnValue('sid-from-cookie');
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.sessionId).toBe('sid-from-cookie');
            // sid is the session id only — device/guest ids are unaffected.
            expect(identity.deviceId).toBe('test-customer-id');
            expect(identity.guestId).toBe('test-usid');
        });

        it('sessionId falls back to usid when the sid cookie is absent', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.sessionId).toBe('test-usid');
        });

        it('guest with a gcid: does not leak it as customerId; deviceId stays usid', async () => {
            // Real guest sessions DO carry a customer id (the ephemeral gcid). The
            // Data 360 customerId field is meant for the durable registered id only,
            // so a guest gcid must not be emitted as customerId nor used as deviceId.
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_page',
                    payload: { userType: 'guest' as const, usid: 'test-usid', customerId: 'guest-gcid' },
                    path: '/x',
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.deviceId).toBe('test-usid');
            expect('customerId' in identity).toBe(false);
        });
    });

    describe('partyIdentification', () => {
        it('registered → CC_REGISTERED_CUSTOMER_ID with customerId, no email', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const party = (await getInteraction()).events[1] as Record<string, any>;
            expect(party.IDType).toBe('CC_REGISTERED_CUSTOMER_ID');
            expect(party.IDName).toBe('CC_REGISTERED_CUSTOMER_ID');
            expect(party.party).toBe('test-customer-id');
            expect(party.userId).toBe('test-customer-id');
            expect(party.partyIdentificationId).toBe('test-customer-id');
            expect(party.internalOrganizationId).toBe('RefArch');
            expect(party).not.toHaveProperty('creationEventId');
            expect('email' in party).toBe(false);
            expect('contactPointEmail' in party).toBe(false);
        });

        it('guest → CC_USID with usid', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: guestUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const party = (await getInteraction()).events[1] as Record<string, any>;
            expect(party.IDType).toBe('CC_USID');
            expect(party.IDName).toBe('CC_USID');
            expect(party.party).toBe('test-usid');
        });

        it('guest with a gcid → still CC_USID keyed on usid, not the gcid', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_page',
                    payload: { userType: 'guest' as const, usid: 'test-usid', customerId: 'guest-gcid' },
                    path: '/x',
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const party = (await getInteraction()).events[1] as Record<string, any>;
            expect(party.IDType).toBe('CC_USID');
            expect(party.party).toBe('test-usid');
            expect(party.party).not.toBe('guest-gcid');
        });

        it('registered with missing customerId → falls back to CC_USID (no blank registered id)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_page',
                    payload: { userType: 'registered' as const, usid: 'test-usid' },
                    path: '/x',
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const party = (await getInteraction()).events[1] as Record<string, any>;
            expect(party.IDType).toBe('CC_USID');
            expect(party.IDName).toBe('CC_USID');
            expect(party.party).toBe('test-usid');
            expect(party.userId).toBe('test-usid');
            expect(party.partyIdentificationId).toBe('test-usid');
            expect(party.party).not.toBe('');
            expect(party.IDType).not.toBe('CC_REGISTERED_CUSTOMER_ID');
        });

        it('never emits a contactPointEmail event', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const types = (await getInteraction()).events.map((e) => (e as Record<string, any>).eventType);
            expect(types).not.toContain('contactPointEmail');
        });
    });

    describe('view_product', () => {
        it('emits separate page-view and catalog-object-view-start interactions', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/global/en-GB/product/test-product-id?color=blue#details',
                    payload: registeredUser,
                    product: mockProduct,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(2);
            const pageViewEvents = (await getInteraction()).events as Array<Record<string, any>>;
            expect(pageViewEvents).toHaveLength(3);
            expect(pageViewEvents[0].eventType).toBe('identity');
            expect(pageViewEvents[1].eventType).toBe('partyIdentification');
            expect(pageViewEvents[2]).toMatchObject({
                interactionName: 'page-view',
                sourceUrl: '/global/en-GB/product/test-product-id?color=blue#details',
            });

            const catalogEvents = (await getInteraction(1)).events as Array<Record<string, any>>;
            expect(catalogEvents).toHaveLength(3);
            expect(catalogEvents[0].eventType).toBe('identity');
            expect(catalogEvents[1].eventType).toBe('partyIdentification');
            const domain = catalogEvents[2];
            expect(domain.eventType).toBe('catalog');
            expect(domain.interactionName).toBe('catalog-object-view-start');
            expect(domain.id).toBe('test-product-id');
            expect(domain.type).toBe('Product');
            expect(domain.webStoreId).toBe('sfnext');
        });

        it('defaults webStoreId to sfnext when config leaves it blank', async () => {
            const adapter = createData360Adapter({ ...mockConfig, webStoreId: '' }) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/product/test-product-id',
                    payload: guestUser,
                    product: mockProduct,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domain = (await getInteraction(1)).events[2] as Record<string, any>;
            expect(domain.webStoreId).toBe('sfnext');
        });
    });

    describe('view_category — per-hit fan-out', () => {
        it('derives one page view while tracking initial and load-more impressions', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            const baseEvent = {
                eventType: 'view_category',
                path: '/category/cat-123',
                payload: registeredUser,
                category: { id: 'cat-123' },
                sort: '',
                refinements: {},
            } as const;

            await adapter.sendEvent(
                { ...baseEvent, searchResults: [mockSearchHit], offset: 0, limit: 1 } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            await adapter.sendEvent(
                {
                    ...baseEvent,
                    isNavigation: false,
                    searchResults: [{ ...mockSearchHit, productId: 'hit-2' }],
                    offset: 1,
                    limit: 1,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
            expect((await getInteraction(1)).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
                id: 'hit-product-id',
            });
            expect((await getInteraction(2)).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
                id: 'hit-2',
            });
        });

        it('emits separate page-view and catalog-impression interactions', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    path: '/global/en-GB/category/cat-123?color=blue#grid',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [mockSearchHit, { ...mockSearchHit, productId: 'hit-2' }],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(2);
            const pageViewEvents = (await getInteraction()).events as Array<Record<string, any>>;
            expect(pageViewEvents).toHaveLength(3);
            expect(pageViewEvents[0].eventType).toBe('identity');
            expect(pageViewEvents[1].eventType).toBe('partyIdentification');
            expect(pageViewEvents[2]).toMatchObject({
                interactionName: 'page-view',
                sourceUrl: '/global/en-GB/category/cat-123?color=blue#grid',
            });

            const { events } = await getInteraction(1);
            // 2 standard + 2 hits
            expect(events).toHaveLength(4);
            const domains = events.slice(2) as Array<Record<string, any>>;
            for (const d of domains) {
                expect(d.eventType).toBe('catalog');
                expect(d.interactionName).toBe('catalog-object-impression');
                expect(d.categoryId).toBe('cat-123');
                expect(d.type).toBe('Product');
                expect(d.webStoreId).toBe('sfnext');
            }
            expect(domains[0].id).toBe('hit-product-id');
            expect(domains[1].id).toBe('hit-2');
            expect(domains[0]).not.toHaveProperty('searchResultTitle');
            expect(domains[0]).not.toHaveProperty('searchResultId');
        });

        it('emits global searchResultPosition/PageNumber from offset/limit (FU4)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    path: '/category/cat-123',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [mockSearchHit, { ...mockSearchHit, productId: 'hit-2' }],
                    sort: '',
                    refinements: {},
                    offset: 24,
                    limit: 12,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(2);
            const domains = (await getInteraction(1)).events.slice(2) as Array<Record<string, any>>;
            // positions are one-based; page = floor(offset/limit)+1
            expect(domains[0].searchResultPosition).toBe(25);
            expect(domains[1].searchResultPosition).toBe(26);
            expect(domains[0].searchResultPositionInPage).toBe(1);
            expect(domains[1].searchResultPositionInPage).toBe(2);
            expect(domains[0].searchResultPageNumber).toBe(3);
            expect(domains[1].searchResultPageNumber).toBe(3);
        });

        it('falls back to page-local position/page when paging is absent (no regression)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    path: '/category/cat-123',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [mockSearchHit, { ...mockSearchHit, productId: 'hit-2' }],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domains = (await getInteraction(1)).events.slice(2) as Array<Record<string, any>>;
            expect(domains[0].searchResultPosition).toBe(1);
            expect(domains[1].searchResultPosition).toBe(2);
            expect(domains[0].searchResultPositionInPage).toBe(1);
            expect(domains[1].searchResultPositionInPage).toBe(2);
            expect(domains[0].searchResultPageNumber).toBe(1);
        });

        it('emits only the page-view interaction when the category is empty', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    path: '/category/cat-123',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const { events } = await getInteraction();
            expect(events).toHaveLength(3);
            expect(events[2]).toMatchObject({
                interactionName: 'page-view',
                sourceUrl: '/category/cat-123',
            });
        });

        it('does not derive a page view when shared page tracking handles the path', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    path: '/sale',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect((await getInteraction()).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
            });
        });
    });

    describe('view_search — per-hit fan-out', () => {
        it('emits separate correlated page-view, search, and impression interactions', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/global/en-GB/search?q=shoes#results',
                    payload: registeredUser,
                    searchResultId: 'search-result-id',
                    startsSearchExecution: true,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                    total: 1,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(3);
            const pageViewEvents = (await getInteraction()).events;
            const searchEvents = (await getInteraction(1)).events;
            const impressionEvents = (await getInteraction(2)).events;
            for (const events of [pageViewEvents, searchEvents, impressionEvents]) {
                expect(events[0]).toMatchObject({ eventType: 'identity' });
                expect(events[1]).toMatchObject({ eventType: 'partyIdentification' });
                expect(events).toHaveLength(3);
            }
            expect(pageViewEvents[2]).toMatchObject({
                interactionName: 'page-view',
                sourceUrl: '/global/en-GB/search?q=shoes#results',
            });
            expect(searchEvents[2]).toMatchObject({
                eventType: 'searchEvent',
                interactionName: 'search',
                searchQuery: 'shoes',
                searchResultId: 'search-result-id',
                numberOfResultsReturned: 1,
                resultsReturnedQuantity: 1,
                eventStatus: 'success',
            });
            expect(impressionEvents[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
                searchResultId: 'search-result-id',
            });
        });

        it('does not derive a page view when shared page tracking handles the search path', async () => {
            const adapter = createData360Adapter({
                ...mockConfig,
                pageViewsBlocklist: ['/product', '/category'],
            }) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/global/en-GB/search?q=shoes',
                    payload: registeredUser,
                    searchResultId: 'search-result-id',
                    startsSearchExecution: true,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                    total: 1,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect((await getInteraction()).events[2]).toMatchObject({
                eventType: 'searchEvent',
                interactionName: 'search',
            });
            expect((await getInteraction(1)).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
            });
        });

        it('omits the search interaction for pagination while preserving page-view and correlated impressions', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/global/en-GB/search?q=shoes&offset=12',
                    payload: registeredUser,
                    searchResultId: 'search-result-id',
                    startsSearchExecution: false,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                    offset: 12,
                    limit: 12,
                    total: 20,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
            expect((await getInteraction(1)).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
                searchResultId: 'search-result-id',
            });
        });

        it('emits page-view and successful search interactions for zero results', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/global/en-GB/search?q=missing',
                    payload: registeredUser,
                    searchResultId: 'empty-search-result-id',
                    startsSearchExecution: true,
                    searchInputText: 'missing',
                    searchResults: [],
                    sort: '',
                    refinements: {},
                    total: 0,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
            expect((await getInteraction(1)).events[2]).toMatchObject({
                interactionName: 'search',
                searchResultId: 'empty-search-result-id',
                eventType: 'searchEvent',
                numberOfResultsReturned: 0,
                resultsReturnedQuantity: 0,
                eventStatus: 'success',
            });
        });

        it('uses the page-view toggle independently from search interactions', async () => {
            const adapter = createData360Adapter({
                ...mockConfig,
                eventToggles: { ...mockConfig.eventToggles, view_page: false },
            }) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/global/en-GB/search?q=shoes',
                    payload: registeredUser,
                    searchResultId: 'search-result-id',
                    startsSearchExecution: true,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                    total: 1,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect((await getInteraction()).events[2]).toMatchObject({
                eventType: 'searchEvent',
                interactionName: 'search',
            });
            expect((await getInteraction(1)).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
            });
        });

        it('attempts every search interaction when an earlier HTTP response fails', async () => {
            mockFetch.mockResolvedValueOnce(new Response('private shopper/session payload', { status: 503 }));
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            const result = await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/global/en-GB/search?q=shoes',
                    payload: registeredUser,
                    searchResultId: 'search-result-id',
                    startsSearchExecution: true,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                    total: 1,
                } as AnalyticsEvent,
                { siteId: 'RefArch', localeId: 'en-GB' },
                defaultConsent
            );

            expect(result).toEqual({ success: false });
            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect((await getInteraction(1)).events[2]).toMatchObject({
                eventType: 'searchEvent',
                interactionName: 'search',
            });
            expect((await getInteraction(2)).events[2]).toMatchObject({
                interactionName: 'catalog-object-impression',
            });
            expect(mockLoggerDebug.mock.calls).toEqual([
                ['Failed to deliver the Data 360 payload (dropped)', { eventType: 'view_page' }],
            ]);
        });

        it('serializes the guest search impression contract', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search?q=shoes&offset=24',
                    searchResultId: 'search-result-id',
                    startsSearchExecution: false,
                    payload: { ...guestUser, customerId: 'guest-gcid' },
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                    offset: 24,
                    limit: 12,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            const [identity, party, impression] = (await getInteraction(1)).events as Array<Record<string, any>>;
            expect(identity).toMatchObject({ isAnonymous: '1', guestId: 'test-usid' });
            expect(identity).not.toHaveProperty('customerId');
            expect(party).not.toHaveProperty('creationEventId');
            expect(impression).toMatchObject({
                searchResultTitle: 'Hit Product',
                searchResultPosition: 25,
                searchResultPositionInPage: 1,
                searchResultPageNumber: 3,
            });
        });

        it('emits one catalog-object-impression per hit with a searchResultId and no categoryId', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search?q=shoes',
                    searchResultId: 'search-result-id',
                    startsSearchExecution: false,
                    payload: registeredUser,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domain = (await getInteraction(1)).events[2] as Record<string, any>;
            expect(domain.interactionName).toBe('catalog-object-impression');
            expect(domain.searchResultId).toBe('search-result-id');
            expect('categoryId' in domain).toBe(false);
            expect(domain.id).toBe('hit-product-id');
            expect(domain.searchResultTitle).toBe('Hit Product');
        });

        it('emits global searchResultPosition/PageNumber from offset/limit (FU4)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search?q=shoes&offset=24',
                    searchResultId: 'search-result-id',
                    startsSearchExecution: false,
                    payload: registeredUser,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit, { ...mockSearchHit, productId: 'hit-2' }],
                    sort: '',
                    refinements: {},
                    offset: 24,
                    limit: 12,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domains = (await getInteraction(1)).events.slice(2) as Array<Record<string, any>>;
            expect(domains[0].searchResultPosition).toBe(25);
            expect(domains[1].searchResultPosition).toBe(26);
            expect(domains[0].searchResultPositionInPage).toBe(1);
            expect(domains[1].searchResultPositionInPage).toBe(2);
            expect(domains[0].searchResultPageNumber).toBe(3);
        });

        it('encodes a non-Latin1 search query without throwing (UTF-8 safe base64)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search?q=t%C3%A9nis',
                    searchResultId: 'search-result-id',
                    startsSearchExecution: false,
                    payload: registeredUser,
                    searchInputText: 'ténis corações 👟',
                    searchResults: [{ ...mockSearchHit, productName: 'Ténis corações 👟' }],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(2);
            const domain = (await getInteraction(1)).events[2] as Record<string, any>;
            expect(domain.searchResultTitle).toBe('Ténis corações 👟');
        });

        it('omits searchResultTitle when the product result has no title', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    path: '/search?q=shoes',
                    searchResultId: 'search-result-id',
                    startsSearchExecution: false,
                    payload: registeredUser,
                    searchInputText: 'shoes',
                    searchResults: [{ productId: 'hit-without-title' }],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            const domain = (await getInteraction(1)).events[2] as Record<string, any>;
            expect(domain).not.toHaveProperty('searchResultTitle');
        });
    });

    describe('view_recommender — per-product fan-out', () => {
        it('emits only catalog-object-impression with personalization ids', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_recommender',
                    payload: registeredUser,
                    recommenderId: 'reco-1',
                    recommenderName: 'Recently Viewed',
                    products: [mockSearchHit],
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const domain = (await getInteraction()).events[2] as Record<string, any>;
            expect(domain.interactionName).toBe('catalog-object-impression');
            expect(domain.personalizationId).toBe('Recently Viewed');
            expect(domain.personalizationContentId).toBe('reco-1');
        });
    });

    describe('gating', () => {
        it('sends nothing when consent is denied', async () => {
            const adapter = createData360Adapter({ ...mockConfig, consentCategory: 'analytics' }) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/x' } as AnalyticsEvent,
                undefined,
                ['necessary']
            );
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('sends nothing when the event toggle is off', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'cart_item_add', payload: registeredUser, cartItems: [] } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('sends nothing (does not throw) for an event type with no DC mapping', async () => {
            const adapter = createData360Adapter({
                ...mockConfig,
                eventToggles: { ...mockConfig.eventToggles, wishlist_viewed: true },
            }) as Data360Adapter;
            await expect(
                adapter.sendEvent(
                    { eventType: 'wishlist_viewed', payload: registeredUser } as AnalyticsEvent,
                    undefined,
                    defaultConsent
                )
            ).resolves.toBeDefined();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('uses the view_page toggle independently from the specialized interaction toggle', async () => {
            const pageViewDisabled = createData360Adapter({
                ...mockConfig,
                eventToggles: { ...mockConfig.eventToggles, view_page: false },
            }) as Data360Adapter;
            await pageViewDisabled.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/product/test-product-id',
                    payload: registeredUser,
                    product: mockProduct,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'catalog-object-view-start' });

            mockFetch.mockClear();
            const productViewDisabled = createData360Adapter({
                ...mockConfig,
                eventToggles: { ...mockConfig.eventToggles, view_product: false },
            }) as Data360Adapter;
            await productViewDisabled.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/product/test-product-id',
                    payload: registeredUser,
                    product: mockProduct,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
        });
    });

    describe('configuration validation', () => {
        it('throws when appSourceId is missing', () => {
            expect(() => createData360Adapter({ ...mockConfig, appSourceId: '' })).toThrow(
                /Data 360 adapter configuration is invalid:.*Missing required field: appSourceId/
            );
        });

        it('throws when tenantId is missing', () => {
            expect(() => createData360Adapter({ ...mockConfig, tenantId: '' })).toThrow(
                /Missing required field: tenantId/
            );
        });

        it('throws when siteId is missing', () => {
            expect(() => createData360Adapter({ ...mockConfig, siteId: '' })).toThrow(/Missing required field: siteId/);
        });

        it('accepts a valid configuration', () => {
            expect(() => createData360Adapter(mockConfig)).not.toThrow();
        });
    });

    describe('delivery failure', () => {
        it.each([
            'builder',
            'validation',
        ] as const)('contains a %s failure without suppressing sibling deliveries', async (failureMode) => {
            const build = vi.spyOn(SearchBuilder.prototype, 'build');
            if (failureMode === 'builder') {
                build.mockImplementationOnce(() => {
                    throw new Error('private shopper/session payload');
                });
            } else {
                build.mockReturnValueOnce({ events: [] });
            }
            try {
                const adapter = createData360Adapter(mockConfig) as Data360Adapter;
                await expect(
                    adapter.sendEvent(
                        {
                            eventType: 'view_search',
                            path: '/search?q=shoes',
                            payload: registeredUser,
                            searchInputText: 'shoes',
                            searchResults: [mockSearchHit],
                            sort: '',
                            refinements: {},
                        },
                        undefined,
                        defaultConsent
                    )
                ).resolves.toEqual({ success: false });
                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
                expect((await getInteraction(1)).events[2]).toMatchObject({
                    interactionName: 'catalog-object-impression',
                });
                expect(mockLoggerDebug.mock.calls).toEqual([
                    ['Failed to deliver the Data 360 payload (dropped)', { eventType: 'view_search' }],
                ]);
            } finally {
                build.mockRestore();
            }
        });

        describe.each(['throw', 'reject', 'http'] as const)('%s transport failure', (failureMode) => {
            it.each([
                0, 1, 2,
            ])('attempts sibling envelopes when request %i fails, with sanitized diagnostics', async (failureIndex) => {
                for (let index = 0; index < failureIndex; index++) {
                    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
                }
                const error = new TypeError('keepalive quota exceeded: private shopper/session payload');
                if (failureMode === 'throw') {
                    mockFetch.mockImplementationOnce(() => {
                        throw error;
                    });
                } else if (failureMode === 'reject') {
                    mockFetch.mockRejectedValueOnce(error);
                } else {
                    mockFetch.mockResolvedValueOnce(new Response('private shopper/session payload', { status: 503 }));
                }
                const adapter = createData360Adapter(mockConfig) as Data360Adapter;
                await expect(
                    adapter.sendEvent(
                        {
                            eventType: 'view_search',
                            path: '/search?q=shoes',
                            payload: registeredUser,
                            searchInputText: 'shoes',
                            searchResults: [mockSearchHit],
                            sort: '',
                            refinements: {},
                        },
                        undefined,
                        defaultConsent
                    )
                ).resolves.toEqual({ success: false });
                expect(mockFetch).toHaveBeenCalledTimes(3);
                expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
                expect((await getInteraction(1)).events[2]).toMatchObject({
                    eventType: 'searchEvent',
                    interactionName: 'search',
                });
                expect((await getInteraction(2)).events[2]).toMatchObject({
                    interactionName: 'catalog-object-impression',
                });
                expect(mockLoggerDebug.mock.calls).toEqual([
                    [
                        'Failed to deliver the Data 360 payload (dropped)',
                        { eventType: failureIndex === 0 ? 'view_page' : 'view_search' },
                    ],
                ]);
            });
        });

        it('logs only eventType when the HTTP response fails', async () => {
            mockFetch.mockResolvedValueOnce(new Response('private shopper/session payload', { status: 503 }));
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;

            const result = await adapter.sendEvent(
                { eventType: 'view_page', path: '/big-plp', payload: guestUser },
                undefined,
                ['analytics']
            );

            expect(result).toEqual({ success: false });
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockLoggerDebug.mock.calls).toEqual([
                ['Failed to deliver the Data 360 payload (dropped)', { eventType: 'view_page' }],
            ]);
        });

        it('reports HTTP completion, not ingestion, without logging when the response is 204', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;

            await expect(
                adapter.sendEvent({ eventType: 'view_page', path: '/', payload: guestUser }, undefined, ['analytics'])
            ).resolves.toEqual({ success: true });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockLoggerDebug).not.toHaveBeenCalled();
        });

        it('attempts the catalog interaction when the derived page-view request is rejected', async () => {
            mockFetch.mockRejectedValueOnce(new TypeError('keepalive quota exceeded: private shopper/session payload'));
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;

            const result = await adapter.sendEvent(
                {
                    eventType: 'view_product',
                    path: '/product/test-product-id',
                    payload: registeredUser,
                    product: mockProduct,
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            expect(result).toEqual({ success: false });
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockLoggerDebug.mock.calls).toEqual([
                ['Failed to deliver the Data 360 payload (dropped)', { eventType: 'view_page' }],
            ]);
            expect((await getInteraction(1)).events[2]).toMatchObject({ interactionName: 'catalog-object-view-start' });
        });

        it('starts all three requests before the first response resolves and waits for HTTP completion', async () => {
            let resolve: (response: Response) => void = () => {
                throw new Error('Response resolver not initialized');
            };
            const promise = new Promise<Response>((complete) => {
                resolve = complete;
            });
            mockFetch.mockReturnValueOnce(promise);
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            let completed = false;
            const delivery = adapter
                .sendEvent(
                    {
                        eventType: 'view_search',
                        path: '/search?q=shoes',
                        payload: registeredUser,
                        searchInputText: 'shoes',
                        searchResults: [mockSearchHit],
                        sort: '',
                        refinements: {},
                    },
                    undefined,
                    defaultConsent
                )
                .then((result) => {
                    completed = true;
                    return result;
                });

            try {
                await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
                expect(completed).toBe(false);
                expect((await getInteraction()).events[2]).toMatchObject({ interactionName: 'page-view' });
                expect((await getInteraction(1)).events[2]).toMatchObject({
                    eventType: 'searchEvent',
                    interactionName: 'search',
                });
                expect((await getInteraction(2)).events[2]).toMatchObject({
                    interactionName: 'catalog-object-impression',
                });
            } finally {
                resolve(new Response(null, { status: 204 }));
                await delivery;
            }
            await expect(delivery).resolves.toEqual({ success: true });
            expect(mockLoggerDebug).not.toHaveBeenCalled();
        });
    });
});
