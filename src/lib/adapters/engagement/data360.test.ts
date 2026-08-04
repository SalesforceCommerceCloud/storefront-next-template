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
 * base64 `event=` form body, sendBeacon delivery.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createData360Adapter } from './data360';
import type { Data360Config, Data360Interaction } from './data360-config';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import type { AnalyticsEvent, ConsentPreferences } from '@salesforce/storefront-next-runtime/events';
import type { EngagementAdapter } from '@/lib/adapters';

// Capture the adapter's logger so we can assert on the sendBeacon-failure debug log.
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

// Mock navigator.sendBeacon
const mockSendBeacon = vi.fn(() => true);
Object.defineProperty(navigator, 'sendBeacon', {
    value: mockSendBeacon,
    writable: true,
});

// Deterministic UUIDs so payload snapshots are stable
let uuidCounter = 0;
Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: vi.fn(() => `uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`),
    writable: true,
});

// Decode the base64 form body of the Nth sendBeacon call into the interaction.
// Body is `event=<base64(JSON)>`; read the Blob text, strip the prefix, decode.
const readBlob = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(blob);
    });

const getInteraction = async (callIndex = 0): Promise<Data360Interaction> => {
    const call = mockSendBeacon.mock.calls[callIndex] as unknown as [string, Blob];
    const body = await readBlob(call[1]);
    const base64 = body.replace(/^event=/, '');
    // Mirror the adapter's UTF-8-safe encode: atob → bytes → TextDecoder.
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Data360Interaction;
};

const getBeaconUrl = (callIndex = 0): string => {
    const call = mockSendBeacon.mock.calls[callIndex] as unknown as [string, Blob];
    return call[0];
};

const mockConfig: Data360Config = {
    enabled: true,
    appSourceId: 'app-source-id',
    tenantId: 'test-tenant',
    siteId: 'RefArch',
    webStoreId: 'sfnext',
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
    uuidCounter = 0;
    mockCookiesGet.mockReturnValue(undefined);
});

