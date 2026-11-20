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
import { describe, expect, it } from 'vitest';
import { toPublicShoppingContext, toPublicStoreChangeResult } from './public-selection';
import type { ShoppingContext } from './store-selection.server';

const internal: ShoppingContext = {
    siteId: 'site',
    preparingStoreId: 'B',
    inventoryId: 'IB',
    contextRevision: 'revision',
    selectionOrigin: 'explicit',
    committedAt: '2026-11-19T00:00:00Z',
    explicitChoiceSessionId: 'private-marker',
    identityEpoch: 'private-identity',
};

describe('public selection response', () => {
    it('keeps public context metadata without preference-session or identity internals', () => {
        expect(toPublicShoppingContext(internal)).toEqual({
            siteId: 'site',
            preparingStoreId: 'B',
            inventoryId: 'IB',
            contextRevision: 'revision',
            selectionOrigin: 'explicit',
            committedAt: '2026-11-19T00:00:00Z',
        });
        expect(toPublicShoppingContext(null)).toBeNull();
    });
    it('projects success and refusal explicitly without leaking additional server fields', () => {
        const result = toPublicStoreChangeResult({
            success: true,
            selectedStoreInfo: { id: 'B', inventoryId: 'IB' },
            shoppingContext: internal,
        });
        expect(JSON.stringify(result)).not.toContain('private-');
        expect(result).toMatchObject({
            success: true,
            selectedStoreInfo: { id: 'B' },
            shoppingContext: { contextRevision: 'revision' },
        });
        expect(
            toPublicStoreChangeResult({
                success: false,
                code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
                current: null,
                candidate: { id: 'B' },
            })
        ).toEqual({
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            current: null,
            candidate: { id: 'B' },
        });
    });
});
