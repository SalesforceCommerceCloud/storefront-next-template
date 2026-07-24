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
import { RegisterCustomerFallback } from './checkout-form-page';

describe('RegisterCustomerFallback', () => {
    test('reserves 119px of vertical space so the lazy RegisterCustomerSelection chunk does not shift adjacent content on arrival', () => {
        render(<RegisterCustomerFallback />);
        const node = screen.getByTestId('register-customer-fallback');
        expect(node.className).toContain('min-h-[119px]');
        expect(node.className).toContain('w-full');
    });

    test('is hidden from assistive tech so screen readers do not announce an empty placeholder box', () => {
        render(<RegisterCustomerFallback />);
        expect(screen.getByTestId('register-customer-fallback')).toHaveAttribute('aria-hidden', 'true');
    });
});
