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

import type { PendingAddIntent } from '@/extensions/store-locator/lib/pending-add';
import type { FulfillmentMode, StoreEntryEligibility } from '@/extensions/store-locator/lib/store-entry';

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
    searchType?: 'postalCode' | 'city';
};

export type SelectedStoreInfo = {
    fulfillmentMode?: FulfillmentMode;
    id: string;
    name?: string;
    inventoryId?: string;
    postalCode?: string;
    countryCode?: string;
    distance?: number;
};

export type StoreSearchResult = {
    fulfillmentMode?: string;
    eligibility?: Record<string, StoreEntryEligibility>;
    success: boolean;
    stores?: ShopperStores.schemas['StoreResult'];
    error?: string;
};

/** Stable fetcher key shared by Store Locator selection controls and observers. */
export const SELECTED_STORE_FETCHER_KEY = 'store-locator-selected-store';

/** One confirmed chooser selection, claimable once by its initiating caller. */
export type ConfirmedStoreSelection = { owner: string; session: number; generation: number; store: SelectedStoreInfo };
export type StoreChooserOptions = {
    selectedStoreInfo?: SelectedStoreInfo | null;
    owner?: string;
    pickupContext?: PickupContext;
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
    fulfillmentMode: FulfillmentMode | null;
    returnFocusTarget: HTMLElement | null;
    pendingAddLoad: { owner: string } | null;
    pendingAdd: {
        owner: string;
        intent: PendingAddIntent;
        resume: (intent: PendingAddIntent, selection: SelectedStoreInfo) => void;
        /** Installed by the optional add module; the shared coordinator still owns confirmation. */
        resumeAfterSelection: () => void;
    } | null;
    identityScope?: string;
    selectionRevision: number;
    /** Revision window of the last confirmed write: reads captured while it was pending (`from`) end at `to`. */
    selectionSettlement: { from: number; to: number } | null;
    generation: number;
    session: number;
    chooserStoreInfo: SelectedStoreInfo | null;
    chooserOwner: string | null;
    confirmedSelection: ConfirmedStoreSelection | null;
    selectionPending: boolean;
    selectionIntent: 'set' | 'clear' | 'reconcile';
    selectionError: string | null;
    isOpen: boolean;
    mode: 'input' | 'device';
    shouldSearch: boolean;
    searchParams: FormSearchParams | null;
    deviceCoordinates: GeoCoordinates;
    geoError: boolean;
    selectedStoreInfo: SelectedStoreInfo | null;
    pickupContext: PickupContext | null;
    homeStorePromptDismissed: boolean;
    searchResult: StoreSearchResult | null;
    config: StoreLocatorConfig;
};

