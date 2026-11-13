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
import { createContext, matchPath, type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { BoundedCache } from '@salesforce/storefront-next-runtime/security';
import { getScapiBaseUrl } from '@/lib/utils';
import {
    ApiError,
    AuthTokenInvalidError,
    type ConfirmedContextChangeRequired,
    type NativeShopperContext,
} from '@/scapi';
import { getAuth } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getShopperContextHelpers } from '@/lib/api/shopper-context.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import {
    selectedStoreContext,
    selectedStoreStorageContext,
    updateSelectedStore,
} from '@/extensions/store-locator/middlewares/selected-store.server';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

import type { StoreSelectionConfig } from '@/types/config';
import { resourceRoutes } from '@/route-paths';
import { isPageDesignerMode } from '@/lib/shopper-context/server-utils.server';
import { isNativeStoreSelectionEnabled } from '@/lib/shopper-context/store-selection';
export type { StoreSelectionConfig } from '@/types/config';

export type ShoppingContext = {
    siteId: string;
    preparingStoreId: string | null;
    inventoryId?: string;
    contextRevision: string;
    /** Client preference origin; never authorization or proof of a user action. */
    selectionOrigin: 'explicit' | 'remembered';
    explicitChoiceSessionId?: string;
    committedAt: string;
};

// Browser replicas describe preference only; they never authorize qualification or basket changes.
type SelectionRecord = { storeId: string | null; revision: string; sessionId?: string; committedAt: string };
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECORD_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PREFERENCE_COOKIE_LENGTH = 4096;

// Reserved store-owned metadata. It also records an intentional clear, so an
// old cookie cannot resurrect selection after a lost clear response.
export const STORE_SELECTION_QUALIFIER = 'sfnextStoreSelection';
export const shoppingContext = createContext<ShoppingContext | null>(null);
const selectionState = createContext<{
    native: NativeShopperContext;
    record: SelectionRecord | null;
    sessionId: string;
    sessionHeader: string | null;
    requiresRecovery?: boolean;
} | null>(null);

type Context = Readonly<RouterContextProvider>;

// Per-process optimization only: no shared-cache, native-readiness or write-order guarantee.
const validatedStores = new BoundedCache<{ value?: SelectedStoreInfo; validatedAt: number }>(1000);

export class StoreSelectionError extends Error {
    constructor(
        readonly code: string,
        readonly status = 400,
        options?: ErrorOptions
    ) {
        super(code, options);
    }
}

/** Classify server-side failures without exposing upstream bodies or treating every 4xx as shopper input. */
export function getStoreSelectionFailure(error: unknown, fallbackCode = 'STORE_SELECTION_FAILED') {
    // SDK token invalidation belongs to the existing auth middleware and its recovery guard.
    if (error instanceof AuthTokenInvalidError) throw error;
    if (error instanceof StoreSelectionError) return { code: error.code, status: error.status, headers: {} };
    if (error instanceof SyntaxError) return { code: 'INVALID_STORE_INFO', status: 400, headers: {} };
    if (error instanceof Error && error.name === 'TimeoutError')
        return { code: 'STORE_CONTEXT_TIMEOUT', status: 504, headers: {} };
    if (error instanceof ApiError) {
        const retryAfter = error.headers.get('Retry-After');
        const headers: Record<string, string> =
            retryAfter && (/^\d+$/.test(retryAfter) || Number.isFinite(Date.parse(retryAfter)))
                ? { 'Retry-After': retryAfter }
                : {};
        if (error.status === 401) return { code: 'STORE_CONTEXT_AUTH_REQUIRED', status: 401, headers: {} };
        if (error.status === 429) return { code: 'STORE_CONTEXT_RATE_LIMITED', status: 503, headers };
        if (error.status === 503) return { code: 'STORE_CONTEXT_UNAVAILABLE', status: 503, headers };
        if (error.status === 408 || error.status === 504)
            return { code: 'STORE_CONTEXT_TIMEOUT', status: 504, headers: {} };
        if (error.status >= 400 && error.status < 500)
            return { code: 'STORE_CONTEXT_REJECTED', status: 500, headers: {} };
        if (error.status >= 500) return { code: 'STORE_CONTEXT_UNAVAILABLE', status: 502, headers: {} };
    }
    return { code: fallbackCode, status: 502, headers: {} };
}

