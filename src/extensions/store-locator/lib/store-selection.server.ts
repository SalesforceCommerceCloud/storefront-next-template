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
import type { StoreSelectionEffects } from '@/extensions/store-locator/lib/selection-effects';
import { createContext, matchPath, type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import { createHash, randomUUID } from 'node:crypto';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { BoundedCache } from '@salesforce/storefront-next-runtime/security';
import { getScapiBaseUrl } from '@/lib/utils';
import {
    ApiError,
    AuthTokenInvalidError,
    type AuthResponse,
    type ConfirmedContextChangeRequired,
    type NativeShopperContext,
} from '@/scapi';
import { commerceContextErrorResponse, onAuthenticationChange } from '@/lib/auth/commerce-context.server';
import { commerceContextRecoveryResponse } from '@/lib/auth/commerce-context-recovery.server';
import { getAuth } from '@/middlewares/auth.server';
import { getSLASAccessTokenClaims } from '@/middlewares/auth.utils';
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
import { resourceRoutes, routes } from '@/route-paths';
import { StoreSelectionError } from '@/extensions/store-locator/lib/store-selection-error';
export { StoreSelectionError } from '@/extensions/store-locator/lib/store-selection-error';
import {
    getPreferredStoreId,
    updatePreferredStoreId,
    InvalidPreferredStoreIdError,
} from '@/extensions/store-locator/lib/api/preferred-store.server';
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
    identityEpoch?: string;
};

// Browser replicas describe preference only; they never authorize qualification or basket changes.
type SelectionRecord = {
    storeId: string | null;
    revision: string;
    sessionId?: string;
    committedAt: string;
    identityKey?: string;
    identityEpoch?: string;
    userType?: 'guest' | 'registered';
    pendingSourceBasket?: boolean;
    /** Guest intent when a new USID already owns a different native selection. */
    pendingSourceStoreId?: string | null;
};
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECORD_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PREFERENCE_COOKIE_LENGTH = 4096;

// Reserved store-owned metadata. It also records an intentional clear, so an
// old cookie cannot resurrect selection after a lost clear response.
export const STORE_SELECTION_QUALIFIER = 'sfnextStoreSelection';
export const shoppingContext = createContext<ShoppingContext | null>(null);
// Request-scoped: middleware repairs and action writes contribute to the same outcome.
const storeSelectionEffectsContext = createContext<StoreSelectionEffects>({
    storeSelection: 'unchanged',
    nativeContext: 'unchanged',
});
export function getStoreSelectionEffects(context: Context): StoreSelectionEffects {
    return context.get(storeSelectionEffectsContext);
}
function setSelectionEffects(context: Context, effects: StoreSelectionEffects) {
    context.set(storeSelectionEffectsContext, effects);
}
/** Called only after the existing middleware and resolver have established authoritative selection. */
export function getReconciledStoreSelectionEffects(
    context: Context,
    resolved: SelectedStoreInfo | null = context.get(selectedStoreContext)
): StoreSelectionEffects {
    const state = context.get(selectionState);
    if (!state || state.requiresRecovery) throw new StoreSelectionError('STORE_CONTEXT_NOT_READY', 503);
    const selected = context.get(selectedStoreContext);
    if (resolved?.id !== selected?.id || resolved?.inventoryId !== selected?.inventoryId) {
        throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
    }
    const feature = getConfig(context).features.shopperContext;
    return {
        storeSelection: 'reconciled',
        nativeContext:
            isNativeStoreSelectionEnabled(feature) || feature.storeSelection?.cleanup
                ? 'reconciled'
                : getStoreSelectionEffects(context).nativeContext,
    };
}
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

// Stable through token refresh; never serialize a customer ID or credential.
function identityKey(context: Context): string {
    const { customerId, userType } = getAuth(context);
    return createHash('sha256')
        .update(JSON.stringify([customerId, userType]))
        .digest('hex');
}

