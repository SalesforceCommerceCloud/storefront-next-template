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
import { data, type RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { isNativeStoreSelectionEnabled } from '@/lib/shopper-context/store-selection';

/**
 * Reject legacy fulfillment switches while native context is enabled. Adds may
 * pass a pickup store ID to allow the already committed store; inventory is
 * still validated by the caller before any shipment or item write.
 */
export function rejectUnconfirmedStoreChange(context: Readonly<RouterContextProvider>, pickupStoreId?: string) {
    if (!isNativeStoreSelectionEnabled(getConfig(context).features.shopperContext)) return null;
    if (pickupStoreId !== undefined && context.get(selectedStoreContext)?.id === pickupStoreId) return null;
    getLogger(context).warn('Native fulfillment change requires confirmation', {
        actor: getAuth(context).customerId ?? 'anonymous',
        action: 'change_fulfillment',
        target: 'shopper_context',
        timestamp: new Date().toISOString(),
        outcome: 'denied',
        reason: 'confirmation_required',
    });
    return data(
        {
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            error: createActionError({ code: ErrorCode.CONFLICT, message: 'Store changes require confirmation.' }),
        },
        { status: 409 }
    );
}
