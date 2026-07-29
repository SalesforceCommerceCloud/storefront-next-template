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

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { CreditCardInputFields, type CreditCardFormFields } from './index';

// Wrapper component to provide form context
function TestWrapper({
    children,
    defaultValues = {},
}: {
    children: (form: ReturnType<typeof useForm<CreditCardFormFields>>) => React.ReactNode;
    defaultValues?: Partial<CreditCardFormFields>;
}) {
    const form = useForm<CreditCardFormFields>({
        defaultValues: {
            cardholderName: '',
            cardNumber: '',
            expiryDate: '',
            cvv: '',
            ...defaultValues,
        },
    });

    return <FormProvider {...form}>{children(form)}</FormProvider>;
}

describe('CreditCardInputFields', () => {
    describe('Accessibility labels', () => {
        // Screen readers announce the field via its accessible name. The visible placeholder
        // "MM/YY*" is not meaningful to users of assistive tech, so the sr-only label must
        // carry the human-readable "Expiry Date" text.
        test('labels the expiry field as "Expiry Date"', () => {
            render(<TestWrapper>{(form) => <CreditCardInputFields form={form} />}</TestWrapper>);

            expect(screen.getByLabelText(/Expiry Date/i)).toBeInTheDocument();
        });
    });
});