export function parseSelectedStore(value: unknown): SelectedStoreInfo | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { id } = value as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim() || id.length > 256 || /[,\r\n]/.test(id)) return null;
    return { id };
}

function getSelectionConfig(context: Context): StoreSelectionConfig {
    const config = getConfig(context).features.shopperContext.storeSelection;
    if (
        !config ||
        !config.qualifierKeys.length ||
        config.qualifierKeys.length > 20 ||
        new Set(config.qualifierKeys).size !== config.qualifierKeys.length ||
        config.qualifierKeys.some((key) => !key.trim() || key.length > 256)
    ) {
        throw new StoreSelectionError('STORE_MAPPING_NOT_CONFIGURED', 503);
    }
    return config;
}

/**
 * Validate identity/display/inventory with the Store API. Ordinary restores may reuse a recent success;
 * explicit selection and native repair always refresh. Cookie values never establish cache freshness.
 */
export async function validateSelectedStore(
    context: Context,
    candidate: SelectedStoreInfo,
    { useCache = false }: { useCache?: boolean } = {}
): Promise<SelectedStoreInfo> {
    const config = getConfig(context);
    const api = config.commerce?.api;
    const site = context.get(siteContext);
    const auth = getAuth(context);
    const feature = config.features.shopperContext;
    const policy = feature.storeSelection;
    const mapping = site ? policy?.storesBySite?.[site.site.id]?.[candidate.id] : undefined;
    const configuredTtl = policy?.storeValidationTtlSeconds ?? 30;
    const ttl = Number.isFinite(configuredTtl) && configuredTtl >= 0 && configuredTtl <= 300 ? configuredTtl * 1000 : 0;
    const key =
        api?.organizationId && site?.site.id && auth.usid
            ? JSON.stringify([
                  getScapiBaseUrl(api.shortCode ?? ''),
                  api.organizationId,
                  api.clientId,
                  site.site.id,
                  site.locale?.id,
                  site.currency,
                  auth.customerId,
                  auth.usid,
                  candidate.id,
                  policy?.qualifierKeys,
                  mapping,
              ])
            : null;
    const cached = key && useCache && ttl > 0 ? validatedStores.get(key) : undefined;
    const age = cached ? Date.now() - cached.validatedAt : -1;
    let canonical = cached?.value && age >= 0 && age < ttl ? { ...cached.value } : undefined;
    if (!canonical) {
        // Replace before reading so failed refreshes never fall back to an older successful value.
        const entry: { value?: SelectedStoreInfo; validatedAt: number } = { validatedAt: 0 };
        if (key) validatedStores.set(key, entry);
        const { data } = await createApiClients(context).shopperStores.getStores({
            params: { query: { ids: candidate.id } },
        });
        const store = data.data?.find((item) => item.id === candidate.id);
        if (!store) throw new StoreSelectionError('INVALID_STORE');
        canonical = { id: store.id, name: store.name || store.id, inventoryId: store.inventoryId };
        // A later refresh owns its entry; an older completion cannot replace it.
        if (
            key &&
            ttl > 0 &&
            validatedStores.get(key) === entry &&
            (!isNativeStoreSelectionEnabled(feature) || (mapping && mapping.inventoryId === canonical.inventoryId))
        ) {
            entry.value = { ...canonical };
            entry.validatedAt = Date.now();
        }
    }
    if (candidate.inventoryId !== undefined && candidate.inventoryId !== canonical.inventoryId) {
        throw new StoreSelectionError('INVALID_STORE_INVENTORY');
    }
    return canonical;
}

function getConfiguredMapping(context: Context, storeId: string) {
    const config = getSelectionConfig(context);
    const siteId = context.get(siteContext)?.site.id;
    if (!siteId) throw new StoreSelectionError('SITE_CONTEXT_REQUIRED', 503);
    const mapping = config.storesBySite[siteId]?.[storeId];
    if (
        !mapping ||
        !mapping.inventoryId ||
        Object.keys(mapping.assignmentQualifiers ?? {}).length !== config.qualifierKeys.length ||
        config.qualifierKeys.some(
            (key) =>
                !Object.hasOwn(mapping.assignmentQualifiers, key) ||
                typeof mapping.assignmentQualifiers[key] !== 'string' ||
                !mapping.assignmentQualifiers[key].trim() ||
                mapping.assignmentQualifiers[key].length > 2048
        )
    ) {
        throw new StoreSelectionError('INVALID_STORE_MAPPING');
    }
    return mapping;
}

