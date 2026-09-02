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
import { act, render, screen } from '@testing-library/react';
import { useLayoutEffect, useRef, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
import {
    ShippingDeliveryProvider,
    useShippingDelivery,
} from '@/extensions/shipping-delivery/context/shipping-delivery-context';
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import DeliveryOptions, {
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
    isDeliveryEstimatePresentationHost,
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
} from './delivery-options';

describe('DeliveryOptions', () => {
    const product = { id: 'product-1', inventory: { ats: 1, orderable: true } };

    it('renders a picker only when multiple fulfillment contributors are installed', () => {
        const { container } = render(<DeliveryOptions product={product as never} quantity={1} />, {
            wrapper: AllProvidersWrapper,
        });

        const contributorCount = { value: 0 };
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        contributorCount.value = 2;
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        const expectedOptionCount = contributorCount.value;

        expect(screen.queryAllByRole('radio')).toHaveLength(expectedOptionCount);
        if (expectedOptionCount > 0) {
            expect(screen.getByRole('radiogroup', { name: 'Fulfillment method' })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAccessibleDescription(
                'Deliver to shipping address'
            );
        } else {
            expect(screen.queryByRole('radiogroup', { name: 'Fulfillment method' })).not.toBeInTheDocument();
            expect(container).toBeEmptyDOMElement();
        }
    });

    it('keeps Delivery available while variant inventory is unresolved when a picker is rendered', () => {
        render(<DeliveryOptions product={{ id: 'product-1' } as never} quantity={1} deliveryAvailable />, {
            wrapper: AllProvidersWrapper,
        });

        const fulfillmentOptions = ['delivery'];
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        fulfillmentOptions.push('pickup');
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        const expectsPicker = fulfillmentOptions.length > 1;

        if (expectsPicker) {
            expect(screen.getByRole('radio', { name: 'Delivery' })).toBeEnabled();
        } else {
            expect(screen.queryByRole('radio', { name: 'Delivery' })).not.toBeInTheDocument();
        }
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    it('uses delivery-address guidance when delivery estimates are unavailable', () => {
        render(
            <DeliveryOptions
                enableDeliveryEstimatePresentation
                product={product as never}
                quantity={1}
                pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
            />,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAccessibleDescription(
            'Deliver to shipping address'
        );
        expect(
            screen.queryByRole('button', { name: 'Enter postal code to see delivery estimate' })
        ).not.toBeInTheDocument();
    });
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    it('hydrates the delivery-only picker without a mismatch', () => {
        const serverHtml = renderToString(
            <AllProvidersWrapper>
                <DeliveryOptions product={product as never} quantity={1} />
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
                        <DeliveryOptions product={product as never} quantity={1} />
                    </AllProvidersWrapper>,
                    {
                        onRecoverableError: (error) => recoverableErrors.push(String(error)),
                    }
                );
            });

            const contributorCount = { value: 0 };
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            contributorCount.value = 2;
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            const expectedRadioCount = contributorCount.value;
            expect(container.querySelectorAll('[role="radio"]')).toHaveLength(expectedRadioCount);
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            expect(container.querySelector('[role="radio"]')).toHaveAttribute('aria-checked', 'false');
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            const complaints = [...errorSpy.mock.calls.map((call) => String(call[0])), ...recoverableErrors];
            expect(complaints.filter((message) => /hydrat/i.test(message))).toEqual([]);

            act(() => root.unmount());
        } finally {
            errorSpy.mockRestore();
            document.body.removeChild(container);
        }
    });

    it('publishes the only option automatically or after shopper selection', () => {
        const onSelectionChange = vi.fn();

        function Harness() {
            const [selection, setSelection] = useState<unknown>();
            return (
                <>
                    <DeliveryOptions
                        product={product as never}
                        quantity={1}
                        onSelectionChange={(nextSelection) => {
                            setSelection(nextSelection);
                            onSelectionChange(nextSelection);
                        }}
                    />
                    <output data-testid="selection">{JSON.stringify(selection)}</output>
                </>
            );
        }

        render(<Harness />, { wrapper: AllProvidersWrapper });

        const fulfillmentOptions = ['delivery'];
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        fulfillmentOptions.push('pickup');
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        const expectsAutomaticDelivery = fulfillmentOptions.length === 1;

        if (expectsAutomaticDelivery) {
            expect(onSelectionChange).toHaveBeenCalledWith({ optionId: 'delivery' });
            expect(screen.getByTestId('selection')).toHaveTextContent('{"optionId":"delivery"}');
            return;
        }

        expect(onSelectionChange).not.toHaveBeenCalled();
        expect(screen.getByTestId('selection')).toBeEmptyDOMElement();

        act(() => screen.getByRole('radio', { name: 'Delivery' }).click());

        expect(onSelectionChange).toHaveBeenCalledOnce();
        expect(screen.getByTestId('selection')).toHaveTextContent('{"optionId":"delivery"}');
    });

    it('keeps fulfillment unselected when the product changes with multiple contributors', () => {
        const onSelectionChange = vi.fn();
        const { rerender } = render(
            <DeliveryOptions product={product as never} quantity={1} onSelectionChange={onSelectionChange} />,
            { wrapper: AllProvidersWrapper }
        );

        rerender(
            <AllProvidersWrapper>
                <DeliveryOptions
                    product={{ ...product, id: 'product-2' } as never}
                    quantity={1}
                    onSelectionChange={onSelectionChange}
                />
            </AllProvidersWrapper>
        );

        const fulfillmentOptions = ['delivery'];
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        fulfillmentOptions.push('pickup');
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        const expectsAutomaticDelivery = fulfillmentOptions.length === 1;

        if (expectsAutomaticDelivery) {
            expect(onSelectionChange).toHaveBeenCalledTimes(2);
            expect(onSelectionChange).toHaveBeenLastCalledWith({ optionId: 'delivery' });
        } else {
            expect(onSelectionChange).not.toHaveBeenCalled();
        }
    });

    it('publishes the current selection when a callback is attached after the picker mounts', () => {
        const onSelectionChange = vi.fn();
        const { rerender } = render(<DeliveryOptions product={product as never} quantity={1} />, {
            wrapper: AllProvidersWrapper,
        });

        rerender(
            <AllProvidersWrapper>
                <DeliveryOptions product={product as never} quantity={1} onSelectionChange={onSelectionChange} />
            </AllProvidersWrapper>
        );

        const fulfillmentOptions = ['delivery'];
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        fulfillmentOptions.push('pickup');
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        const expectsAutomaticDelivery = fulfillmentOptions.length === 1;

        if (expectsAutomaticDelivery) {
            expect(onSelectionChange).toHaveBeenCalledWith({ optionId: 'delivery' });
        } else {
            expect(onSelectionChange).not.toHaveBeenCalled();
        }
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    it('requires the exact Delivery and Pickup pair for estimate presentation', () => {
        expect(isDeliveryEstimatePresentationHost([{ id: 'delivery' }, { id: 'pickup' }])).toBe(true);
        expect(isDeliveryEstimatePresentationHost([{ id: 'delivery' }])).toBe(false);
        expect(
            isDeliveryEstimatePresentationHost([{ id: 'delivery' }, { id: 'pickup' }, { id: 'ship-to-store' }])
        ).toBe(false);
    });

    it('keeps the owning Delivery title and details hosts mounted while selection changes', async () => {
        const user = userEvent.setup();

        function PresentationSource() {
            const shippingDelivery = useShippingDelivery();
            const sourceId = useRef({});
            const registerPresentationSource = shippingDelivery?.registerPresentationSource;
            const publishPresentation = shippingDelivery?.publishPresentation;

            useLayoutEffect(
                () =>
                    registerPresentationSource?.({
                        sourceId: sourceId.current,
                        productId: 'product-1',
                        estimateProductId: 'product-1',
                    }),
                [registerPresentationSource]
            );
            useLayoutEffect(() => {
                publishPresentation?.(
                    {
                        kind: 'resolved',
                        sourceId: sourceId.current,
                        productId: 'product-1',
                        title: 'Deliver to 94105',
                        text: 'Sat 2 Jan - Tue 5 Jan',
                    },
                    sourceId.current
                );
            }, [publishPresentation]);

            const host = shippingDelivery?.presentationHost;
            return (
                <output data-testid="presentation-hosts">
                    {host?.titleElement?.isConnected && host.detailsElement?.isConnected ? 'connected' : 'missing'}
                </output>
            );
        }

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={product as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <PresentationSource />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        expect(await screen.findByTestId('presentation-hosts')).toHaveTextContent('connected');
        await user.click(screen.getByRole('radio', { name: /pickup in/i }));
        expect(screen.getByTestId('presentation-hosts')).toHaveTextContent('connected');
        await user.click(screen.getByRole('radio', { name: /^Delivery/ }));
        expect(screen.getByTestId('presentation-hosts')).toHaveTextContent('connected');
    });

    it('renders the estimate prompt as Delivery description text before composed disclosure', () => {
        function PresentationSource() {
            const shippingDelivery = useShippingDelivery();
            const sourceId = useRef({});
            const registerPresentationSource = shippingDelivery?.registerPresentationSource;

            useLayoutEffect(
                () =>
                    registerPresentationSource?.({
                        sourceId: sourceId.current,
                        productId: 'product-1',
                        estimateProductId: 'product-1',
                    }),
                [registerPresentationSource]
            );
            return null;
        }

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={product as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <PresentationSource />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAccessibleDescription(
            'Enter postal code to see delivery estimate'
        );
        expect(
            screen.queryByRole('button', { name: 'Enter postal code to see delivery estimate' })
        ).not.toBeInTheDocument();
        expect(screen.getAllByText('Enter postal code to see delivery estimate')).toHaveLength(2);
        expect(screen.getAllByText('Enter postal code to see delivery estimate')[0]).toHaveClass('sr-only');
        expect(screen.getAllByText('Enter postal code to see delivery estimate')[1].tagName).toBe('P');
    });
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    it('uses caller instance IDs to keep multiple picker controls unique', () => {
        render(
            <>
                <DeliveryOptions product={product as never} quantity={1} instanceId="first" />
                <DeliveryOptions product={product as never} quantity={1} instanceId="second" />
            </>,
            { wrapper: AllProvidersWrapper }
        );

        expect(document.querySelectorAll('#fulfillment-option-first-delivery')).toHaveLength(1);
        expect(document.querySelectorAll('#fulfillment-option-second-delivery')).toHaveLength(1);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
