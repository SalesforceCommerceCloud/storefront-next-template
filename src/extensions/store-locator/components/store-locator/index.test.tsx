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
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StoreLocator from './index';

vi.mock('./form', () => ({ default: () => <div data-testid="mock-form">FORM</div> }));
vi.mock('./list', () => ({ default: () => <div data-testid="mock-list">LIST</div> }));
vi.mock('@/extensions/store-locator/providers/chooser-feedback', () => ({
    default: () => <div data-testid="mock-feedback">FEEDBACK</div>,
}));

describe('StoreLocator (composition)', () => {
    test('renders form and list', () => {
        render(<StoreLocator />);
        expect(screen.getByTestId('mock-form')).toBeInTheDocument();
        expect(screen.getByTestId('mock-list')).toBeInTheDocument();
        expect(screen.getByTestId('mock-feedback')).toBeInTheDocument();
    });
});