function selectionRecord(context: Context, store: SelectedStoreInfo | null, explicit: boolean): SelectionRecord {
    const state = context.get(selectionState);
    const key = identityKey(context);
    return {
        storeId: store?.id ?? null,
        revision: randomUUID(),
        committedAt: new Date().toISOString(),
        ...(explicit ? { sessionId: state?.sessionId } : {}),
        identityKey: key,
        userType: getAuth(context).userType,
        identityEpoch: state?.record?.identityKey === key ? (state.record.identityEpoch ?? randomUUID()) : randomUUID(),
    };
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
            (record.sessionId !== undefined && typeof record.sessionId !== 'string') ||
            (record.identityKey !== undefined && typeof record.identityKey !== 'string') ||
            (record.identityEpoch !== undefined && typeof record.identityEpoch !== 'string') ||
            (record.userType !== undefined && !['guest', 'registered'].includes(record.userType)) ||
            (record.pendingSourceBasket !== undefined && typeof record.pendingSourceBasket !== 'boolean') ||
            (record.pendingSourceStoreId !== undefined &&
                record.pendingSourceStoreId !== null &&
                !parseSelectedStore({ id: record.pendingSourceStoreId }))
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
        identityEpoch: record.identityEpoch,
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
    const record = selectionRecord(context, store, explicit);
    const body = {
        assignmentQualifiers: qualifierPatch(context, store),
        customQualifiers: { [STORE_SELECTION_QUALIFIER]: JSON.stringify(record) },
    };
    const { usid } = getAuth(context);
    if (!usid) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
    setSelectionEffects(context, { storeSelection: 'unknown', nativeContext: 'unknown' });
    const native = await getShopperContextHelpers(context, usid).update(body);
    if (
        native.customQualifiers?.[STORE_SELECTION_QUALIFIER] !== JSON.stringify(record) ||
        !matchesStoreQualifiers(native, body.assignmentQualifiers)
    ) {
        throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
    }
    setSelectionEffects(context, { storeSelection: 'unknown', nativeContext: 'committed' });
    // Native success precedes both the compatible cookie and the active UI state.
    context.set(selectionState, { ...state, native, record, requiresRecovery: false });
    publish(context, store, record, state.sessionId);
    setSelectionEffects(context, { storeSelection: 'committed', nativeContext: 'committed' });
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
                  if (getConfig(context).features.localInventory?.enabled) throw error;
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
        if (record.identityKey && record.identityKey !== identityKey(context)) {
            await reconcileStoreAfterAuthentication(context);
            return sessionHeader;
        }
        if (remembered || validated || rememberedRecord) publish(context, validated, record, sessionId);
        return sessionHeader;
    }
    const selectionConfig = getSelectionConfig(context);
    const { usid } = getAuth(context);
    if (!usid) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
    const helpers = getShopperContextHelpers(context, usid);
    let native = await helpers.resolve();
    const nativeRecord = nativeEnabled ? readRecord(native) : null;
    // Older deployments may have persisted the source-basket barrier only in
    // the replica. A matching lineage may retain a denial, never authorize a
    // write or override a newer native selection.
    const record =
        nativeRecord &&
        rememberedRecord?.pendingSourceBasket &&
        rememberedRecord.revision === nativeRecord.revision &&
        rememberedRecord.storeId === nativeRecord.storeId &&
        rememberedRecord.identityKey === nativeRecord.identityKey
            ? { ...nativeRecord, pendingSourceBasket: true }
            : nativeRecord;
    context.set(selectionState, { native, record, sessionId, sessionHeader });
    if (record?.pendingSourceBasket && record.pendingSourceStoreId !== undefined) {
        // The new USID's native selection and the guest source are distinct.
        // Keep native ownership intact and retain only source intent for logout;
        // resuming this transfer belongs to confirmed-change recovery.
        context.set(selectionState, {
            native,
            record: { ...record, storeId: record.pendingSourceStoreId },
            sessionId,
            sessionHeader,
        });
        throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
    }
    if (
        nativeRecord &&
        rememberedRecord?.pendingSourceBasket &&
        rememberedRecord.identityKey !== identityKey(context) &&
        rememberedRecord.revision !== nativeRecord.revision
    ) {
        // A provider can return another USID with existing native lineage. Its
        // record cannot prove that this source basket was transferred/confirmed.
        // Retain guest intent for logout, but never replace native qualification
        // or serve commerce on the strength of that unrelated native revision.
        context.set(selectionState, { native, record: rememberedRecord, sessionId, sessionHeader });
        throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
    }
    const priorRecord = record ?? rememberedRecord;
    // Draining store-owned native state must precede identity reconciliation:
    // off-mode reconciliation only publishes preference replicas.
    if (!nativeEnabled) {
        if (
            selectionConfig.qualifierKeys.some((key) => Object.hasOwn(native.assignmentQualifiers ?? {}, key)) ||
            Object.hasOwn(native.customQualifiers ?? {}, STORE_SELECTION_QUALIFIER)
        ) {
            if (
                selectionConfig.qualifierKeys.some((key) => native.assignmentQualifiers?.[key] != null) &&
                (readRecord(native)?.pendingSourceBasket ||
                    rememberedRecord?.pendingSourceBasket ||
                    (await hasBasketItems(context)))
            ) {
                throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
            }
            setSelectionEffects(context, { storeSelection: 'unknown', nativeContext: 'unknown' });
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
            native = cleared;
            setSelectionEffects(context, { storeSelection: 'committed', nativeContext: 'committed' });
        }
    }
    if (priorRecord?.identityKey && priorRecord.identityKey !== identityKey(context)) {
        context.set(selectionState, { native, record: priorRecord, sessionId, sessionHeader });
        await reconcileStoreAfterAuthentication(context);
        return sessionHeader;
    }
    if (!nativeEnabled) {
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
            setSelectionEffects(context, { storeSelection: 'unknown', nativeContext: 'unknown' });
            const repaired = await helpers.update({ assignmentQualifiers: expected });
            if (!matchesStoreQualifiers(repaired, expected)) {
                throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
            }
            setSelectionEffects(context, { storeSelection: 'unknown', nativeContext: 'committed' });
        }
        publish(context, store, record, sessionId);
        if (!matches) setSelectionEffects(context, { storeSelection: 'committed', nativeContext: 'committed' });
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
    return isActionRoute(request, context, resourceRoutes.setSelectedStore);
}

