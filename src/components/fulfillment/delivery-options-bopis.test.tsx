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
// @sfdc-extension-file SFDC_EXT_BOPIS
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import DeliveryOptions from './delivery-options';

describe('DeliveryOptions with BOPIS', () => {
    const product = { id: 'product-1', inventory: { ats: 1, orderable: true } };
    const pickupLocation = { id: 'store-1', inventoryId: 'inventory-1' };

    it('leaves fulfillment unselected when Delivery is unavailable', () => {
        render(
            <DeliveryOptions
                product={{ id: 'product-1', inventory: { ats: 0, orderable: false } } as never}
                quantity={1}
                pickupLocation={pickupLocation}
            />,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getAllByRole('radio')).toHaveLength(2);
        expect(screen.getByRole('radio', { name: /pickup in/i })).not.toBeChecked();
    });

    it('describes Pickup with store selection guidance when no store is selected', () => {
        render(<DeliveryOptions product={product as never} quantity={1} />, {
            wrapper: AllProvidersWrapper,
        });

        expect(screen.getByRole('radiogroup')).toHaveAccessibleName('Fulfillment method');
        expect(screen.getByRole('radio', { name: /pickup in/i })).toHaveAccessibleDescription('Select Store');
    });

    it('keeps Pickup unselected until a store is selected', async () => {
        const onSelectionChange = vi.fn();
        const user = userEvent.setup();
        render(<DeliveryOptions product={product as never} quantity={1} onSelectionChange={onSelectionChange} />, {
            wrapper: AllProvidersWrapper,
        });

        const pickup = screen.getByRole('radio', { name: /pickup in/i });
        await user.click(pickup);

        expect(pickup).not.toBeChecked();
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('publishes Pickup store metadata from the direct BOPIS integration', () => {
        const onSelectionChange = vi.fn();
        render(
            <DeliveryOptions
                product={product as never}
                quantity={1}
                pickupLocation={pickupLocation}
                onSelectionChange={onSelectionChange}
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        act(() => screen.getByRole('radio', { name: /pickup in/i }).click());

        expect(onSelectionChange).toHaveBeenLastCalledWith({
            optionId: 'pickup',
            metadata: { storeId: 'store-1', inventoryId: 'inventory-1' },
        });
    });

    it('publishes Pickup in the same click event', () => {
        let selectionAtClick: unknown;
        const onSelectionChange = vi.fn();
        render(
            <DeliveryOptions
                product={product as never}
                quantity={1}
                pickupLocation={pickupLocation}
                onSelectionChange={onSelectionChange}
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        act(() => {
            screen.getByRole('radio', { name: /pickup in/i }).click();
            selectionAtClick = onSelectionChange.mock.lastCall?.[0];
        });

        expect(selectionAtClick).toEqual({
            optionId: 'pickup',
            metadata: { storeId: 'store-1', inventoryId: 'inventory-1' },
        });
    });

    it('renders Pickup in the server response and hydrates without a mismatch', () => {
        const serverHtml = renderToString(
            <AllProvidersWrapper>
                <DeliveryOptions product={product as never} quantity={1} pickupLocation={pickupLocation} />
            </AllProvidersWrapper>
        );
        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.appendChild(container);

        const recoverableErrors: string[] = [];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            let root: ReturnType<typeof hydrateRoot>;
            act(() => {
                root = hydrateRoot(
                    container,
                    <AllProvidersWrapper>
                        <DeliveryOptions product={product as never} quantity={1} pickupLocation={pickupLocation} />
                    </AllProvidersWrapper>,
                    {
                        onRecoverableError: (error) => recoverableErrors.push(String(error)),
                    }
                );
            });

            expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
            expect(container.querySelector('[role="radio"]')).toHaveAttribute('aria-checked', 'false');
            const complaints = [...errorSpy.mock.calls.map((call) => String(call[0])), ...recoverableErrors];
            expect(complaints.filter((message) => /hydrat/i.test(message))).toEqual([]);

            act(() => root.unmount());
        } finally {
            errorSpy.mockRestore();
            document.body.removeChild(container);
        }
    });
});
