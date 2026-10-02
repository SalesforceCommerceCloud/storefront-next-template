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

import { describe, expect, it } from 'vitest';
import { getOrderReturnStatusFromReturns } from './order-return-status';
import type { ReturnRequest } from './types';

const request = (status: ReturnRequest['status'], quantities: number[], action: 'return' | 'exchange' = 'return') =>
    ({
        status,
        items: quantities.map((quantity) => ({ quantity, action })),
    }) as Pick<ReturnRequest, 'items' | 'status'>;

describe('getOrderReturnStatusFromReturns', () => {
    it('is undefined for an order with no returns', () => {
        expect(getOrderReturnStatusFromReturns([], 3)).toBeUndefined();
    });

    it('reports an open return as initiated, partial when it covers only some units', () => {
        expect(getOrderReturnStatusFromReturns([request('approved', [1, 1, 1])], 3)).toBe('RETURN_INITIATED');
        expect(getOrderReturnStatusFromReturns([request('submitted', [1])], 3)).toBe('PARTIAL_RETURN_INITIATED');
    });

    it('reports a finished return as complete, partial when it covers only some units', () => {
        expect(getOrderReturnStatusFromReturns([request('refunded', [1, 1, 1])], 3)).toBe('RETURN_COMPLETE');
        expect(getOrderReturnStatusFromReturns([request('refunded', [1])], 3)).toBe('PARTIAL_RETURN_COMPLETE');
    });

    it('treats a shipped exchange as finished, and an exchange not yet shipped as open', () => {
        expect(getOrderReturnStatusFromReturns([request('exchange_shipped', [2], 'exchange')], 2)).toBe(
            'RETURN_COMPLETE'
        );
        expect(getOrderReturnStatusFromReturns([request('received', [2], 'exchange')], 2)).toBe('RETURN_INITIATED');
    });

    it('lets a finished return outrank an open one, like the Order Management status does', () => {
        expect(getOrderReturnStatusFromReturns([request('refunded', [1]), request('submitted', [2])], 3)).toBe(
            'PARTIAL_RETURN_COMPLETE'
        );
    });

    it('adds up finished returns across requests until every unit is covered', () => {
        expect(getOrderReturnStatusFromReturns([request('refunded', [1]), request('refunded', [2])], 3)).toBe(
            'RETURN_COMPLETE'
        );
    });

    it('never reports more than complete when the saved quantities exceed the order units', () => {
        expect(getOrderReturnStatusFromReturns([request('refunded', [5])], 3)).toBe('RETURN_COMPLETE');
    });
});
