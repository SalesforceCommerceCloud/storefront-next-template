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
import { getLogger } from '@/lib/logger.server';
import type { Route } from './+types/action.set-selected-store';
import {
    parseSelectedStore,
    getStoreSelectionFailure,
    selectStore,
    StoreSelectionError,
} from '@/extensions/store-locator/lib/store-selection.server';

/** Select, change or clear through the shared service; only native success publishes cookies. */
export const action = async ({ request, context }: Route.ActionArgs) => {
    if (request.method !== 'POST') return data({ success: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
    const formData = await request.formData();
    const raw = formData.get('storeInfo');
    if (typeof raw !== 'string') return data({ success: false, code: 'STORE_INFO_REQUIRED' }, { status: 400 });
    try {
        let candidate = null;
        if (raw) {
            const parsed: unknown = JSON.parse(raw);
            candidate = parseSelectedStore(parsed);
            if (!candidate) throw new StoreSelectionError('INVALID_STORE');
            // Reject a submitted mismatched inventory instead of silently trusting it.
            if (parsed && typeof parsed === 'object' && 'inventoryId' in parsed) {
                if (typeof parsed.inventoryId !== 'string') throw new StoreSelectionError('INVALID_STORE_INVENTORY');
                candidate.inventoryId = parsed.inventoryId;
            }
        }
        const result = await selectStore(context, candidate);
        return data(result, { status: result.success ? 200 : 409 });
    } catch (error) {
        const failure = getStoreSelectionFailure(error);
        getLogger(context).error('Store selection failed', { error, code: failure.code });
        return data({ success: false, code: failure.code }, { status: failure.status, headers: failure.headers });
    }
};