function isActionRoute(request: Request, context: Context, route: string): boolean {
    if (request.method !== 'POST') return false;
    const pathname = new URL(request.url).pathname.replace(/\.data$/, '');
    const prefix = getConfig(context).url?.prefix;
    return [route, ...(prefix ? [`${prefix.replace(/\/+$/, '')}${route}`] : [])].some(
        (pattern) => matchPath(pattern, pathname) !== null
    );
}

export const storeSelectionMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    if ((request.method === 'GET' || request.method === 'HEAD') && isPageDesignerMode(new URL(request.url))) {
        context.set(selectedStoreContext, null);
        return next();
    }
    const loggingOut = isActionRoute(request, context, routes.logout);
    let sessionHeader: string | null;
    try {
        sessionHeader = await restoreStoreSelection(request, context);
    } catch (error) {
        const state = context.get(selectionState);
        if (loggingOut) {
            // Keep logout available during failed/pending reconciliation. Prefer
            // native intent when it was readable; validate it as a fresh guest.
            let intent = state?.record;
            if (!intent) {
                try {
                    intent = readRecord(state?.native ?? {});
                } catch {
                    // Unreadable metadata must not prevent session destruction.
                }
            }
            const id = intent
                ? intent.pendingSourceStoreId !== undefined
                    ? intent.pendingSourceStoreId
                    : intent.storeId
                : context.get(selectedStoreContext)?.id;
            const record = selectionRecord(context, id ? { id } : null, false);
            context.get(selectedStoreStorageContext)?.set('selectionRecord', JSON.stringify(record));
            context.set(shoppingContext, null);
            if (state) context.set(selectionState, { ...state, native: {}, record });
            sessionHeader = state?.sessionHeader ?? null;
        } else if (
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
            const documentRequest = request.method === 'GET' || request.method === 'HEAD';
            const failureError =
                error instanceof StoreSelectionError
                    ? error
                    : new StoreSelectionError(classified.code, classified.status);
            const failure = documentRequest
                ? commerceContextRecoveryResponse(failureError, context)
                : commerceContextErrorResponse(failureError);
            for (const [name, value] of Object.entries(classified.headers)) failure.headers.set(name, value);
            // Let React Router render its ErrorBoundary for document loads and
            // encode route errors for client navigations. Returning JSON here
            // bypasses both. Mutations retain their structured failure result.
            if (documentRequest) {
                // oxlint-disable-next-line typescript/only-throw-error -- React Router consumes thrown Responses as route errors.
                throw failure;
            }
            return failure;
        }
    }
    onAuthenticationChange(context, () => {
        context.set(shoppingContext, null);
        const state = context.get(selectionState);
        if (state) context.set(selectionState, { ...state, native: {} });
    });
    const response = await next();
    if (sessionHeader) response.headers.append('Set-Cookie', sessionHeader);
    return response;
};