function getMapping(context: Context, store: SelectedStoreInfo) {
    const mapping = getConfiguredMapping(context, store.id);
    if (mapping.inventoryId !== store.inventoryId) throw new StoreSelectionError('INVALID_STORE_MAPPING');
    return mapping;
}

function readRecord(native: NativeShopperContext): SelectionRecord | null {
    const raw = native.customQualifiers?.[STORE_SELECTION_QUALIFIER];
    if (raw === undefined || raw === null) return null;
    try {
        const record = JSON.parse(raw) as SelectionRecord;
        if (
            (record.storeId !== null && !parseSelectedStore({ id: record.storeId })) ||
            typeof record.revision !== 'string' ||
            typeof record.committedAt !== 'string' ||
            (record.sessionId !== undefined && typeof record.sessionId !== 'string')
        )
            throw new Error('Invalid native store selection record');
        return record;
    } catch (cause) {
        throw new StoreSelectionError('INVALID_NATIVE_STORE_CONTEXT', 502, { cause });
    }
}

function publish(context: Context, store: SelectedStoreInfo | null, record: SelectionRecord, sessionId: string) {
    const siteId = context.get(siteContext)?.site.id;
    if (!siteId) throw new StoreSelectionError('SITE_CONTEXT_REQUIRED', 503);
    context.set(selectedStoreContext, store);
    context.set(shoppingContext, {
        siteId,
        preparingStoreId: store?.id ?? null,
        inventoryId: store?.inventoryId,
        contextRevision: record.revision,
        selectionOrigin: record.sessionId === sessionId ? 'explicit' : 'remembered',
        explicitChoiceSessionId: record.sessionId === sessionId ? sessionId : undefined,
        committedAt: record.committedAt,
    });
    updateSelectedStore(context, store);
    context.get(selectedStoreStorageContext)?.set('selectionRecord', JSON.stringify(record));
}

function qualifierPatch(context: Context, store: SelectedStoreInfo | null): Record<string, string | null> {
    const config = getSelectionConfig(context);
    return store
        ? getMapping(context, store).assignmentQualifiers
        : Object.fromEntries(config.qualifierKeys.map((key) => [key, null]));
}

async function hasBasketItems(context: Context): Promise<boolean> {
    const { customerId } = getAuth(context);
    if (!customerId) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
    // The native list cannot be bypassed by deleting the browser's basket cookie.
    const { data } = await createApiClients(context).shopperCustomers.getCustomerBaskets({
        params: { path: { customerId } },
    });
    return data.baskets?.some((basket) => (basket.productItems?.length ?? 0) > 0) ?? false;
}

/** A cleared key must be absent: a persisted null slot can still break dependent native reads. */
function matchesStoreQualifiers(native: NativeShopperContext, expected: Record<string, string | null>) {
    const current = native.assignmentQualifiers ?? {};
    return Object.entries(expected).every(([key, value]) =>
        value === null ? !Object.hasOwn(current, key) : current[key] === value
    );
}

async function commit(context: Context, store: SelectedStoreInfo | null, explicit: boolean) {
    const state = context.get(selectionState);
    if (!state) throw new StoreSelectionError('STORE_CONTEXT_NOT_READY', 503);
    const record: SelectionRecord = {
        storeId: store?.id ?? null,
        revision: randomUUID(),
        committedAt: new Date().toISOString(),
        ...(explicit ? { sessionId: state.sessionId } : {}),
    };
    const body = {
        assignmentQualifiers: qualifierPatch(context, store),
        customQualifiers: { [STORE_SELECTION_QUALIFIER]: JSON.stringify(record) },
    };
    const { usid } = getAuth(context);
    if (!usid) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
    const native = await getShopperContextHelpers(context, usid).update(body);
    if (
        native.customQualifiers?.[STORE_SELECTION_QUALIFIER] !== JSON.stringify(record) ||
        !matchesStoreQualifiers(native, body.assignmentQualifiers)
    ) {
        throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
    }
    // Native success precedes both the compatible cookie and the active UI state.
    context.set(selectionState, { ...state, native, record, requiresRecovery: false });
    publish(context, store, record, state.sessionId);
}

/**
 * Resolve native truth before basket/product/search loaders. One request-scoped
 * empty PATCH returns authoritative context, including changes whose response
 * was lost, without replacing qualifiers or depending on a native GET/cache TTL.
 */
