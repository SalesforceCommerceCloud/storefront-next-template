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
import { redactOrder } from './redact';
import type { ShopperOrders } from '@/scapi';

describe('redactOrder', () => {
    const fullOrder: ShopperOrders.schemas['Order'] = {
        orderNo: 'ORDER-123',
        creationDate: '2026-07-01T00:00:00.000Z',
        lastModified: '2026-07-02T00:00:00.000Z',
        customerInfo: {
            customerId: 'cust-456',
            email: 'customer@example.com',
        },
        billingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'Springfield',
            postalCode: '12345',
            countryCode: 'US',
        },
        shippingAddress: {
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '456 Oak Ave',
            city: 'Shelbyville',
            postalCode: '67890',
            countryCode: 'US',
        },
        productItems: [
            {
                productId: 'prod-001',
                productName: 'Test Product',
                quantity: 2,
                price: 29.99,
            },
        ],
        orderTotal: 59.98,
        currency: 'USD',
        status: 'new',
        paymentInstruments: [
            {
                paymentMethodId: 'CREDIT_CARD',
                paymentCard: {
                    cardType: 'Visa',
                    numberLastDigits: '1234',
                },
            },
        ],
    } as unknown as ShopperOrders.schemas['Order'];

    it('includes only allowed top-level fields', () => {
        const allowedFields = ['orderNo', 'creationDate', 'orderTotal'];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted).toEqual({
            orderNo: 'ORDER-123',
            creationDate: '2026-07-01T00:00:00.000Z',
            orderTotal: 59.98,
        });

        // Forbidden fields are absent (not undefined)
        expect('customerInfo' in redacted).toBe(false);
        expect('billingAddress' in redacted).toBe(false);
        expect('paymentInstruments' in redacted).toBe(false);
    });

    it('handles nested field paths', () => {
        const allowedFields = ['orderNo', 'customerInfo.email', 'shippingAddress.city'];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted).toHaveProperty('orderNo', 'ORDER-123');
        expect(redacted).toHaveProperty('customerInfo.email');
        expect(redacted).toHaveProperty('shippingAddress.city', 'Shelbyville');

        // customerInfo should NOT have customerId
        expect((redacted.customerInfo as Record<string, unknown>)?.customerId).toBeUndefined();

        // shippingAddress should NOT have address1
        expect(
            ((redacted as Record<string, unknown>).shippingAddress as Record<string, unknown>)?.address1
        ).toBeUndefined();
    });

    it('masks email addresses', () => {
        const allowedFields = ['orderNo', 'customerInfo.email'];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted).toHaveProperty('customerInfo.email', 'c***@example.com');
    });

    it('handles multiple email fields', () => {
        const orderWithMultipleEmails = {
            ...fullOrder,
            notificationEmail: 'notify@example.com',
            billingAddress: {
                ...fullOrder.billingAddress,
                email: 'billing@test.org',
            },
        } as unknown as ShopperOrders.schemas['Order'];

        const allowedFields = ['customerInfo.email', 'notificationEmail', 'billingAddress.email'];
        const redacted = redactOrder(orderWithMultipleEmails, allowedFields);

        expect(redacted).toHaveProperty('customerInfo.email', 'c***@example.com');
        expect(redacted).toHaveProperty('notificationEmail', 'n***@example.com');
        expect(redacted).toHaveProperty('billingAddress.email', 'b***@test.org');
    });

    it('does not mutate the input order', () => {
        const allowedFields = ['orderNo'];
        const originalEmail = fullOrder.customerInfo?.email;

        redactOrder(fullOrder, allowedFields);

        expect(fullOrder.customerInfo?.email).toBe(originalEmail);
        expect(fullOrder.orderNo).toBe('ORDER-123');
    });

    it('handles empty allowed fields list', () => {
        const redacted = redactOrder(fullOrder, []);

        expect(redacted).toEqual({});
    });

    it('handles non-existent field paths gracefully', () => {
        const allowedFields = ['orderNo', 'nonExistent.field', 'also.not.real'];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted).toEqual({
            orderNo: 'ORDER-123',
        });
    });

    it('handles array fields', () => {
        const allowedFields = ['orderNo', 'productItems'];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted).toHaveProperty('orderNo', 'ORDER-123');
        expect(redacted).toHaveProperty('productItems');
        expect(Array.isArray(redacted.productItems)).toBe(true);
        expect(redacted.productItems).toHaveLength(1);
    });

    it('passes through nested item omsData when productItems is allowed as a whole array', () => {
        // productItems is allow-listed as a top-level field, not a dotted `productItems.omsData`
        // path — the whole array value (including any nested omsData per item) passes through
        // untouched, since redaction only filters at the allowedFields' own path depth.
        const order = {
            ...fullOrder,
            productItems: [
                {
                    productId: 'prod-001',
                    productName: 'Test Product',
                    quantity: 2,
                    price: 29.99,
                    omsData: { status: 'ordered', quantityAvailableToCancel: 2, quantityOrdered: 2 },
                },
            ],
        } as unknown as ShopperOrders.schemas['Order'];

        const redacted = redactOrder(order, ['productItems']);

        expect((redacted.productItems as Array<Record<string, unknown>>)[0]?.omsData).toEqual({
            status: 'ordered',
            quantityAvailableToCancel: 2,
            quantityOrdered: 2,
        });
    });

    it('omits order-level omsData unless explicitly allow-listed', () => {
        const order = {
            ...fullOrder,
            omsData: { status: 'ordered' },
        } as unknown as ShopperOrders.schemas['Order'];

        const withoutOms = redactOrder(order, ['orderNo', 'productItems']);
        expect('omsData' in withoutOms).toBe(false);

        const withOms = redactOrder(order, ['orderNo', 'omsData']);
        expect(withOms).toHaveProperty('omsData', { status: 'ordered' });
    });

    it('strips forbidden fields at all levels', () => {
        const allowedFields = ['orderNo', 'shippingAddress.city'];
        const redacted = redactOrder(fullOrder, allowedFields);

        // Allowed
        expect(redacted).toHaveProperty('orderNo', 'ORDER-123');
        expect(redacted).toHaveProperty('shippingAddress.city', 'Shelbyville');

        // Forbidden — not present
        expect('billingAddress' in redacted).toBe(false);
        expect('paymentInstruments' in redacted).toBe(false);
        expect('customerInfo' in redacted).toBe(false);
        expect(
            ((redacted as Record<string, unknown>).shippingAddress as Record<string, unknown>)?.firstName
        ).toBeUndefined();
    });

    it('masks emails with single-character local part', () => {
        const order = {
            ...fullOrder,
            customerInfo: {
                email: 'a@example.com',
            },
        } as unknown as ShopperOrders.schemas['Order'];

        const allowedFields = ['customerInfo.email'];
        const redacted = redactOrder(order, allowedFields);

        expect(redacted).toHaveProperty('customerInfo.email', 'a***@example.com');
    });

    it('handles email masking for invalid email format', () => {
        const order = {
            ...fullOrder,
            customerInfo: {
                email: 'not-an-email',
            },
        } as unknown as ShopperOrders.schemas['Order'];

        const allowedFields = ['customerInfo.email'];
        const redacted = redactOrder(order, allowedFields);

        // Malformed format (no `@`) — fully masked rather than leaked raw
        expect(redacted).toHaveProperty('customerInfo.email', '***@***');
    });

    it('selects a single field from each element of an array', () => {
        const allowedFields = ['orderNo', 'paymentInstruments.paymentCard.cardType'];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted.paymentInstruments).toEqual([{ paymentCard: { cardType: 'Visa' } }]);
        // Sibling fields on the array element and its nested object are excluded
        expect((redacted.paymentInstruments as Array<Record<string, unknown>>)[0].paymentMethodId).toBeUndefined();
        expect(
            ((redacted.paymentInstruments as Array<Record<string, unknown>>)[0].paymentCard as Record<string, unknown>)
                .numberLastDigits
        ).toBeUndefined();
    });

    it('merges multiple array-element field selections into the same element by index', () => {
        const allowedFields = [
            'paymentInstruments.paymentCard.cardType',
            'paymentInstruments.paymentCard.numberLastDigits',
            'paymentInstruments.paymentInstrumentId',
        ];
        const redacted = redactOrder(fullOrder, allowedFields);

        expect(redacted.paymentInstruments).toEqual([
            {
                paymentCard: { cardType: 'Visa', numberLastDigits: '1234' },
                paymentInstrumentId: undefined,
            },
        ]);
    });

    it('does not add an array entry when the selected field is absent from that element', () => {
        const orderWithBareInstrument = {
            ...fullOrder,
            paymentInstruments: [{ paymentMethodId: 'CREDIT_CARD' }],
        } as unknown as ShopperOrders.schemas['Order'];

        const allowedFields = ['paymentInstruments.paymentCard.cardType'];
        const redacted = redactOrder(orderWithBareInstrument, allowedFields);

        expect(redacted.paymentInstruments).toEqual([{}]);
    });
});
