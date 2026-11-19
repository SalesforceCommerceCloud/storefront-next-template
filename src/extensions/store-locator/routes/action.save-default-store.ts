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
import type { Route } from './+types/action.save-default-store';
import { isTrustedSameOrigin, isValidStoreId } from '@/extensions/store-locator/lib/trusted-same-origin.server';
import { lookupStoreFresh, rememberStoreMetadata } from '@/extensions/store-locator/lib/resolve-selected-store.server';
import { getPreferredStoreId, updatePreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { getAuth } from '@/middlewares/auth.server';

// oxlint-disable-next-line no-restricted-exports -- AGENTS.md permits this single-call transport-only boundary.
export const clientAction = ({ serverAction }: Route.ClientActionArgs) => containMutationTransport(serverAction);

/**
 * POST one `storeId` to save it as the registered shopper's account default store.
 * Independent of the active selection: never calls `selectStore` and never touches the
 * selection cookie, basket, prices or fulfillment. The success response carries the id read
 * back from the profile, so a client never reports a save the profile does not reflect.
 *
 * Failure codes: 403 `FORBIDDEN_ORIGIN`, 401 `SIGN_IN_REQUIRED` (guests), 400 `INVALID_STORE_ID`,
 * 404 `STORE_NOT_FOUND`, 422 `STORE_NOT_ELIGIBLE` (exists but not pickup-capable), 502 `DEFAULT_SAVE_FAILED`.
 */
export const action = async ({ request, context }: Route.ActionArgs) => {
    const failure = (code: string, status: number, headers?: HeadersInit) =>
        data({ success: false as const, code, error: code }, { status, headers });
    if (request.method !== 'POST') return failure('METHOD_NOT_ALLOWED', 405, { Allow: 'POST' });
    if (!isTrustedSameOrigin(request)) return failure('FORBIDDEN_ORIGIN', 403);
    if (getAuth(context).userType !== 'registered') return failure('SIGN_IN_REQUIRED', 401);
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return failure('INVALID_FORM', 400);
    }
    const ids = formData.getAll('storeId');
    if (ids.length !== 1 || !isValidStoreId(ids[0])) return failure('INVALID_STORE_ID', 400);
    const storeId = ids[0];
    try {
        const { store, eligible } = await lookupStoreFresh(context, storeId);
        if (!store) return failure('STORE_NOT_FOUND', 404);
        if (!eligible) return failure('STORE_NOT_ELIGIBLE', 422);
        // Last write wins: the client serializes saves, but concurrent requests (two tabs) are not ordered here.
        await updatePreferredStoreId(context, storeId);
        // Profile reads can briefly lag a PATCH; a mismatch is reported as a failure and the shopper can retry.
        const saved = await getPreferredStoreId(context);
        if (saved !== storeId) {
            getLogger(context).error('SaveDefaultStore: readback mismatch');
            return failure('DEFAULT_SAVE_FAILED', 502);
        }
        // Warm the metadata cache so the account loader's default-store lookup skips a second getStores call.
        rememberStoreMetadata(context, store);
        return data({ success: true as const, preferredStoreId: saved });
    } catch (error) {
        if (error instanceof Error && error.name === 'AuthTokenInvalidError') throw error;
        getLogger(context).error('SaveDefaultStore: failed', { error });
        return failure('DEFAULT_SAVE_FAILED', 502);
    }
};