async function restoreStoreSelection(request: Request, context: Context): Promise<string | null> {
    const feature = getConfig(context).features.shopperContext;
    const nativeEnabled = isNativeStoreSelectionEnabled(feature);
    const remembered = context.get(selectedStoreContext);
    const sessionCookie = createCookie<string>(
        'storeChoiceSession',
        getCookieConfig({ httpOnly: true }, context),
        context
    );
    const rawSession = await sessionCookie.parse(request.headers.get('Cookie') ?? '');
    const siteId = context.get(siteContext)?.site.id;
    if (!siteId) throw new StoreSelectionError('SITE_CONTEXT_REQUIRED', 503);
    let sessionId: string | undefined;
    // Shape/age checks keep client preference well formed; this is not authenticated evidence of a user action.
    try {
        const payload: unknown =
            rawSession && rawSession.length <= MAX_PREFERENCE_COOKIE_LENGTH
                ? JSON.parse(decodeURIComponent(rawSession))
                : null;
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const preference = payload as Record<string, unknown>;
            if (
                preference.version === 1 &&
                preference.siteId === siteId &&
                typeof preference.sessionId === 'string' &&
                SESSION_ID.test(preference.sessionId) &&
                typeof preference.issuedAt === 'number' &&
                Number.isSafeInteger(preference.issuedAt) &&
                preference.issuedAt <= Date.now() &&
                Date.now() - preference.issuedAt < SESSION_MAX_AGE_MS
            ) {
                sessionId = preference.sessionId;
            }
        }
    } catch {
        /* Malformed or previous cookie formats start a new preference session. */
    }
    const needsSessionCookie = !sessionId;
    sessionId ??= randomUUID();
    const sessionHeader = needsSessionCookie
        ? await sessionCookie.serialize(
              encodeURIComponent(
                  JSON.stringify({
                      version: 1,
                      siteId,
                      sessionId,
                      issuedAt: Date.now(),
                  })
              )
          )
        : null;
    const recordCookie = createCookie<string>(
        'storeChoiceRecord',
        getCookieConfig({ httpOnly: true }, context),
        context
    );
    const rawRecord = await recordCookie.parse(request.headers.get('Cookie') ?? '');
    let rememberedRecord: SelectionRecord | null = null;
    try {
        if (rawRecord && rawRecord.length <= MAX_PREFERENCE_COOKIE_LENGTH) {
            const preference = readRecord({
                customQualifiers: { [STORE_SELECTION_QUALIFIER]: decodeURIComponent(rawRecord) },
            });
            const committedAt = preference ? Date.parse(preference.committedAt) : Number.NaN;
            if (
                preference &&
                preference.revision &&
                preference.revision.length <= 256 &&
                (preference.sessionId === undefined || SESSION_ID.test(preference.sessionId)) &&
                Number.isFinite(committedAt) &&
                committedAt <= Date.now() &&
                Date.now() - committedAt < RECORD_MAX_AGE_MS
            ) {
                rememberedRecord = preference;
            }
        }
    } catch {
        /* Invalid preference metadata cannot prevent validated store restoration. */
    }
    // Ordinary off-mode requests never access native context.
    if (!nativeEnabled && !feature.storeSelection?.cleanup) {
        let unavailable = false;
        const validated = remembered
            ? await validateSelectedStore(
                  context,
                  { id: remembered.id },
                  { useCache: !isSelectionAction(request, context) }
              ).catch((error: unknown) => {
                  if (error instanceof StoreSelectionError) return null;
                  unavailable = true;
                  getLogger(context).warn('Remembered store validation unavailable', { error });
                  return null;
              })
            : null;
        if (unavailable) {
            // Keep the replica for retry, but do not expose unvalidated cookie
            // values as an active store or make legacy pages depend on Store API uptime.
            context.set(selectedStoreContext, null);
            context.set(selectionState, { native: {}, record: null, sessionId, sessionHeader });
            return sessionHeader;
        }
        const record =
            rememberedRecord && rememberedRecord.storeId === (validated?.id ?? null)
                ? rememberedRecord
                : {
                      storeId: validated?.id ?? null,
                      revision: randomUUID(),
                      committedAt: new Date().toISOString(),
                  };
        context.set(selectionState, { native: {}, record, sessionId, sessionHeader });
        if (remembered || validated || rememberedRecord) publish(context, validated, record, sessionId);
        return sessionHeader;
    }
    const selectionConfig = getSelectionConfig(context);
    const { usid } = getAuth(context);
    if (!usid) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
    const helpers = getShopperContextHelpers(context, usid);
    const native = await helpers.resolve();
    const record = nativeEnabled ? readRecord(native) : null;
    context.set(selectionState, { native, record, sessionId, sessionHeader });
    if (!nativeEnabled) {
        if (
            selectionConfig.qualifierKeys.some((key) => Object.hasOwn(native.assignmentQualifiers ?? {}, key)) ||
            Object.hasOwn(native.customQualifiers ?? {}, STORE_SELECTION_QUALIFIER)
        ) {
            if (
                selectionConfig.qualifierKeys.some((key) => native.assignmentQualifiers?.[key] != null) &&
                (await hasBasketItems(context))
            ) {
                throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
            }
            const cleared = await helpers.update({
                assignmentQualifiers: qualifierPatch(context, null),
                customQualifiers: { [STORE_SELECTION_QUALIFIER]: null },
            });
            if (
                selectionConfig.qualifierKeys.some((key) => Object.hasOwn(cleared.assignmentQualifiers ?? {}, key)) ||
                cleared.customQualifiers?.[STORE_SELECTION_QUALIFIER] != null
            ) {
                throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
            }
        }
        if (remembered) {
            const validated = await validateSelectedStore(context, { id: remembered.id });
            context.set(selectedStoreContext, validated);
            updateSelectedStore(context, validated);
        }
    } else if (record) {
        // Establish ownership before Store API validation can enter recovery.
        // Missing/changed mappings cannot authorize overwriting native qualifiers.
        let expected: Record<string, string | null>;
        try {
            expected = record.storeId
                ? getConfiguredMapping(context, record.storeId).assignmentQualifiers
                : qualifierPatch(context, null);
        } catch (cause) {
            throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409, { cause });
        }
        if (
            Object.entries(expected).some(
                ([key, value]) =>
                    native.assignmentQualifiers?.[key] != null && native.assignmentQualifiers[key] !== value
            )
        ) {
            throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
        }
        const matches = matchesStoreQualifiers(native, expected);
        const store = record.storeId
            ? await validateSelectedStore(
                  context,
                  { id: record.storeId },
                  {
                      useCache: matches && !isSelectionAction(request, context),
                  }
              )
            : null;
        if (store) getMapping(context, store);
        if (!matches) {
            const repaired = await helpers.update({ assignmentQualifiers: expected });
            if (!matchesStoreQualifiers(repaired, expected)) {
                throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
            }
        }
        publish(context, store, record, sessionId);
    } else if (remembered) {
        // Resolve remembered identity against current trusted store data. Cookie
        // inventory/display values can be stale and never authorize qualification.
        // Legacy/restored cookies contain no explicit-choice provenance.
        const store = await validateSelectedStore(context, { id: remembered.id }).catch((error: unknown) => {
            if (error instanceof StoreSelectionError && error.code === 'INVALID_STORE') return null;
            throw error;
        });
        if (store) {
            const expected = getMapping(context, store).assignmentQualifiers;
            if (
                Object.entries(expected).some(
                    ([key, value]) =>
                        native.assignmentQualifiers?.[key] != null && native.assignmentQualifiers[key] !== value
                )
            ) {
                throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
            }
            // A lost native lineage cannot establish a safe nonempty-basket
            // transition. The shared confirmed-change/recovery flow owns it.
            if (await hasBasketItems(context)) throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
            // The cookie match supplies preference origin only; the checks above control native repair.
            await commit(
                context,
                store,
                rememberedRecord?.storeId === store.id && rememberedRecord.sessionId === sessionId
            );
        } else {
            context.set(selectedStoreContext, null);
            updateSelectedStore(context, null);
        }
    } else {
        context.set(selectedStoreContext, null);
        // Unowned native assignment is not silently overwritten on enablement.
        if (selectionConfig.qualifierKeys.some((key) => native.assignmentQualifiers?.[key])) {
            throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
        }
    }
    return sessionHeader;
}

