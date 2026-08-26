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
import { FulfillmentOptionPicker } from './fulfillment-option-picker';
import { FULFILLMENT_OPTION_IDS } from './types';

const options = [
    {
        id: FULFILLMENT_OPTION_IDS.DELIVERY,
        label: 'Send to my address',
        description: 'Arrives in three days',
        availability: { available: true },
    },
    {
        id: FULFILLMENT_OPTION_IDS.PICKUP,
        label: 'Collect nearby',
        description: 'Ready this afternoon',
        availability: { available: false, disabledReason: 'Not available nearby' },
    },
];

describe('FulfillmentOptionPicker', () => {
    it('renders fulfillment options in their canonical order', () => {
        render(
            <FulfillmentOptionPicker
                options={[
                    { ...options[1], order: 20 },
                    { ...options[0], order: 10 },
                ]}
            />
        );

        expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
            FULFILLMENT_OPTION_IDS.DELIVERY,
            FULFILLMENT_OPTION_IDS.PICKUP,
        ]);
    });

    it('renders caller-provided option content with unique accessible radio IDs', () => {
        render(
            <FulfillmentOptionPicker
                instanceId="product-1"
                value={FULFILLMENT_OPTION_IDS.DELIVERY}
                options={options}
                onChange={() => {}}
                ariaLabel="Fulfillment options for a product"
            />
        );

        expect(screen.getByRole('radiogroup', { name: 'Fulfillment options for a product' })).toBeInTheDocument();
        expect(screen.getByText('Arrives in three days')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /send to my address/i })).toHaveAttribute(
            'id',
            'fulfillment-option-product-1-delivery'
        );
        expect(screen.getByRole('radio', { name: /collect nearby/i })).toBeDisabled();
    });

    it('associates option descriptions and unavailable reasons with their radios', () => {
        render(<FulfillmentOptionPicker options={options} />);

        expect(screen.getByRole('radio', { name: /send to my address/i })).toHaveAccessibleDescription(
            'Arrives in three days'
        );
        expect(screen.getByRole('radio', { name: /collect nearby/i })).toHaveAccessibleDescription(
            'Ready this afternoon Not available nearby'
        );
    });

    it('does not include interactive details in a radio description', () => {
        render(
            <FulfillmentOptionPicker
                options={options}
                renderDetails={(option) =>
                    option.id === FULFILLMENT_OPTION_IDS.DELIVERY ? <button type="button">Change address</button> : null
                }
            />
        );

        expect(screen.getByRole('radio', { name: /send to my address/i })).toHaveAccessibleDescription(
            'Arrives in three days'
        );
    });

    it('does not render a picker for a single contributor', () => {
        render(<FulfillmentOptionPicker options={[options[0]]} />);

        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    it('reports an enabled option selected by the shopper', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<FulfillmentOptionPicker value={FULFILLMENT_OPTION_IDS.PICKUP} options={options} onChange={onChange} />);

        await user.click(screen.getByRole('radio', { name: /send to my address/i }));

        expect(onChange).toHaveBeenCalledWith(FULFILLMENT_OPTION_IDS.DELIVERY);
    });

    it('reports an enabled option selected by its card label', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        const { container } = render(
            <FulfillmentOptionPicker value={FULFILLMENT_OPTION_IDS.PICKUP} options={options} onChange={onChange} />
        );

        const cardLabel = container.querySelector('label[for="fulfillment-option-delivery"]');
        if (!cardLabel) {
            throw new Error('Expected the delivery option to have a card label');
        }

        await user.click(cardLabel);

        expect(onChange).toHaveBeenCalledWith(FULFILLMENT_OPTION_IDS.DELIVERY);
    });

    it('keeps a single associated label and lets the visual indicator sit outside it', () => {
        const { container } = render(
            <FulfillmentOptionPicker value={FULFILLMENT_OPTION_IDS.PICKUP} options={options} onChange={() => {}} />
        );

        expect(container.querySelectorAll('label[for="fulfillment-option-delivery"]')).toHaveLength(1);
        expect(container.querySelector('label[for="fulfillment-option-delivery"] [aria-hidden="true"]')).toBeNull();
        expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    });

    it('does not change the selection when an option detail is clicked', async () => {
        const onChange = vi.fn();
        const onDetailClick = vi.fn();
        const user = userEvent.setup();
        render(
            <FulfillmentOptionPicker
                value={FULFILLMENT_OPTION_IDS.PICKUP}
                options={options}
                onChange={onChange}
                renderDetails={(option) =>
                    option.id === FULFILLMENT_OPTION_IDS.DELIVERY ? (
                        <button type="button" onClick={onDetailClick}>
                            Change delivery address
                        </button>
                    ) : null
                }
            />
        );

        await user.click(screen.getByRole('button', { name: /change delivery address/i }));

        expect(onChange).not.toHaveBeenCalled();
        expect(onDetailClick).toHaveBeenCalledOnce();
    });

    it.each([
        '{Enter}',
        '{Space}',
    ])('does not select an option when a nested detail button is activated with %s', async (key) => {
        const onChange = vi.fn();
        const onDetailClick = vi.fn();
        const user = userEvent.setup();
        render(
            <FulfillmentOptionPicker
                value={FULFILLMENT_OPTION_IDS.PICKUP}
                options={options}
                onChange={onChange}
                renderDetails={(option) =>
                    option.id === FULFILLMENT_OPTION_IDS.DELIVERY ? (
                        <button type="button" onClick={onDetailClick}>
                            Change delivery address
                        </button>
                    ) : null
                }
            />
        );

        const detailButton = screen.getByRole('button', { name: /change delivery address/i });
        detailButton.focus();
        await user.keyboard(key);

        expect(onChange).not.toHaveBeenCalled();
        if (key === '{Enter}') {
            expect(onDetailClick).toHaveBeenCalledOnce();
        }
    });
});
