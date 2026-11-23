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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { loader } from './resource.stores';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { createApiClients } from '@/lib/api-clients.server';
import { searchStoresByCity } from '@/extensions/store-locator/lib/store-entry-services.server';
import type { StoreEntryConfig } from '@/extensions/store-locator/lib/store-entry';

vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<object>()),
    getConfig: vi.fn(),
}));
// Explicit double: this is not evidence for the pending city integration.
vi.mock('@/extensions/store-locator/lib/store-entry-services.server', () => ({
    searchStoresByCity: vi.fn(),
}));
const search = vi.fn();
let entry: StoreEntryConfig;
const stores = [
    {
        id: 'A',
        inventoryId: 'inventory-a',
        name: 'A very long store name',
        storeHours: 'Closed',
        storeLocatorEnabled: false,
    },
    { id: 'B', storeHours: 'Open 24 hours', storeLocatorEnabled: true },
];
const run = (query: string) =>
    loader({
        request: new Request(`https://shop.example/resource/stores?${query}`),
        context: new RouterContextProvider(),
        params: {},
    } as unknown as Parameters<typeof loader>[0]);
const postal = 'mode=input&countryCode=GB&postalCode=SW1A%201AA&fulfillmentMode=pickup';

beforeEach(() => {
    vi.resetAllMocks();
    entry = { enabled: true, policy: 'soft', fulfillmentModes: ['pickup', 'delivery'] };
    vi.mocked(getConfig).mockImplementation(() => ({
        ...mockConfig,
        features: { ...mockConfig.features, storeEntry: entry },
    }));
    vi.mocked(createApiClients).mockReturnValue({ shopperStores: { searchStores: search } } as unknown as ReturnType<
        typeof createApiClients
    >);
    search.mockResolvedValue({ data: { data: stores, limit: 200, total: stores.length } });
});

