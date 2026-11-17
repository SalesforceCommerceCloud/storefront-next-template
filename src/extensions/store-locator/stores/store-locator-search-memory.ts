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
import type { FormSearchParams, StoreSearchResult } from './store-locator-store';

export const STORE_LOCATOR_SEARCH_MEMORY_KEY = 'store-locator-search-memory';

export type StoreLocatorSearchMemory = {
    mode: 'input' | 'device';
    searchParams: FormSearchParams | null;
    searchResult: StoreSearchResult;
};

export const getStoreLocatorSearchMemoryKey = (siteId: string): string =>
    `${STORE_LOCATOR_SEARCH_MEMORY_KEY}:${siteId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const isFormSearchParams = (value: unknown): value is FormSearchParams | null =>
    value === null ||
    (isRecord(value) && typeof value.countryCode === 'string' && typeof value.postalCode === 'string');

const isStoreSearchResult = (value: unknown): value is StoreSearchResult => {
    if (!isRecord(value) || typeof value.success !== 'boolean') {
        return false;
    }

    if (value.stores === undefined) {
        return true;
    }

    return (
        isRecord(value.stores) &&
        Array.isArray(value.stores.data) &&
        value.stores.data.every((store) => isRecord(store))
    );
};

export const isStoreLocatorSearchMemory = (value: unknown): value is StoreLocatorSearchMemory => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        (value.mode === 'input' || value.mode === 'device') &&
        isFormSearchParams(value.searchParams) &&
        isStoreSearchResult(value.searchResult)
    );
};

export const getStoreLocatorSearchMemory = (siteId: string): StoreLocatorSearchMemory | undefined => {
    if (typeof window === 'undefined') {
        return undefined;
    }

    try {
        const item = window.sessionStorage.getItem(getStoreLocatorSearchMemoryKey(siteId));
        const parsed: unknown = item ? JSON.parse(item) : undefined;
        return isStoreLocatorSearchMemory(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const setStoreLocatorSearchMemory = (siteId: string, searchMemory: StoreLocatorSearchMemory): void => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(getStoreLocatorSearchMemoryKey(siteId), JSON.stringify(searchMemory));
    } catch {
        // Session storage can be unavailable in private browsing contexts.
    }
};

export const clearStoreLocatorSearchMemory = (siteId: string): void => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.removeItem(getStoreLocatorSearchMemoryKey(siteId));
    } catch {
        // Session storage can be unavailable in private browsing contexts.
    }
};