/** Only the explicit selection action can recover a committed store that is no longer valid. */
function isSelectionAction(request: Request, context: Context): boolean {
    if (request.method !== 'POST') return false;
    const pathname = new URL(request.url).pathname.replace(/\.data$/, '');
    const prefix = getConfig(context).url?.prefix;
    return [
        resourceRoutes.setSelectedStore,
        ...(prefix ? [`${prefix.replace(/\/+$/, '')}${resourceRoutes.setSelectedStore}`] : []),
    ].some((pattern) => matchPath(pattern, pathname) !== null);
}

export const storeSelectionMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    if ((request.method === 'GET' || request.method === 'HEAD') && isPageDesignerMode(new URL(request.url))) {
        context.set(selectedStoreContext, null);
        return next();
    }
    let sessionHeader: string | null;
    try {
        sessionHeader = await restoreStoreSelection(request, context);
    } catch (error) {
        const state = context.get(selectionState);
        if (
            error instanceof StoreSelectionError &&
            (error.code === 'INVALID_STORE' || error.code === 'INVALID_STORE_MAPPING') &&
            state?.record?.storeId &&
            isNativeStoreSelectionEnabled(getConfig(context).features.shopperContext) &&
            isSelectionAction(request, context)
        ) {
            // Do not publish an invalid selection. The explicit action validates
            // its candidate and must check the actual baskets even for a clear.
            context.set(selectionState, { ...state, requiresRecovery: true });
            context.set(selectedStoreContext, null);
            sessionHeader = state.sessionHeader;
            getLogger(context).warn('Store selection requires explicit recovery', { code: error.code });
        } else {
            const classified = getStoreSelectionFailure(error, 'STORE_CONTEXT_UNAVAILABLE');
            getLogger(context).error('Store context reconciliation failed', {
                code: classified.code,
                upstreamStatus: error instanceof ApiError ? error.status : undefined,
                actor: getAuth(context).customerId ?? 'anonymous',
                action: 'restore_store_selection',
                target: 'shopper_context',
                timestamp: new Date().toISOString(),
                outcome: 'denied',
                error,
                ...(error instanceof Error && error.cause instanceof Error ? { cause: error.cause } : {}),
            });
            const failure = Response.json(
                {
                    success: false,
                    code: classified.code,
                },
                {
                    status: classified.status,
                    headers: classified.headers,
                }
            );
            // Let React Router render its ErrorBoundary for document loads and
            // encode route errors for client navigations. Returning JSON here
            // bypasses both. Mutations retain their structured failure result.
            if (request.method === 'GET' || request.method === 'HEAD') {
                // oxlint-disable-next-line typescript/only-throw-error -- React Router consumes thrown Responses as route errors.
                throw failure;
            }
            return failure;
        }
    }
    const response = await next();
    if (sessionHeader) response.headers.append('Set-Cookie', sessionHeader);
    return response;
};

