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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import DeliveryEstimateDetailedTarget from './delivery-estimate-detailed-target';
import DeliveryEstimateSummaryTarget from './delivery-estimate-summary-target';

vi.mock('./delivery-estimate-calculator-target', () => ({
    default: ({ displayStyle }: { displayStyle: string }) => <div data-testid="calculator" data-style={displayStyle} />,
}));

describe('delivery estimate target variants', () => {
    test('renders the summary calculator target', () => {
        render(<DeliveryEstimateSummaryTarget />);

        expect(screen.getByTestId('calculator')).toHaveAttribute('data-style', 'summary');
    });

    test('renders the detailed calculator target', () => {
        render(<DeliveryEstimateDetailedTarget />);

        expect(screen.getByTestId('calculator')).toHaveAttribute('data-style', 'detailed');
    });
});
