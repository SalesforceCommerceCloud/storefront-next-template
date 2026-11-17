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
import { data } from 'react-router';
import { containMutationTransport } from '@/lib/mutation-transport';
import { getLogger } from '@/lib/logger.server';
import { getTrustedProxyPublicOrigin } from '@/lib/origin';
import type { Route } from './+types/action.set-selected-store';
import {
    parseSelectedStore,
    getStoreSelectionFailure,
    selectStore,
    StoreSelectionError,
} from '@/extensions/store-locator/lib/store-selection.server';
import {
    invalidateSelectedStoreResolution,
    resolveSelectedStore,
} from '@/extensions/store-locator/lib/resolve-selected-store.server';
import { updatePreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { getAuth } from '@/middlewares/auth.server';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

/** Same-origin check pinned to the trusted public origin; unlike the shared helper it ignores spoofable forwarded hosts outside production. */
function isTrustedSameOrigin(request: Request): boolean {
    try {
        const requestOrigin = new URL(request.url).origin;
        const trusted = new URL(getTrustedProxyPublicOrigin(request) ?? request.url).origin;
        const source = request.headers.get('origin') ?? request.headers.get('referer');
        if (!source) return false;
        const sourceOrigin = new URL(source).origin;
        return sourceOrigin === trusted || sourceOrigin === requestOrigin;
    } catch {
        return false;
    }
}

function isValidStoreId(id: unknown): id is string {
    return (
        typeof id === 'string' &&
        !!id.trim() &&
        id.length <= 256 &&
        !/[,{}[\]]/.test(id) &&
        !Array.from(id).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    );
}

// oxlint-disable-next-line no-restricted-exports -- AGENTS.md permits this single-call transport-only boundary.
export const clientAction = ({ serverAction }: Route.ClientActionArgs) => containMutationTransport(serverAction);

/**
 * POST an explicit `intent`: `set` (one opaque `storeId`), `clear`, or read-only `reconcile`.
 * Display/inventory metadata always come from the server. Set and clear go through the shared
 * `selectStore` service, so a change that needs shopper confirmation (basket has items) is
 * answered with 409 `STORE_CHANGE_CONFIRMATION_REQUIRED`. The legacy `storeInfo` JSON field is
 * still accepted and routed through the same service.
 */
export const action = async ({ request, context }: Route.ActionArgs) => {
    const failure = (code: string, status: number, headers?: HeadersInit) =>
        data({ success: false as const, code, error: code }, { status, headers });
    if (request.method !== 'POST') {
        return failure('METHOD_NOT_ALLOWED', 405, { Allow: 'POST' });
    }
    if (!isTrustedSameOrigin(request)) return failure('FORBIDDEN_ORIGIN', 403);
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return failure('INVALID_FORM', 400);
    }
    const intents = formData.getAll('intent');
    const ids = formData.getAll('storeId');
    const legacy = formData.get('storeInfo');
    try {
        let candidate: SelectedStoreInfo | null;
        if (intents.length === 0 && typeof legacy === 'string') {
            candidate = null;
            if (legacy) {
                const parsed: unknown = JSON.parse(legacy);
                candidate = parseSelectedStore(parsed);
                if (!candidate) throw new StoreSelectionError('INVALID_STORE');
                // Reject a submitted mismatched inventory instead of silently trusting it.
                if (parsed && typeof parsed === 'object' && 'inventoryId' in parsed) {
                    if (typeof parsed.inventoryId !== 'string') {
                        throw new StoreSelectionError('INVALID_STORE_INVENTORY');
                    }
                    candidate.inventoryId = parsed.inventoryId;
                }
            }
        } else {
            const intent = intents[0];
            if (intents.length !== 1 || (intent !== 'set' && intent !== 'clear' && intent !== 'reconcile')) {
                return failure('INVALID_INTENT', 400);
            }
            if (intent !== 'set' && ids.length !== 0) return failure('INVALID_STORE_ID', 400);
            if (intent === 'reconcile') {
                invalidateSelectedStoreResolution(context);
                const result = await resolveSelectedStore(context);
                if (result.error || result.authError) return failure('RESOLUTION_FAILED', 503);
                return data({ success: true as const, selectedStoreInfo: result.selectedStoreInfo });
            }
            if (intent === 'set' && (ids.length !== 1 || !isValidStoreId(ids[0]))) {
                return failure('INVALID_STORE_ID', 400);
            }
            candidate = intent === 'set' ? { id: ids[0] as string } : null;
        }
        const result = await selectStore(context, candidate);
        if (result.success && getAuth(context).userType === 'registered') {
            // Explicit account-default persistence is separate from selection and runs only after
            // selectStore accepts the change, so the 409 basket-consent guard is never bypassed.
            try {
                await updatePreferredStoreId(context, candidate?.id ?? null);
            } catch (error) {
                if (error instanceof Error && error.name === 'AuthTokenInvalidError') throw error;
                invalidateSelectedStoreResolution(context);
                getLogger(context).error('SetSelectedStore: account default persistence failed', { error });
                return failure('PREFERRED_STORE_PERSISTENCE_FAILED', 502);
            }
        }
        invalidateSelectedStoreResolution(context);
        return data(result, { status: result.success ? 200 : 409 });
    } catch (error) {
        // The SDK also records a request-local auth error. Keep both recovery signals intact.
        if (error instanceof Error && error.name === 'AuthTokenInvalidError') throw error;
        const code = getStoreSelectionFailure(error);
        getLogger(context).error('Store selection failed', { error, code: code.code });
        return failure(code.code, code.status, code.headers);
    }
};