export type StoreChangeResult =
    | { success: true; selectedStoreInfo: SelectedStoreInfo | null; shoppingContext: ShoppingContext | null }
    | ConfirmedContextChangeRequired<SelectedStoreInfo>;

/** Shared selection entry point. A browser flag/token cannot bypass the confirmed-change boundary. */
export async function selectStore(context: Context, candidate: SelectedStoreInfo | null): Promise<StoreChangeResult> {
    const store = candidate ? await validateSelectedStore(context, candidate) : null;
    if (isNativeStoreSelectionEnabled(getConfig(context).features.shopperContext)) {
        qualifierPatch(context, store);
        const state = context.get(selectionState);
        const current =
            state?.requiresRecovery && state.record?.storeId
                ? { id: state.record.storeId }
                : context.get(selectedStoreContext);
        if (state?.requiresRecovery || current?.id !== store?.id) {
            if (await hasBasketItems(context)) {
                return { success: false, code: 'STORE_CHANGE_CONFIRMATION_REQUIRED', current, candidate: store };
            }
        }
        await commit(context, store, true);
    } else {
        const sessionId = context.get(selectionState)?.sessionId;
        if (!sessionId) throw new StoreSelectionError('STORE_CONTEXT_NOT_READY', 503);
        publish(
            context,
            store,
            { storeId: store?.id ?? null, revision: randomUUID(), sessionId, committedAt: new Date().toISOString() },
            sessionId
        );
    }
    // A successful explicit choice refreshes replica expiry; passive reads do not.
    context.get(selectedStoreStorageContext)?.set('refreshCookies', true);
    return { success: true, selectedStoreInfo: store, shoppingContext: context.get(shoppingContext) };
}