export type StoreChangeResult =
    | { success: true; selectedStoreInfo: SelectedStoreInfo | null; shoppingContext: ShoppingContext | null }
    | ConfirmedContextChangeRequired<SelectedStoreInfo>;

/** Shared selection entry point. A browser flag/token cannot bypass the confirmed-change boundary. */
export async function selectStore(context: Context, candidate: SelectedStoreInfo | null): Promise<StoreChangeResult> {
    return applyStoreSelection(context, candidate, true);
}

async function applyStoreSelection(
    context: Context,
    candidate: SelectedStoreInfo | null,
    explicit: boolean,
    authentication?: { sourceHasItems: boolean }
): Promise<StoreChangeResult> {
    const store = candidate ? await validateSelectedStore(context, candidate) : null;
    const enabled = isNativeStoreSelectionEnabled(getConfig(context).features.shopperContext);
    const state = context.get(selectionState);
    const current = state?.record?.storeId ? { id: state.record.storeId } : context.get(selectedStoreContext);
    if (enabled) qualifierPatch(context, store);
    const requiresNativeRepair =
        enabled &&
        authentication &&
        store &&
        !Object.entries(qualifierPatch(context, store)).every(
            ([key, value]) => state?.native.assignmentQualifiers?.[key] === value
        );
    if (enabled || authentication) {
        if (state?.requiresRecovery || current?.id !== store?.id || requiresNativeRepair) {
            if (authentication?.sourceHasItems || (await hasBasketItems(context))) {
                return { success: false, code: 'STORE_CHANGE_CONFIRMATION_REQUIRED', current, candidate: store };
            }
        }
    }
    if (enabled) {
        await commit(context, store, explicit);
    } else {
        const sessionId = context.get(selectionState)?.sessionId;
        if (!sessionId) throw new StoreSelectionError('STORE_CONTEXT_NOT_READY', 503);
        const record = selectionRecord(context, store, explicit);
        setSelectionEffects(context, { ...getStoreSelectionEffects(context), storeSelection: 'unknown' });
        publish(context, store, record, sessionId);
        setSelectionEffects(context, { ...getStoreSelectionEffects(context), storeSelection: 'committed' });
        if (state) context.set(selectionState, { ...state, record });
    }
    // A successful explicit choice refreshes replica expiry; passive reads do not.
    if (explicit) context.get(selectedStoreStorageContext)?.set('refreshCookies', true);
    return { success: true, selectedStoreInfo: store, shoppingContext: context.get(shoppingContext) };
}

