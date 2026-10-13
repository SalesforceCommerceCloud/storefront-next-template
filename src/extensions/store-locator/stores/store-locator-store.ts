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

export type StoreLocatorConfig = {
    supportedCountries: Array<{ countryCode: string; countryName: string }>;
    radius: number;
    radiusUnit: 'mi' | 'km';
    limit: number;
    geoTimeout: number;
};

export type GeoCoordinates = {
    latitude: number | null;
    longitude: number | null;
};

export type FormSearchParams = {
    countryCode: string;
    postalCode: string;
};

export type SelectedStoreInfo = {
    id: string;
    name?: string;
    inventoryId?: string;
};

/**
 * The cart line item (or PDP selection) a pickup-store search is being performed for. Optional — the store
 * locator can be opened without an item (e.g. a header find-a-store trigger). When present, a consumer of the
 * sheet can scope the store list to that item (e.g. augment/sort boutiques by whether they stock it).
 */
export type PickupContext = {
    productId: string;
    quantity: number;
};

type StoreLocatorState = {
    isOpen: boolean;
    mode: 'input' | 'device';
    shouldSearch: boolean;
    searchParams: FormSearchParams | null;
    deviceCoordinates: GeoCoordinates;
    geoError: boolean;
    selectedStoreInfo: SelectedStoreInfo | null;
    pickupContext: PickupContext | null;
    config: StoreLocatorConfig;
};

type StoreLocatorActions = {
    open: (context?: PickupContext) => void;
    close: () => void;
    searchByForm: (params: FormSearchParams) => void;
    setShouldSearch: (should: boolean) => void;
    setDeviceCoordinates: (coords: GeoCoordinates) => void;
    setGeoError: (value: boolean) => void;
    setSelectedStoreInfo: (
        info: SelectedStoreInfo | ShopperStores.schemas['Store'] | Partial<ShopperStores.schemas['Store']> | null
    ) => void;
};

export type StoreLocatorStore = StoreLocatorState & StoreLocatorActions;

const defaultConfig: StoreLocatorConfig = {
    supportedCountries: [
        { countryCode: 'US', countryName: 'United States' },
        { countryCode: 'GB', countryName: 'United Kingdom' },
    ],
    radius: 100,
    radiusUnit: 'km',
    limit: 200, // This is an API limit and is therefore not configurable
    geoTimeout: 10000,
};

import type { ShopperStores } from '@/scapi';

/**
 * Normalizes a store object to SelectedStoreInfo format.
 * Strips out extra fields and applies default name logic (name || id).
 *
 * @param store - Store object from API or SelectedStoreInfo, or null
 * @returns Normalized SelectedStoreInfo or null
 */
const normalizeStoreInfo = (
    store: SelectedStoreInfo | ShopperStores.schemas['Store'] | Partial<ShopperStores.schemas['Store']> | null
): SelectedStoreInfo | null => {
    if (!store || !store.id) {
        return null;
    }

    return {
        id: store.id,
        name: store.name || store.id,
        inventoryId: store.inventoryId,
    };
};

/**
 * Store API interface for subscription-based state management.
 * Compatible with React's useSyncExternalStore hook.
 */
export type StoreApi<T> = {
    getState: () => T;
    setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
    subscribe: (listener: () => void) => () => void;
};

/**
 * Create a vanilla store for the store locator feature.
 * Allows overriding parts of initial state via `init` for hydration and tests.
 * Compatible with React's useSyncExternalStore for selector-based subscriptions.
 *
 * @param init - Partial initial state overrides
 * @returns Store instance with getState, setState, and subscribe methods
 */
export const createStoreLocatorStore = (init?: Partial<StoreLocatorState>): StoreApi<StoreLocatorStore> => {
    const listeners = new Set<() => void>();

    const initialState: StoreLocatorState = {
        isOpen: false,
        mode: 'input',
        shouldSearch: false,
        searchParams: null,
        deviceCoordinates: { latitude: null, longitude: null },
        geoError: false,
        selectedStoreInfo: null,
        pickupContext: null,
        config: defaultConfig,
        ...init,
    };

    const actions: StoreLocatorActions = {
        open: (context) => store.setState({ isOpen: true, pickupContext: context ?? null }),
        close: () => store.setState({ isOpen: false, pickupContext: null }),
        searchByForm: (params) =>
            store.setState({ mode: 'input', searchParams: params, shouldSearch: true, geoError: false }),
        setDeviceCoordinates: (coords) =>
            store.setState({
                mode: 'device',
                deviceCoordinates: coords,
                searchParams: null,
                shouldSearch: true,
                geoError: false,
            }),
        setGeoError: (value) => store.setState({ geoError: value }),
        setShouldSearch: (should) => store.setState({ shouldSearch: should }),
        setSelectedStoreInfo: (info) => {
            const normalized = normalizeStoreInfo(info);
            store.setState({ selectedStoreInfo: normalized });
        },
    };

    let state: StoreLocatorStore = {
        ...initialState,
        ...actions,
    };

    const store: StoreApi<StoreLocatorStore> = {
        getState: () => state,
        setState: (partial) => {
            const nextPartial = typeof partial === 'function' ? partial(state) : partial;
            const nextState = { ...state, ...nextPartial };
            if (!Object.is(state, nextState)) {
                state = nextState;
                listeners.forEach((listener) => listener());
            }
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };

    return store;
};
