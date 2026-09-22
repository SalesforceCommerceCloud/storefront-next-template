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

import { describe, expect, test } from 'vitest';
import { operations } from './shopper-customers-v1.operations';

/**
 * Account Add (Stripe) depends on these ops-map names being present on the
 * generated shopper-customers client. A rename or dropped entry surfaces as
 * CAP 502 ("completeCustomerPaymentMethodReferenceSetup is not a function")
 * with no SCAPI fetch line — catch that here at the source of truth.
 */
describe('shopper-customers payment-method-reference operations', () => {
    test('setup and complete ops exist with the paths CAP Account Add calls', () => {
        expect(operations.setupCustomerPaymentMethodReference).toEqual({
            m: 'POST',
            b: '/organizations/{organizationId}',
            s: '/customers/{customerId}/payment-method-references/actions/setup',
        });
        expect(operations.completeCustomerPaymentMethodReferenceSetup).toEqual({
            m: 'POST',
            b: '/organizations/{organizationId}',
            s: '/customers/{customerId}/payment-method-references/actions/complete',
        });
    });
});
