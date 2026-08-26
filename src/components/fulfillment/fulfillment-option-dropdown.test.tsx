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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FulfillmentOptionDropdown } from './fulfillment-option-dropdown';
import { FULFILLMENT_OPTION_IDS } from './types';

const options = [
    {
        id: FULFILLMENT_OPTION_IDS.DELIVERY,
        label: 'Delivery',
        menuLabel: 'Send to an address',
        availability: { available: true },
    },
    {
        id: FULFILLMENT_OPTION_IDS.PICKUP,
        label: 'Pickup',
        menuLabel: 'Collect from a location',
        availability: { available: false, disabledReason: 'No locations available' },
    },
];

describe('FulfillmentOptionDropdown', () => {
    it('uses caller-provided labels and exposes unavailable options as disabled', async () => {
        const user = userEvent.setup();
        render(
            <FulfillmentOptionDropdown value={FULFILLMENT_OPTION_IDS.DELIVERY} options={options} onChange={() => {}} />
        );

        await user.click(screen.getByRole('button', { name: 'Delivery' }));

        expect(await screen.findByText('Send to an address')).toBeInTheDocument();
        expect(screen.getByRole('menuitemradio', { name: 'Send to an address' })).toHaveAttribute(
            'aria-checked',
            'true'
        );
        expect(screen.getByRole('menuitemradio', { name: 'Collect from a location' })).toHaveAttribute(
            'aria-disabled',
            'true'
        );
    });

    it('reports an enabled menu option selected by the shopper', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <FulfillmentOptionDropdown value={FULFILLMENT_OPTION_IDS.PICKUP} options={options} onChange={onChange} />
        );

        await user.click(screen.getByRole('button', { name: 'Pickup' }));
        await user.click(await screen.findByText('Send to an address'));

        expect(onChange).toHaveBeenCalledWith(FULFILLMENT_OPTION_IDS.DELIVERY);
    });
});
