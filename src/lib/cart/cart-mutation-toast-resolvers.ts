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

/**
 * Pure mappings from a settled cart-mutation response to the toast it should show. Extracted so the exact
 * same copy fires whether the response settles into its own mounted line item (the in-panel case) or is
 * handed off to the root-mounted `CartMutationToastWatcher` after the drawer closed mid-mutation (the
 * close-flush case). One source of truth per flow — no second, drifting message table in the watcher.
 */
import type { TFunction } from 'i18next';

import { ErrorCode } from '@/lib/error-codes';

/** The subset of a basket-action response the toast copy depends on. Both routes wrap errors as `{ error }`. */
interface CartMutationResult {
    success?: boolean;
    error?: { code?: string };
}

/** A resolved toast: the translated message plus its sonner variant. */
export interface CartMutationToast {
    message: string;
    type: 'success' | 'error';
}

/**
 * The toast for a quantity update. Success confirms; a stock rejection (`OUT_OF_STOCK`) tells the shopper
 * specifically to lower the quantity, and any other failure falls back to the generic update-failed copy.
 */
export function resolveQuantityUpdateToast(
    data: CartMutationResult,
    t: TFunction<'quantitySelector'>
): CartMutationToast {
    if (data.success) {
        return { message: t('quantityUpdated'), type: 'success' };
    }
    const message = data.error?.code === ErrorCode.OUT_OF_STOCK ? t('insufficientStock') : t('quantityUpdateFailed');
    return { message, type: 'error' };
}

/** The toast for a line-item removal: confirm on success, generic failure notice otherwise. */
export function resolveRemoveItemToast(data: CartMutationResult, t: TFunction<'removeItem'>): CartMutationToast {
    return data.success ? { message: t('success'), type: 'success' } : { message: t('failed'), type: 'error' };
}
