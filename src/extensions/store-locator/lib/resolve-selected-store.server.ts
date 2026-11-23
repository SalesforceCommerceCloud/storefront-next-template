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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { createContext, type RouterContextProvider } from 'react-router';
import { createHash } from 'node:crypto';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getScapiBaseUrl } from '@/lib/utils';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import { getPreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { ApiError, AuthTokenInvalidError, type ShopperStores } from '@/scapi';

export type Resolution = {
    selectedStoreInfo: SelectedStoreInfo | null;
    store: ShopperStores.schemas['Store'] | null;
    /** Present on server resolutions; optional for existing consumer-provided fixtures. */
    preferredStoreId?: string | null;
    status?: 'empty' | 'resolved' | 'stale' | 'error';
    error: 'profile' | 'store' | null;
    authError?: boolean;
};
const resolutionContext = createContext<{ key: string; promise: Promise<Resolution> } | null>(null);
const empty = (error: Resolution['error'] = null, preferredStoreId: string | null = null): Resolution => ({
    selectedStoreInfo: null,
    store: null,
    preferredStoreId,
    status: error ? 'error' : 'empty',
    error,
});

/** Forget the request-local read snapshot after a successful registered preference write. */
export function invalidateSelectedStoreResolution(context: Readonly<RouterContextProvider>): void {
    context.set(resolutionContext, null);
}
const metadata = new Map<string, { expiresAt: number; result: Resolution }>();
function isAuthError(error: unknown): boolean {
    if (
        error instanceof AuthTokenInvalidError ||
        (error instanceof Error && error.name === 'AuthTokenInvalidError') ||
        ((error instanceof ApiError || error instanceof Response) && error.status === 401)
    )
        return true;
    return error instanceof Error && error.cause != null && error.cause !== error ? isAuthError(error.cause) : false;
}

/**
 * Cache metadata only, never profile preferences or in-flight requests.
 * @env {string} [SCAPI_PROXY_HOST] - Optional API backend override, e.g. "https://api.example.com".
 */
function metadataScope(context: Readonly<RouterContextProvider>): { key: string; ttl: number } {
    const config = getConfig(context);
    const auth = getAuth(context);
    const site = context.get(siteContext);
    const api = config.commerce.api;
    const configured = config.serverExtension?.storeLocator?.storeMetadataCacheTtlSeconds ?? 60;
    // Shopper context is not exposed by its middleware. Do not reuse hook metadata
    // when that context can evolve independently of the authentication tuple.
    const ttl = config.features?.shopperContext?.enabled ? 0 : Math.max(0, configured) * 1000;
    return {
        ttl: Number.isFinite(ttl) ? ttl : 0,
        key: createHash('sha256')
            .update(
                JSON.stringify([
                    process.env.SCAPI_PROXY_HOST || getScapiBaseUrl(api.shortCode),
                    api.organizationId,
                    api.clientId,
                    site?.site.id,
                    getTranslation(context).i18next.language ?? config.i18n.fallbackLng,
                    auth.accessToken,
                    auth.refreshToken,
                    auth.customerId,
                    auth.usid,
                    auth.dwsid,
                    auth.userType,
                ])
            )
            .digest('hex'),
    };
}

function isValidCandidate(id: unknown): id is string {
    return typeof id === 'string' && Boolean(id.trim()) && id.length <= 256;
}

async function lookupStore(
    clients: ReturnType<typeof createApiClients>,
    id: string,
    context: Readonly<RouterContextProvider>,
    fresh = false
): Promise<Resolution> {
    const scope = metadataScope(context);
    const key = `${scope.key}:${id}`;
    const cached = metadata.get(key);
    if (!fresh && scope.ttl > 0 && cached && cached.expiresAt > Date.now()) return structuredClone(cached.result);
    const { data } = await clients.shopperStores.getStores({ params: { query: { ids: id } } });
    const store = data?.data?.find((candidate) => candidate.id === id) ?? null;
    const result: Resolution = store?.inventoryId
        ? {
              store,
              selectedStoreInfo: {
                  id: store.id,
                  name: store.name || store.id,
                  inventoryId: store.inventoryId,
                  ...(store.countryCode ? { countryCode: store.countryCode } : {}),
                  ...(store.postalCode ? { postalCode: store.postalCode } : {}),
              },
              preferredStoreId: null,
              status: 'resolved',
              error: null,
          }
        : { ...empty(), status: 'stale' };
    if (!fresh && store?.inventoryId) rememberStoreMetadata(context, store);
    return result;
}

/** Successful explicit selection replaces metadata only after fresh validation and persistence. */
export function rememberStoreMetadata(
    context: Readonly<RouterContextProvider>,
    store: ShopperStores.schemas['Store']
): void {
    const scope = metadataScope(context);
    if (scope.ttl > 0 && store.inventoryId) {
        const key = `${scope.key}:${store.id}`;
        metadata.delete(key);
        while (metadata.size >= 256) {
            const oldest = metadata.keys().next().value;
            if (oldest === undefined) break;
            metadata.delete(oldest);
        }
        metadata.set(key, {
            expiresAt: Date.now() + scope.ttl,
            result: {
                store: structuredClone(store),
                selectedStoreInfo: {
                    id: store.id,
                    name: store.name || store.id,
                    inventoryId: store.inventoryId,
                    ...(store.countryCode ? { countryCode: store.countryCode } : {}),
                    ...(store.postalCode ? { postalCode: store.postalCode } : {}),
                },
                preferredStoreId: null,
                status: 'resolved',
                error: null,
            },
        });
    }
}

/** Lazy request-only resolution shared by parallel loaders; never writes profile or cookie. */
export async function resolveSelectedStore(context: Readonly<RouterContextProvider>): Promise<Resolution> {
    const auth = getAuth(context);
    const site = context.get(siteContext);
    if (!site?.site.id) throw new Error('Selected store resolution requires site context');
    // The active store is whatever the selection middleware published after reconciliation;
    // the profile default is applied once at login/restore, never re-read here.
    const candidate = context.get(selectedStoreContext);
    // Tokens stay exclusively in server request context and never leave this module.
    const key = JSON.stringify([
        site.site.id,
        auth.userType,
        auth.customerId,
        auth.usid,
        auth.accessToken,
        candidate?.id,
        candidate?.fulfillmentMode,
    ]);
    const cached = context.get(resolutionContext);
    if (cached?.key === key) return cached.promise;
    // Client creation is outside operational catches: missing configuration is a setup defect.
    const clients = createApiClients(context);
    const promise = (async (): Promise<Resolution> => {
        const id = candidate?.id;
        if (!isValidCandidate(id)) return empty();
        const preferredStoreId = null;
        try {
            const resolved = await lookupStore(clients, id, context);
            return {
                ...resolved,
                preferredStoreId,
                selectedStoreInfo: resolved.selectedStoreInfo
                    ? {
                          ...resolved.selectedStoreInfo,
                          ...(candidate?.fulfillmentMode ? { fulfillmentMode: candidate.fulfillmentMode } : {}),
                      }
                    : null,
            };
        } catch (error) {
            getLogger(context).error('SelectedStore: store resolution failed', {
                category: 'store',
                status: error instanceof ApiError || error instanceof Response ? error.status : undefined,
                name: error instanceof Error ? error.name : undefined,
            });
            return {
                ...empty('store', preferredStoreId),
                authError: isAuthError(error),
            };
        }
    })();
    context.set(resolutionContext, { key, promise });
    return promise;
}

export type DefaultStoreResolution = {
    /** Profile default exactly as saved; null when none is saved. */
    preferredStoreId: string | null;
    store: ShopperStores.schemas['Store'] | null;
    /** `stale`: an id is saved but the store is gone or not pickup-capable. */
    status: 'empty' | 'resolved' | 'stale' | 'error';
    error: 'profile' | 'store' | null;
    authError?: boolean;
};

/** Resolve the registered shopper's saved default store; read-only, independent of the active selection. */
export async function resolveDefaultStore(context: Readonly<RouterContextProvider>): Promise<DefaultStoreResolution> {
    let preferredStoreId: string | null;
    try {
        preferredStoreId = await getPreferredStoreId(context);
    } catch (error) {
        return {
            preferredStoreId: null,
            store: null,
            status: 'error',
            error: 'profile',
            authError: isAuthError(error),
        };
    }
    if (!preferredStoreId) return { preferredStoreId: null, store: null, status: 'empty', error: null };
    const clients = createApiClients(context);
    try {
        const { store, status } = await lookupStore(clients, preferredStoreId, context);
        return { preferredStoreId, store, status: status === 'resolved' ? 'resolved' : 'stale', error: null };
    } catch (error) {
        getLogger(context).error('DefaultStore: store resolution failed', {
            category: 'store',
            status: error instanceof ApiError || error instanceof Response ? error.status : undefined,
            name: error instanceof Error ? error.name : undefined,
        });
        return { preferredStoreId, store: null, status: 'error', error: 'store', authError: isAuthError(error) };
    }
}

/**
 * Fresh (uncached) store lookup used to validate a default candidate before saving.
 * `store` is null when the id does not exist; `eligible` is false when it exists but cannot serve pickup (no inventoryId).
 */
export async function lookupStoreFresh(
    context: Readonly<RouterContextProvider>,
    id: string
): Promise<{ store: ShopperStores.schemas['Store'] | null; eligible: boolean }> {
    const { data } = await createApiClients(context).shopperStores.getStores({ params: { query: { ids: id } } });
    const store = data?.data?.find((candidate) => candidate.id === id) ?? null;
    return { store, eligible: Boolean(store?.inventoryId) };
}