/** Capture source baskets before exchanging credentials; cookies alone cannot prove an empty basket. */
export async function prepareStoreSelectionForLogin(context: Context): Promise<boolean> {
    const state = context.get(selectionState);
    if (!state) return false;
    // Email/password updates can invalidate the registered credential before
    // background reauthentication starts. Only a guest source basket becomes
    // inaccessible after exchange; registered baskets are checked with the new
    // credential during reconciliation. Retain any already-pending guest guard.
    if (getAuth(context).userType === 'registered') return state.record?.pendingSourceBasket === true;
    const store = context.get(selectedStoreContext);
    // A failed exchange leaves a readable guest basket. Recheck it so an emptied
    // cart can clear the old barrier rather than latching it across login attempts.
    const sourceHasItems = await hasBasketItems(context);
    const record = {
        ...(state.record ?? selectionRecord(context, store, false)),
        identityKey: identityKey(context),
        userType: getAuth(context).userType,
        pendingSourceBasket: sourceHasItems || undefined,
        pendingSourceStoreId: undefined,
    };
    if (
        (sourceHasItems || state.record?.pendingSourceBasket) &&
        isNativeStoreSelectionEnabled(getConfig(context).features.shopperContext)
    ) {
        const { usid } = getAuth(context);
        if (!usid) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
        // Persist the barrier while the guest basket is still readable. If this
        // write fails, credentials have not been exchanged and retry can inspect
        // that basket again. Never publish qualification or a different store here.
        const rawRecord = JSON.stringify(record);
        const native = await getShopperContextHelpers(context, usid).update({
            customQualifiers: { [STORE_SELECTION_QUALIFIER]: rawRecord },
        });
        if (native.customQualifiers?.[STORE_SELECTION_QUALIFIER] !== rawRecord) {
            throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
        }
        context.set(selectionState, { ...state, native, record });
    } else {
        context.set(selectionState, { ...state, record });
    }
    context.get(selectedStoreStorageContext)?.set('selectionRecord', JSON.stringify(record));
    return sourceHasItems;
}

/** Reject an unsupported session migration before registered credentials can be published. */
export function assertStoreSelectionLoginSession(
    context: Context,
    response: AuthResponse,
    sourceHasItems: boolean
): void {
    if (!sourceHasItems) return;
    // Match updateAuth's JWT-derived identity, not the token response's optional top-level USID.
    const { usid } = getSLASAccessTokenClaims(response.access_token);
    if (!usid || usid !== getAuth(context).usid) {
        // The source guard is owned by the old USID. Without durable cross-session
        // recovery, a failed destination write plus cookie loss could erase it.
        // Keep the existing identity and native guard until shared recovery can
        // safely move the basket; preference cookies cannot authorize that move.
        throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
    }
}

/**
 * Reconcile active selection after an identity change, before transfer/calculation.
 * A failed read remains retryable on the next request via the prior identity record.
 * The only account write is seeding the default from a guest's explicit pick when the account has
 * none; an existing default is never replaced, and a failed seed never fails login.
 */