type StoreLocatorActions = {
    setFulfillmentMode: (mode: FulfillmentMode) => void;
    cancelAdd: (owner: string) => void;
    open: (context?: PickupContext) => void;
    openChooser: (options?: StoreChooserOptions) => void;
    openSelectedStore: () => void;
    close: (session?: number) => void;
    claimConfirmedSelection: (owner: string) => SelectedStoreInfo | null;
    searchByForm: (params: FormSearchParams) => void;
    setShouldSearch: (should: boolean) => void;
    setDeviceCoordinates: (coords: GeoCoordinates) => void;
    setGeoError: (value: boolean) => void;
    setSearchResult: (result: StoreSearchResult | null) => void;
    setSelectedStoreInfo: (
        info: SelectedStoreInfo | ShopperStores.schemas['Store'] | Partial<ShopperStores.schemas['Store']> | null
    ) => void;
    setHomeStorePromptDismissed: (dismissed: boolean) => void;
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
        ...('fulfillmentMode' in store && store.fulfillmentMode
            ? { fulfillmentMode: store.fulfillmentMode as FulfillmentMode }
            : {}),
        ...(store.postalCode ? { postalCode: store.postalCode } : {}),
        ...(store.countryCode ? { countryCode: store.countryCode } : {}),
        ...(typeof store.distance === 'number' ? { distance: store.distance } : {}),
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
        fulfillmentMode: null,
        returnFocusTarget: null,
        pendingAdd: null,
        pendingAddLoad: null,
        selectionRevision: 0,
        selectionSettlement: null,
        generation: 0,
        session: 0,
        chooserStoreInfo: null,
        chooserOwner: null,
        confirmedSelection: null,
        selectionPending: false,
        selectionIntent: 'set',
        selectionError: null,
        isOpen: false,
        mode: 'input',
        shouldSearch: false,
        searchParams: null,
        deviceCoordinates: { latitude: null, longitude: null },
        geoError: false,
        selectedStoreInfo: null,
        pickupContext: null,
        homeStorePromptDismissed: false,
        searchResult: null,
        config: defaultConfig,
        ...init,
    };

    const actions: StoreLocatorActions = {
        setFulfillmentMode: (fulfillmentMode) => {
            if (state.selectionPending || state.selectionError === 'outcome_unknown') return;
            store.setState({
                fulfillmentMode,
                shouldSearch: false,
                searchParams: null,
                searchResult: null,
                geoError: false,
                selectionError: null,
            });
        },
        cancelAdd: (owner) => {
            if (state.pendingAdd?.owner === owner) store.setState({ pendingAdd: null });
            if (state.pendingAddLoad?.owner === owner) store.setState({ pendingAddLoad: null });
        },
        open: (context) => store.getState().openChooser({ pickupContext: context }),
        openChooser: (options) =>
            store.setState((state) => ({
                isOpen: true,
                pendingAdd: null,
                pendingAddLoad: null,
                fulfillmentMode: state.selectedStoreInfo?.fulfillmentMode ?? state.fulfillmentMode,
                pickupContext: options?.pickupContext ?? null,
                session: state.session + 1,
                selectionError: state.selectionError === 'outcome_unknown' ? state.selectionError : null,
                chooserStoreInfo:
                    options?.selectedStoreInfo === undefined ? state.selectedStoreInfo : options.selectedStoreInfo,
                chooserOwner: options?.owner ?? null,
                confirmedSelection: null,
            })),
        openSelectedStore: () => {
            store.getState().open();
            const { selectedStoreInfo, searchResult } = store.getState();
            const hasSelectedStoreInResults = searchResult?.stores?.data?.some(
                (store) => store.id === selectedStoreInfo?.id
            );
            if (hasSelectedStoreInResults) {
                store.setState({ isOpen: true });
                return;
            }

            if (selectedStoreInfo?.countryCode && selectedStoreInfo.postalCode) {
                store.setState({
                    isOpen: true,
                    mode: 'input',
                    searchParams: {
                        countryCode: selectedStoreInfo.countryCode,
                        postalCode: selectedStoreInfo.postalCode,
                    },
                    shouldSearch: true,
                    geoError: false,
                });
                return;
            }

            store.setState({ isOpen: true });
        },
        close: (session) => {
            if (session === undefined || session === store.getState().session)
                store.setState({
                    isOpen: false,
                    pendingAdd: null,
                    pendingAddLoad: null,
                    pickupContext: null,
                    chooserOwner: null,
                    confirmedSelection: null,
                });
        },
        claimConfirmedSelection: (owner) => {
            const state = store.getState();
            const notification = state.confirmedSelection;
            if (
                !notification ||
                notification.owner !== owner ||
                notification.session !== state.session ||
                notification.generation !== state.generation
            )
                return null;
            // Clear before handing control to the caller, including synchronous subscriptions/remounts.
            store.setState({ confirmedSelection: null });
            return notification.store;
        },
        searchByForm: (params) =>
            store.setState({
                mode: 'input',
                searchParams: params,
                shouldSearch: true,
                geoError: false,
                searchResult: null,
            }),
        setDeviceCoordinates: (coords) =>
            store.setState({
                mode: 'device',
                deviceCoordinates: coords,
                searchParams: null,
                shouldSearch: true,
                geoError: false,
                searchResult: null,
            }),
        setGeoError: (value) => store.setState({ geoError: value }),
        setShouldSearch: (should) => store.setState({ shouldSearch: should }),
        setSearchResult: (result) => store.setState({ searchResult: result }),
        setSelectedStoreInfo: (info) => {
            const normalized = normalizeStoreInfo(info);
            store.setState({
                selectedStoreInfo: normalized,
            });
        },
        setHomeStorePromptDismissed: (dismissed) => store.setState({ homeStorePromptDismissed: dismissed }),
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
