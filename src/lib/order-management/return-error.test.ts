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

import { describe, it, expect } from 'vitest';
import { ApiError, type ErrorDetail } from '@/scapi';
import { classifyReturnError, readReturnErrorCode } from './return-error';

const apiError = (status: number, body: Partial<ErrorDetail> & Record<string, unknown> = {}) =>
    new ApiError({
        status,
        statusText: 'Test Error',
        headers: new Headers(),
        body: { type: '', title: '', detail: '', ...body } as ErrorDetail,
        rawBody: JSON.stringify(body),
        url: 'https://api.example.com/orders/1/actions/oms-return-order',
        method: 'POST',
    });

describe('classifyReturnError', () => {
    it('maps the three 400 per-item sub-codes to their recovery kinds', () => {
        expect(classifyReturnError(400, 'InvalidReasonCode')).toBe('invalid_reason');
        expect(classifyReturnError(400, 'UnknownProductItemIds')).toBe('unknown_items');
        expect(classifyReturnError(400, 'ReturnQuantityExceeded')).toBe('quantity_exceeded');
    });

    it('maps 400 OrderReturnFailed to transient (not invalid_input)', () => {
        expect(classifyReturnError(400, 'OrderReturnFailed')).toBe('transient');
    });

    it('maps an unknown or absent 400 code to transient', () => {
        expect(classifyReturnError(400, 'SomethingElse')).toBe('transient');
        expect(classifyReturnError(400, undefined)).toBe('transient');
    });

    it('maps 404 to not_found (terminal)', () => {
        expect(classifyReturnError(404)).toBe('not_found');
    });

    it('maps 409 to not_returnable (terminal)', () => {
        expect(classifyReturnError(409, 'OrderReturnFailed')).toBe('not_returnable');
    });

    it('maps 500 and arbitrary statuses to transient', () => {
        expect(classifyReturnError(500)).toBe('transient');
        expect(classifyReturnError(503)).toBe('transient');
        expect(classifyReturnError(0)).toBe('transient');
    });
});

describe('readReturnErrorCode', () => {
    it('reads the RFC 7807 type field', () => {
        expect(readReturnErrorCode(apiError(400, { type: 'InvalidReasonCode' }))).toBe('InvalidReasonCode');
    });

    it('normalizes a URI / fragment / path form to its trailing token', () => {
        expect(readReturnErrorCode(apiError(400, { type: 'about:blank#UnknownProductItemIds' }))).toBe(
            'UnknownProductItemIds'
        );
        expect(readReturnErrorCode(apiError(400, { type: 'https://errors.example.com/ReturnQuantityExceeded' }))).toBe(
            'ReturnQuantityExceeded'
        );
    });

    it('falls back to a bare errorCode field when type is empty', () => {
        expect(readReturnErrorCode(apiError(400, { type: '', errorCode: 'OrderReturnFailed' }))).toBe(
            'OrderReturnFailed'
        );
    });

    it('returns undefined when neither type nor errorCode is usable', () => {
        expect(readReturnErrorCode(apiError(400, { type: '' }))).toBeUndefined();
        expect(readReturnErrorCode(apiError(500))).toBeUndefined();
    });

    it('returns undefined without throwing for non-ApiError inputs', () => {
        expect(readReturnErrorCode(new Error('boom'))).toBeUndefined();
        expect(readReturnErrorCode(undefined)).toBeUndefined();
        expect(readReturnErrorCode(null)).toBeUndefined();
        expect(readReturnErrorCode('nope')).toBeUndefined();
    });
});