export async function reconcileStoreAfterAuthentication(context: Context, sourceHasItems = false): Promise<void> {
    const state = context.get(selectionState);
    if (!state) return;
    sourceHasItems ||= state.record?.pendingSourceBasket === true;
    context.set(shoppingContext, null);
    if (isNativeStoreSelectionEnabled(getConfig(context).features.shopperContext)) {
        const { usid } = getAuth(context);
        if (!usid) throw new StoreSelectionError('STORE_CONTEXT_AUTH_REQUIRED', 401);
        const native = await getShopperContextHelpers(context, usid).resolve();
        const nativeRecord = readRecord(native);
        if (nativeRecord?.pendingSourceBasket && nativeRecord.pendingSourceStoreId !== undefined) {
            throw new StoreSelectionError('STORE_CHANGE_CONFIRMATION_REQUIRED', 409);
        }
        // Only native-owned, configured assignments may be replaced. Authentication
        // never authorizes overwriting an unrelated or conflicting qualification.
        const expected = nativeRecord?.storeId
            ? getConfiguredMapping(context, nativeRecord.storeId).assignmentQualifiers
            : qualifierPatch(context, null);
        if (
            Object.entries(expected).some(
                ([key, value]) =>
                    native.assignmentQualifiers?.[key] != null && native.assignmentQualifiers[key] !== value
            )
        ) {
            throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
        }
        context.set(selectionState, { ...state, native });
        // The source guest basket can become inaccessible with the new credential.
        // Persist only its guard, before any profile read can fail. This metadata
        // never permits a store transition or replaces a preview/consent record.
        const separateSource = nativeRecord && nativeRecord.revision !== state.record?.revision;
        if (sourceHasItems && state.record && (!nativeRecord?.pendingSourceBasket || separateSource)) {
            // A different USID can already own another selection. Its record
            // must continue describing its actual native qualifiers, while the
            // guest source remains a separate, denial-only recovery barrier.
            const guardRecord =
                nativeRecord && separateSource
                    ? { ...nativeRecord, pendingSourceBasket: true, pendingSourceStoreId: state.record.storeId }
                    : { ...state.record, pendingSourceBasket: true };
            const encoded = JSON.stringify(guardRecord);
            const guarded = await getShopperContextHelpers(context, usid).update({
                customQualifiers: {
                    [STORE_SELECTION_QUALIFIER]: encoded,
                },
            });
            if (guarded.customQualifiers?.[STORE_SELECTION_QUALIFIER] !== encoded) {
                throw new StoreSelectionError('NATIVE_STORE_CONTEXT_CONFLICT', 409);
            }
        }
    }
    let candidate = state.record?.storeId ? { id: state.record.storeId } : null;
    const explicit = state.record?.userType === 'guest' && state.record.sessionId === state.sessionId;
    const sameRegisteredIdentity =
        state.record?.userType === 'registered' && state.record.identityKey === identityKey(context);
    if (getAuth(context).userType === 'registered' && !explicit && !sameRegisteredIdentity) {
        let id: string | null;
        try {
            id = await getPreferredStoreId(context);
        } catch (cause) {
            if (cause instanceof InvalidPreferredStoreIdError) id = null;
            else throw new StoreSelectionError('ACCOUNT_DEFAULT_UNAVAILABLE', 503, { cause });
        }
        candidate = id ? parseSelectedStore({ id }) : null;
    }
    if (candidate) {
        try {
            candidate = await validateSelectedStore(context, candidate);
        } catch (error) {
            if (error instanceof StoreSelectionError && error.code === 'INVALID_STORE') candidate = null;
            else throw error;
        }
    }
    const retainExplicit = explicit || (sameRegisteredIdentity && state.record?.sessionId === state.sessionId);
    const result = await applyStoreSelection(context, candidate, retainExplicit, { sourceHasItems });
    if (!result.success) throw new StoreSelectionError(result.code, 409, { change: result });
    if (explicit && candidate && getAuth(context).userType === 'registered') {
        await seedAccountDefault(context, candidate.id);
    }
}

/** Save a guest's explicit pick as the account default only when the account has none. Best effort. */
async function seedAccountDefault(context: Context, storeId: string): Promise<void> {
    try {
        if ((await getPreferredStoreId(context)) != null) return;
        await updatePreferredStoreId(context, storeId);
    } catch (error) {
        if (error instanceof Error && error.name === 'AuthTokenInvalidError') throw error;
        getLogger(context).warn('Account default seeding skipped', { error });
    }
}

/** Retain only the validated store intent; a fresh guest must not inherit registered provenance. */
export function prepareStoreSelectionForLogout(context: Context): void {
    const state = context.get(selectionState);
    if (state?.record) {
        const record = {
            ...state.record,
            sessionId: undefined,
            identityKey: identityKey(context),
            userType: getAuth(context).userType,
            // The logout action also destroys auth/basket state. Carry only
            // store intent into the fresh guest, never its old transfer barrier.
            pendingSourceBasket: undefined,
            pendingSourceStoreId: undefined,
        };
        context.set(selectionState, { ...state, native: {}, record });
        context.get(selectedStoreStorageContext)?.set('selectionRecord', JSON.stringify(record));
    }
    context.set(shoppingContext, null);
}
