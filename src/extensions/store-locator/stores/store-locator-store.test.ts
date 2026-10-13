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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createStoreLocatorStore,
    type StoreLocatorConfig,
    type SelectedStoreInfo,
    type FormSearchParams,
    type GeoCoordinates,
} from './store-locator-store';

describe('createStoreLocatorStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('creates store with default state', () => {
            const store = createStoreLocatorStore();
            const state = store.getState();

            expect(state.isOpen).toBe(false);
            expect(state.mode).toBe('input');
            expect(state.shouldSearch).toBe(false);
            expect(state.searchParams).toBeNull();
            expect(state.deviceCoordinates).toEqual({ latitude: null, longitude: null });
            expect(state.geoError).toBe(false);
            expect(state.selectedStoreInfo).toBeNull();
            expect(state.pickupContext).toBeNull();
            expect(state.config).toEqual({
                supportedCountries: [
                    { countryCode: 'US', countryName: 'United States' },
                    { countryCode: 'GB', countryName: 'United Kingdom' },
                ],
                radius: 100,
                radiusUnit: 'km',
                limit: 200,
                geoTimeout: 10000,
            });
        });

        it('creates store with initial state overrides', () => {
            const initState = {
                isOpen: true,
                mode: 'device' as const,
                selectedStoreInfo: { id: 'store1', name: 'Test Store', inventoryId: 'inv1' },
            };

            const store = createStoreLocatorStore(initState);
            const state = store.getState();

            expect(state.isOpen).toBe(true);
            expect(state.mode).toBe('device');
            expect(state.selectedStoreInfo).toEqual({ id: 'store1', name: 'Test Store', inventoryId: 'inv1' });
            // Other properties should still be default
            expect(state.shouldSearch).toBe(false);
            expect(state.searchParams).toBeNull();
        });
    });

    describe('actions', () => {
        let store: ReturnType<typeof createStoreLocatorStore>;

        beforeEach(() => {
            store = createStoreLocatorStore();
        });

        describe('open', () => {
            it('sets isOpen to true', () => {
                expect(store.getState().isOpen).toBe(false);

                store.getState().open();

                expect(store.getState().isOpen).toBe(true);
                expect(store.getState().pickupContext).toBeNull();
            });

            it('records the pickup context when opened for a specific line item', () => {
                store.getState().open({ productId: 'ln-heritage-005', quantity: 2 });

                expect(store.getState().isOpen).toBe(true);
                expect(store.getState().pickupContext).toEqual({ productId: 'ln-heritage-005', quantity: 2 });
            });
        });

        describe('close', () => {
            it('sets isOpen to false and clears any pickup context', () => {
                store.getState().open({ productId: 'ln-heritage-005', quantity: 1 });
                expect(store.getState().isOpen).toBe(true);
                expect(store.getState().pickupContext).not.toBeNull();

                store.getState().close();

                expect(store.getState().isOpen).toBe(false);
                expect(store.getState().pickupContext).toBeNull();
            });
        });

        describe('searchByForm', () => {
            it('sets form search parameters and triggers search', () => {
                const searchParams: FormSearchParams = {
                    countryCode: 'US',
                    postalCode: '12345',
                };

                store.getState().searchByForm(searchParams);

                const state = store.getState();
                expect(state.mode).toBe('input');
                expect(state.searchParams).toEqual(searchParams);
                expect(state.shouldSearch).toBe(true);
                expect(state.geoError).toBe(false);
            });
        });

        describe('setShouldSearch', () => {
            it('sets shouldSearch flag', () => {
                expect(store.getState().shouldSearch).toBe(false);

                store.getState().setShouldSearch(true);

                expect(store.getState().shouldSearch).toBe(true);
            });
        });

        describe('setDeviceCoordinates', () => {
            it('sets device coordinates and triggers search', () => {
                const coords: GeoCoordinates = {
                    latitude: 40.7128,
                    longitude: -74.006,
                };

                store.getState().setDeviceCoordinates(coords);

                const state = store.getState();
                expect(state.mode).toBe('device');
                expect(state.deviceCoordinates).toEqual(coords);
                expect(state.searchParams).toBeNull();
                expect(state.shouldSearch).toBe(true);
                expect(state.geoError).toBe(false);
            });
        });

        describe('setGeoError', () => {
            it('sets geoError flag', () => {
                expect(store.getState().geoError).toBe(false);

                store.getState().setGeoError(true);

                expect(store.getState().geoError).toBe(true);
            });
        });

        describe('setSelectedStoreInfo', () => {
            it('sets selected store info in state', () => {
                const storeInfo: SelectedStoreInfo = {
                    id: 'store1',
                    name: 'Test Store',
                    inventoryId: 'inv1',
                };

                store.getState().setSelectedStoreInfo(storeInfo);

                const state = store.getState();
                expect(state.selectedStoreInfo).toEqual(storeInfo);
            });

            it('clears selected store info when null', () => {
                // First set a store
                const storeInfo: SelectedStoreInfo = {
                    id: 'store1',
                    name: 'Test Store',
                    inventoryId: 'inv1',
                };
                store.getState().setSelectedStoreInfo(storeInfo);
                expect(store.getState().selectedStoreInfo).toEqual(storeInfo);

                // Then clear it
                store.getState().setSelectedStoreInfo(null);

                const state = store.getState();
                expect(state.selectedStoreInfo).toBeNull();
            });

            it("normalizes ShopperStores.schemas['Store'] objects and applies name fallback", () => {
                const fullStore = {
                    id: 'store1',
                    name: 'Test Store',
                    inventoryId: 'inv1',
                    address1: '123 Main St',
                    city: 'Boston',
                    phone: '555-1234',
                    email: 'store@example.com',
                };

                store.getState().setSelectedStoreInfo(fullStore);

                const state = store.getState();
                // Should only contain id, name, inventoryId (extra fields stripped)
                expect(state.selectedStoreInfo).toEqual({
                    id: 'store1',
                    name: 'Test Store',
                    inventoryId: 'inv1',
                });
            });

            it('applies name fallback (name || id) when name is missing', () => {
                const storeWithoutName = {
                    id: 'store-without-name',
                    inventoryId: 'inv1',
                    address1: '123 Main St',
                };

                store.getState().setSelectedStoreInfo(storeWithoutName);

                const state = store.getState();
                expect(state.selectedStoreInfo).toEqual({
                    id: 'store-without-name',
                    name: 'store-without-name', // Should fallback to id
                    inventoryId: 'inv1',
                });
            });
        });
    });

    describe('state updates', () => {
        it('maintains state consistency across multiple actions', () => {
            const store = createStoreLocatorStore();

            // Open store
            store.getState().open();
            expect(store.getState().isOpen).toBe(true);

            // Set device coordinates
            store.getState().setDeviceCoordinates({ latitude: 40.7128, longitude: -74.006 });
            expect(store.getState().mode).toBe('device');
            expect(store.getState().shouldSearch).toBe(true);

            // Set selected store
            const storeInfo: SelectedStoreInfo = { id: 'store1', name: 'Test Store' };
            store.getState().setSelectedStoreInfo(storeInfo);
            expect(store.getState().selectedStoreInfo).toEqual(storeInfo);

            // Close store
            store.getState().close();
            expect(store.getState().isOpen).toBe(false);
        });
    });

    describe('config', () => {
        it('uses default config when no override provided', () => {
            const store = createStoreLocatorStore();
            const config = store.getState().config;

            expect(config).toEqual({
                supportedCountries: [
                    { countryCode: 'US', countryName: 'United States' },
                    { countryCode: 'GB', countryName: 'United Kingdom' },
                ],
                radius: 100,
                radiusUnit: 'km',
                limit: 200,
                geoTimeout: 10000,
            });
        });

        it('allows config override in initial state', () => {
            const customConfig: StoreLocatorConfig = {
                supportedCountries: [{ countryCode: 'CA', countryName: 'Canada' }],
                radius: 50,
                radiusUnit: 'mi',
                limit: 200,
                geoTimeout: 5000,
            };

            const store = createStoreLocatorStore({ config: customConfig });
            const config = store.getState().config;

            expect(config).toEqual(customConfig);
        });
    });
});
