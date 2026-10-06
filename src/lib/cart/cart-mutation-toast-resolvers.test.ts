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

import type { TFunction } from 'i18next';
import { describe, expect, test } from 'vitest';

import { ErrorCode } from '@/lib/error-codes';
import { resolveQuantityUpdateToast, resolveRemoveItemToast } from './cart-mutation-toast-resolvers';

// Identity stand-in for t(): returns the key so these tests assert branch selection, not locale copy.
const t = ((key: string) => key) as unknown as TFunction<'quantitySelector'> & TFunction<'removeItem'>;

describe('resolveQuantityUpdateToast', () => {
    test('confirms a successful quantity update', () => {
        expect(resolveQuantityUpdateToast({ success: true }, t)).toEqual({
            message: 'quantityUpdated',
            type: 'success',
        });
    });

    test('gives the stock-specific message when the server rejects with OUT_OF_STOCK', () => {
        expect(resolveQuantityUpdateToast({ success: false, error: { code: ErrorCode.OUT_OF_STOCK } }, t)).toEqual({
            message: 'insufficientStock',
            type: 'error',
        });
    });

    test('falls back to the generic failure message for any other error code', () => {
        expect(resolveQuantityUpdateToast({ success: false, error: { code: 'SOMETHING_ELSE' } }, t)).toEqual({
            message: 'quantityUpdateFailed',
            type: 'error',
        });
    });

    test('falls back to the generic failure message when no error code is present', () => {
        expect(resolveQuantityUpdateToast({ success: false }, t)).toEqual({
            message: 'quantityUpdateFailed',
            type: 'error',
        });
    });
});

describe('resolveRemoveItemToast', () => {
    test('confirms a successful removal', () => {
        expect(resolveRemoveItemToast({ success: true }, t)).toEqual({ message: 'success', type: 'success' });
    });

    test('reports a failed removal', () => {
        expect(resolveRemoveItemToast({ success: false }, t)).toEqual({ message: 'failed', type: 'error' });
    });
});