describe('Data 360 Adapter', () => {
    describe('endpoint + envelope', () => {
        it('POSTs to the tenant/appSourceId endpoint with a base64 event= body', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: registeredUser, path: '/home' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );

            expect(getBeaconUrl()).toBe('https://test-tenant.c360a.salesforce.com/web/events/app-source-id/');
            const interaction = await getInteraction();
            expect(Array.isArray(interaction.events)).toBe(true);
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
            expect(identity.isAnonymous).toBe(0); // registered
            expect(identity.sourceUrl).toBe('/plp/shoes');

            expect(party.eventType).toBe('partyIdentification');
            expect(party.category).toBe('Profile');

            expect(engagement.eventType).toBe('userEngagement');
            expect(engagement.category).toBe('Engagement');
            expect(engagement.interactionName).toBe('page-view');
            expect(engagement.sourceUrl).toBe('/plp/shoes');
        });

        it('sets isAnonymous 1 for guests', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_page', payload: guestUser, path: '/home' } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const identity = (await getInteraction()).events[0] as Record<string, any>;
            expect(identity.isAnonymous).toBe(1);
        });

        it('registered with missing customerId → isAnonymous 1 (consistent with the CC_USID party fallback)', async () => {
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
            expect(identity.isAnonymous).toBe(1);
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
        it('emits a catalog-object-view-start with webStoreId from config', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_product', payload: registeredUser, product: mockProduct } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domain = (await getInteraction()).events[2] as Record<string, any>;
            expect(domain.eventType).toBe('catalog');
            expect(domain.interactionName).toBe('catalog-object-view-start');
            expect(domain.id).toBe('test-product-id');
            expect(domain.type).toBe('Product');
            expect(domain.webStoreId).toBe('sfnext');
        });

        it('defaults webStoreId to sfnext when config leaves it blank', async () => {
            const adapter = createData360Adapter({ ...mockConfig, webStoreId: '' }) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'view_product', payload: guestUser, product: mockProduct } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domain = (await getInteraction()).events[2] as Record<string, any>;
            expect(domain.webStoreId).toBe('sfnext');
        });
    });

    describe('view_category — per-hit fan-out', () => {
        it('emits one catalog-object-impression per search hit with categoryId + search metadata', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [mockSearchHit, { ...mockSearchHit, productId: 'hit-2' }],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const { events } = await getInteraction();
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
            // Category browse carries no query — searchResultTitle is '' (PWA Kit parity).
            expect(domains[0].searchResultTitle).toBe('');
        });

        it('emits global searchResultPosition/PageNumber from offset/limit (FU4)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
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
            const domains = (await getInteraction()).events.slice(2) as Array<Record<string, any>>;
            // position = offset + index (global), page = floor(offset/limit)+1
            expect(domains[0].searchResultPosition).toBe(24);
            expect(domains[1].searchResultPosition).toBe(25);
            expect(domains[0].searchResultPageNumber).toBe(3);
            expect(domains[1].searchResultPageNumber).toBe(3);
        });

        it('falls back to page-local position/page when paging is absent (no regression)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [mockSearchHit, { ...mockSearchHit, productId: 'hit-2' }],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domains = (await getInteraction()).events.slice(2) as Array<Record<string, any>>;
            expect(domains[0].searchResultPosition).toBe(0);
            expect(domains[1].searchResultPosition).toBe(1);
            expect(domains[0].searchResultPageNumber).toBe(1);
        });

        it('sends nothing when the search result list is empty (no identity-only beacon)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_category',
                    payload: registeredUser,
                    category: { id: 'cat-123' },
                    searchResults: [],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockSendBeacon).not.toHaveBeenCalled();
        });
    });

    describe('view_search — per-hit fan-out', () => {
        it('emits one catalog-object-impression per hit with a searchResultId and no categoryId', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    payload: registeredUser,
                    searchInputText: 'shoes',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            const domain = (await getInteraction()).events[2] as Record<string, any>;
            expect(domain.interactionName).toBe('catalog-object-impression');
            expect(domain.searchResultId).toBeTruthy();
            expect('categoryId' in domain).toBe(false);
            expect(domain.id).toBe('hit-product-id');
            // searchResultTitle carries the query, not the product name (PWA Kit parity).
            expect(domain.searchResultTitle).toBe('shoes');
        });

        it('emits global searchResultPosition/PageNumber from offset/limit (FU4)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
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
            const domains = (await getInteraction()).events.slice(2) as Array<Record<string, any>>;
            expect(domains[0].searchResultPosition).toBe(24);
            expect(domains[1].searchResultPosition).toBe(25);
            expect(domains[0].searchResultPageNumber).toBe(3);
        });

        it('encodes a non-Latin1 search query without throwing (UTF-8 safe base64)', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                {
                    eventType: 'view_search',
                    payload: registeredUser,
                    searchInputText: 'ténis corações 👟',
                    searchResults: [mockSearchHit],
                    sort: '',
                    refinements: {},
                } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockSendBeacon).toHaveBeenCalledTimes(1);
            const domain = (await getInteraction()).events[2] as Record<string, any>;
            expect(domain.searchResultTitle).toBe('ténis corações 👟');
        });
    });

    describe('view_recommender — per-product fan-out', () => {
        it('emits catalog-object-impression with personalization ids', async () => {
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
            expect(mockSendBeacon).not.toHaveBeenCalled();
        });

        it('sends nothing when the event toggle is off', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;
            await adapter.sendEvent(
                { eventType: 'cart_item_add', payload: registeredUser, cartItems: [] } as AnalyticsEvent,
                undefined,
                defaultConsent
            );
            expect(mockSendBeacon).not.toHaveBeenCalled();
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
            expect(mockSendBeacon).not.toHaveBeenCalled();
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
        it('logs a debug message when sendBeacon drops the payload (returns false)', async () => {
            mockSendBeacon.mockReturnValueOnce(false);
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;

            const result = await adapter.sendEvent(
                { eventType: 'view_page', path: '/big-plp', payload: guestUser },
                undefined,
                ['analytics']
            );

            expect(result).toEqual({ success: false });
            expect(mockLoggerDebug).toHaveBeenCalledTimes(1);
        });

        it('does not log when sendBeacon succeeds', async () => {
            const adapter = createData360Adapter(mockConfig) as Data360Adapter;

            await adapter.sendEvent({ eventType: 'view_page', path: '/', payload: guestUser }, undefined, [
                'analytics',
            ]);

            expect(mockLoggerDebug).not.toHaveBeenCalled();
        });
    });
});