describe('fulfillment-aware existing store search', () => {
    it('uses locator results with inventory mappings without requiring service metadata', async () => {
        const result = await run(postal);
        expect(result.data.success).toBe(true);
        expect(result.data.eligibility?.A.eligible).toBe(true);
        expect(result.data.eligibility?.B.eligible).toBe(false);
        expect(result.data.stores?.data).toEqual(stores);
    });
    it('allows another discovered store with inventory without a per-mode custom-field contract', async () => {
        search.mockResolvedValue({ data: { data: [{ ...stores[1], inventoryId: 'inventory-b' }] } });
        const result = await run(postal);
        expect(result.data.eligibility?.B.eligible).toBe(true);
    });
    it('preserves UK postcodes and delegates an enabled French city search to the merchant provider', async () => {
        await run(postal);
        expect(search).toHaveBeenLastCalledWith({
            params: { query: expect.objectContaining({ countryCode: 'GB', postalCode: 'SW1A 1AA' }) },
        });
        search.mockClear();
        entry.citySearchEnabled = true;
        vi.mocked(searchStoresByCity).mockResolvedValue({ data: stores, total: stores.length, limit: 200 });
        const result = await run('mode=input&countryCode=FR&city=Paris&fulfillmentMode=pickup');
        expect(result.data.success).toBe(true);
        expect(searchStoresByCity).toHaveBeenCalledWith(expect.anything(), {
            countryCode: 'FR',
            city: 'Paris',
            maxDistance: 100,
            distanceUnit: 'km',
            limit: 200,
        });
        expect(result.data.stores?.data).toEqual(stores);
        expect(result.data.eligibility?.A.eligible).toBe(true);
        expect(search).not.toHaveBeenCalled();
    });
    it.each([
        false,
        true,
    ])('rejects city search when its capability is disabled (entry enabled: %s)', async (enabled) => {
        entry.enabled = enabled;
        const result = await run('mode=input&countryCode=FR&city=Paris&fulfillmentMode=pickup');
        expect(result.init?.status).toBe(400);
        expect(result.data).toMatchObject({ success: false, error: 'CITY_SEARCH_DISABLED' });
        expect(searchStoresByCity).not.toHaveBeenCalled();
        expect(search).not.toHaveBeenCalled();
    });
    it('returns an explicit not-configured error if city search is enabled without implementing the stub', async () => {
        entry.citySearchEnabled = true;
        const actual = await vi.importActual<typeof import('../lib/store-entry-services.server')>(
            '../lib/store-entry-services.server'
        );
        vi.mocked(searchStoresByCity).mockImplementation(actual.searchStoresByCity);
        const result = await run('mode=input&countryCode=FR&city=Paris&fulfillmentMode=pickup');
        expect(result.init?.status).toBe(503);
        expect(result.data).toMatchObject({ success: false, error: 'CITY_LOOKUP_NOT_CONFIGURED' });
        expect(search).not.toHaveBeenCalled();
    });
    it('distinguishes a city provider no-match from provider failure', async () => {
        entry.citySearchEnabled = true;
        vi.mocked(searchStoresByCity).mockResolvedValue({ data: [], total: 0, limit: 200 });
        const empty = await run('mode=input&countryCode=FR&city=Paris&fulfillmentMode=pickup');
        expect(empty.init?.status).toBe(200);
        expect(empty.data).toMatchObject({ success: true, stores: { data: [], total: 0 } });
        vi.mocked(searchStoresByCity).mockRejectedValue(new Error('private provider details'));
        const failed = await run('mode=input&countryCode=FR&city=Paris&fulfillmentMode=pickup');
        expect(failed.init?.status).toBe(503);
        expect(failed.data).toMatchObject({ success: false, error: 'STORE_SEARCH_UNAVAILABLE' });
        expect(failed.data.stores).toBeUndefined();
        expect(search).not.toHaveBeenCalled();
    });
    it.each([
        { limit: 200, total: 0 },
        { data: Array.from({ length: 201 }, () => stores[0]), limit: 200, total: 201 },
    ])('rejects malformed or oversized city provider results', async (result) => {
        entry.citySearchEnabled = true;
        vi.mocked(searchStoresByCity).mockResolvedValue(result);
        const response = await run('mode=input&countryCode=FR&city=Paris&fulfillmentMode=pickup');
        expect(response.init?.status).toBe(503);
        expect(response.data).toMatchObject({ success: false, error: 'CITY_LOOKUP_UNAVAILABLE' });
    });
    it('supports coordinates including zero without requiring a map', async () => {
        await run('mode=device&latitude=0&longitude=0&fulfillmentMode=pickup');
        expect(search).toHaveBeenCalledWith({
            params: { query: expect.objectContaining({ latitude: 0, longitude: 0 }) },
        });
    });
    it.each([
        'mode=device&latitude=91&longitude=0',
        'mode=input&countryCode=FR&postalCode=%20',
        'mode=input&countryCode=FR&city=Paris&postalCode=75001',
        'mode=other&countryCode=FR&postalCode=75001',
        'mode=input&countryCode=FR&postalCode=75001&fulfillmentMode=drone',
        'mode=device&latitude=0&longitude=0&city=Paris',
    ])('rejects invalid search: %s', async (query) => {
        const result = await run(query);
        expect(result.init?.status).toBe(400);
        expect(search).not.toHaveBeenCalled();
    });
    it('skips an unavailable configured mode', async () => {
        entry.fulfillmentModes = ['pickup'];
        expect((await run(postal.replace('pickup', 'delivery'))).init?.status).toBe(400);
    });
    it('discovers stores for ordinary delivery without address-coverage metadata', async () => {
        const result = await run(postal.replace('pickup', 'delivery'));
        expect(result.data.success).toBe(true);
        expect(result.data.fulfillmentMode).toBe('delivery');
        expect(result.data.eligibility?.A.eligible).toBe(true);
        expect(result.data.eligibility?.B.eligible).toBe(false);
        expect(result.data.stores?.data).toEqual(stores);
        expect(searchStoresByCity).not.toHaveBeenCalled();
    });
    it.each(['pickup', 'delivery'])('distinguishes empty %s discovery from provider failure', async (mode) => {
        search.mockResolvedValue({ data: { data: [], total: 0 } });
        const result = await run(postal.replace('pickup', mode));
        expect(result.init?.status).toBe(200);
        expect(result.data).toMatchObject({ success: true, stores: { data: [], total: 0 } });
    });
    it.each(['pickup', 'delivery'])('never turns failed %s discovery into no results', async (mode) => {
        search.mockRejectedValue(new Error('provider unavailable'));
        const result = await run(postal.replace('pickup', mode));
        expect(result.init?.status).toBe(503);
        expect(result.data).toMatchObject({ success: false, error: 'STORE_SEARCH_UNAVAILABLE' });
    });
    it('keeps legacy postcode discovery working without a fulfillment mode when entry is disabled', async () => {
        entry.enabled = false;
        expect((await run('countryCode=GB&postalCode=SW1A%201AA')).data.success).toBe(true);
        expect(searchStoresByCity).not.toHaveBeenCalled();
    });
});
