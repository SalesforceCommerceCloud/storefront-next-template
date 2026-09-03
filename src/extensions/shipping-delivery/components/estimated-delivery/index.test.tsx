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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import type { ShippingEstimate } from '@/lib/shipping-estimate/types';
// @sfdc-extension-line SFDC_EXT_BOPIS
import DeliveryOptions from '@/components/fulfillment/delivery-options';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { ShippingDeliveryProvider } from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import EstimatedDelivery from './index';

const useShippingEstimate = vi.hoisted(() => vi.fn());
const infoModalProps = vi.hoisted(() => vi.fn());
const deferredInfoModal = vi.hoisted(() => {
    let isPending = false;
    let resolve: (() => void) | undefined;
    let suspension: (Error & PromiseLike<void>) | undefined;

    return {
        suspend() {
            isPending = true;
            const pending = new Promise<void>((complete) => {
                resolve = complete;
            });
            // React recognizes the thenable while OxLint requires an Error to be thrown.
            suspension = Object.assign(new Error('Info modal import pending'), { then: pending.then.bind(pending) });
        },
        resolve() {
            isPending = false;
            resolve?.();
            resolve = undefined;
            suspension = undefined;
        },
        isPending: () => isPending,
        suspension: () => suspension,
    };
});

vi.mock('@/lib/shipping-estimate/use-shipping-estimate', () => ({ useShippingEstimate }));
vi.mock('@/components/info-modal', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/info-modal')>();

    return {
        ...actual,
        default: (props: ComponentProps<typeof actual.default>) => {
            const suspension = deferredInfoModal.suspension();
            if (suspension) throw suspension;
            infoModalProps(props);
            return <actual.default {...props} />;
        },
    };
});

const deliveryEstimate: ShippingEstimate = {
    deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-05T00:00:00Z' },
    shippingOptions: [
        {
            shippingMethodId: 'ground',
            name: 'Ground',
            price: 0,
            currency: 'USD',
            deliveryWindow: { startAt: '2027-01-02T00:00:00Z', endAt: '2027-01-05T00:00:00Z' },
        },
        {
            shippingMethodId: 'express',
            name: 'Express',
            price: 9.99,
            currency: 'USD',
            deliveryWindow: { startAt: '2027-01-01T00:00:00Z', endAt: '2027-01-03T00:00:00Z' },
        },
    ],
};

describe('EstimatedDelivery', () => {
    beforeEach(() => {
        deferredInfoModal.resolve();
        infoModalProps.mockClear();
        useShippingEstimate.mockImplementation(
            ({ initialDestination }: { initialDestination?: { postalCode: string } | null }) => ({
                isLoading: false,
                estimate: initialDestination ? deliveryEstimate : null,
                hasError: false,
                matchedZipcode: initialDestination?.postalCode ?? null,
                autoFetchInFlight: false,
                load: vi.fn(),
            })
        );
    });

    test('renders an accessible inline postal-code estimator when no destination is known', () => {
        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });

        expect(screen.getByRole('heading', { name: 'Estimated Delivery Date' })).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'postal-code');
        expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Enter a postal code...');
        expect(screen.getByRole('button', { name: 'Calculate delivery estimate' })).toBeInTheDocument();
    });

    test('focuses the postal-code input when a composed calculator is explicitly disclosed', () => {
        render(<EstimatedDelivery productId="product-1" focusPostalCodeOnMount />, {
            wrapper: AllProvidersWrapper,
        });

        return waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('keeps the fallback postal-code editor open after a composed disclosure clears its focus request', () => {
        function FallbackDisclosure() {
            const [focusPostalCodeOnMount, setFocusPostalCodeOnMount] = useState(true);

            return (
                <EstimatedDelivery
                    productId="product-1"
                    initialDestination={{ postalCode: 'SW1A 1AA', countryCode: 'GB' }}
                    focusPostalCodeOnMount={focusPostalCodeOnMount}
                    onPostalCodeFocusHandled={() => setFocusPostalCodeOnMount(false)}
                />
            );
        }

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });

        render(
            <ShippingDeliveryProvider productId="product-1">
                <FallbackDisclosure />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        return waitFor(() => {
            expect(screen.getByRole('textbox')).toHaveFocus();
            expect(screen.getByRole('button', { name: 'Calculate delivery estimate' })).toBeEnabled();
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('shows a standalone loading card while calculating', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: true,
            estimate: null,
            hasError: false,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });

        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });

        expect(screen.getByRole('status')).toHaveTextContent('Calculating...');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('renders a polite loading card for a saved destination', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: true,
            estimate: null,
            hasError: false,
            matchedZipcode: null,
            autoFetchInFlight: true,
            load: vi.fn(),
        });

        render(
            <EstimatedDelivery productId="product-1" initialDestination={{ postalCode: '94105', countryCode: 'US' }} />,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByRole('status')).toHaveTextContent('Calculating...');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('hides delivery UI after a saved destination settles with no estimate', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            load: vi.fn(),
        });

        render(
            <EstimatedDelivery productId="product-1" initialDestination={{ postalCode: '94105', countryCode: 'US' }} />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        expect(screen.queryByRole('heading', { name: 'Estimated Delivery Date' })).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByText(/Sat 2 Jan.*Tue 5 Jan/)).not.toBeInTheDocument();
    });

    test('prepares the saved ZIP lookup while Delivery is unselected', () => {
        const { rerender } = render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                visible={false}
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        expect(useShippingEstimate).toHaveBeenLastCalledWith({
            productId: 'product-1',
            initialDestination: { postalCode: '94105', countryCode: 'US' },
            enabled: true,
            matchAgainst: '94105',
        });

        rerender(
            <AllProvidersWrapper>
                <EstimatedDelivery
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    visible
                />
            </AllProvidersWrapper>
        );

        expect(useShippingEstimate).toHaveBeenLastCalledWith({
            productId: 'product-1',
            initialDestination: { postalCode: '94105', countryCode: 'US' },
            enabled: true,
            matchAgainst: '94105',
        });
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('does not coordinate loading while fulfillment presentation is disabled', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: true,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: true,
            load: vi.fn(),
        });

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByTestId('standalone-target')).toContainElement(screen.getByRole('status'));
        expect(screen.getByRole('radio', { name: 'Delivery' }).parentElement).not.toContainElement(
            screen.getByRole('status')
        );
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('shows the primary shipping method date window and lets shoppers edit the displayed postal code', async () => {
        const user = userEvent.setup();
        render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                displayStyle="summary"
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        expect(screen.getByText(/Sat 2 Jan.*Tue 5 Jan/)).toBeInTheDocument();
        const postalCode = screen.getByRole('button', { name: 'Change destination: 94105' });
        expect(postalCode).toHaveClass('underline');
        expect(postalCode).toHaveClass('focus-visible:ring-2');
        await user.click(postalCode);

        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input).toHaveValue('94105');
        await waitFor(() => expect(input).toHaveFocus());
    });

    test('shows merchant fallback guidance below the clickable destination', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        useShippingEstimate.mockImplementation(({ matchAgainst }: { matchAgainst?: string }) => ({
            isLoading: false,
            estimate: null,
            hasError: matchAgainst === 'SW1A 1AA',
            fallbackDeliveryDescription: matchAgainst === 'SW1A 1AA' ? 'Arrives in 7–10 business days' : null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        }));

        render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: 'SW1A 1AA', countryCode: 'GB' }}
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        const changeDestination = screen.getByRole('button', { name: 'Change destination: SW1A 1AA' });
        const fallbackGuidance = screen.getByRole('status');
        expect(fallbackGuidance).toHaveTextContent('Arrives in 7–10 business days');
        expect(changeDestination.compareDocumentPosition(fallbackGuidance) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
        expect(changeDestination).toHaveClass('underline');
        expect(changeDestination).toHaveClass('focus-visible:ring-2');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        await user.click(changeDestination);

        const input = screen.getByLabelText('postcode');
        expect(input).toHaveValue('SW1A 1AA');
        expect(input.getAttribute('aria-describedby')).toMatch(/^estimated-delivery-.*-message$/);
        expect(screen.getByRole('status')).toHaveTextContent('Arrives in 7–10 business days');
        expect(screen.getByRole('button', { name: 'Calculate delivery estimate' })).toBeEnabled();
        await waitFor(() => expect(input).toHaveFocus());

        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Calculating...');
    });

    test('removes failed lookup guidance when the shopper edits the postal code', async () => {
        const user = userEvent.setup();
        useShippingEstimate.mockImplementation(({ matchAgainst }: { matchAgainst?: string }) => ({
            isLoading: false,
            estimate: null,
            hasError: matchAgainst === 'SW1A 1AA',
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        }));

        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });
        const input = screen.getByRole('textbox');
        await user.type(input, 'SW1A1AA');

        expect(screen.getByRole('status')).toHaveTextContent(
            'Delivery dates unavailable. See checkout for options and costs.'
        );

        await user.clear(input);
        await user.type(input, 'SW1A2AA');

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Enter your postcode (e.g. SW1A 1AA) to see delivery estimates.')
        ).not.toBeInTheDocument();
    });

    test('clears a previous estimate when a subsequent lookup fails', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        const { rerender } = render(
            <EstimatedDelivery productId="product-1" initialDestination={{ postalCode: '94105', countryCode: 'US' }} />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        expect(screen.getByText(/Sat 2 Jan.*Tue 5 Jan/)).toBeInTheDocument();

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        rerender(
            <AllProvidersWrapper>
                <EstimatedDelivery
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </AllProvidersWrapper>
        );

        expect(screen.queryByText(/Sat 2 Jan.*Tue 5 Jan/)).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Delivery dates unavailable. See checkout for options and costs.'
        );
        expect(screen.getByRole('textbox')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'More Delivery Options' })).not.toBeInTheDocument();
    });

    test('normalizes and submits postal codes using the site locale format', () => {
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        });
        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });

        const input = screen.getByLabelText('postcode') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'sw1a1aa' } });
        expect(input.value).toBe('SW1A 1AA');

        fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');
    });

    test('submits a valid postal code when the shopper presses Enter', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        });
        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });

        await user.type(screen.getByLabelText('postcode'), 'SW1A1AA{Enter}');

        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');
    });

    test('retains the persisted destination country for manual recalculation', () => {
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            matchedZipcode: 'M5V 3A8',
            autoFetchInFlight: false,
            requestSequence: 1,
            settledSequence: 1,
            load,
        });
        render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: 'M5V 3A8', countryCode: 'CA' }}
            />,
            { wrapper: AllProvidersWrapper }
        );

        expect(useShippingEstimate).toHaveBeenCalledWith(
            expect.objectContaining({ initialDestination: { postalCode: 'M5V 3A8', countryCode: 'CA' } })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Change destination: M5V 3A8' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'h0h0h0' } });
        expect(screen.getByRole('textbox')).toHaveValue('H0H 0H0');
        fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));

        expect(load).toHaveBeenCalledWith('H0H 0H0', 'CA');
    });

    test('normalizes a saved postal code before matching the initial estimate', () => {
        render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: 'm5v3a8', countryCode: 'CA' }}
            />,
            { wrapper: AllProvidersWrapper }
        );

        expect(useShippingEstimate).toHaveBeenLastCalledWith(expect.objectContaining({ matchAgainst: 'M5V 3A8' }));
    });

    test('announces and focuses a successful shopper-initiated estimate', async () => {
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load,
        });
        const { rerender } = render(<EstimatedDelivery productId="product-1" />, {
            wrapper: AllProvidersWrapper,
        });

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SW1A 1AA' } });
        fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            matchedZipcode: 'SW1A 1AA',
            autoFetchInFlight: false,
            requestSequence: 1,
            settledSequence: 1,
            load,
        });
        rerender(<EstimatedDelivery productId="product-1" />);

        const result = await screen.findByRole('status');
        await waitFor(() => expect(result).toHaveFocus());
        expect(result).toHaveTextContent(/Sat 2 Jan.*Tue 5 Jan/);
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('keeps focus on Pickup when a coordinated estimate settles after Pickup is selected', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        });
        const { rerender } = render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery enableFulfillmentPresentation productId="product-1" />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = screen.getByRole('radio', { name: 'Delivery' });
        const pickup = screen.getByRole('radio', { name: /pickup in/i });
        await user.click(delivery);
        await user.type(screen.getByRole('textbox'), 'SW1A1AA');
        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');

        await user.click(pickup);
        expect(pickup).toHaveFocus();

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: 'SW1A 1AA',
            autoFetchInFlight: false,
            requestSequence: 1,
            settledSequence: 1,
            load,
        });
        rerender(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery enableFulfillmentPresentation productId="product-1" />
            </ShippingDeliveryProvider>
        );

        await waitFor(() => expect(screen.getByRole('radio', { name: /pickup in/i })).toHaveFocus());
        expect(document.activeElement).not.toBe(screen.getByRole('status'));
    });

    test.each([
        {
            name: 'a resolved estimate',
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
        },
        {
            name: 'merchant fallback guidance',
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
            matchedZipcode: null,
        },
    ])('moves focus to Delivery when a composed request settles with $name', async (result) => {
        const user = userEvent.setup();
        const load = vi.fn();
        const renderEstimator = () => (
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>
        );
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        });
        const { rerender } = render(renderEstimator(), { wrapper: AllProvidersWrapper });

        const delivery = await screen.findByRole('radio', { name: /^Delivery/ });
        await user.click(delivery);
        await user.click(screen.getByRole('button', { name: 'Change destination: 94105' }));
        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('94105', 'US');

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            ...result,
            autoFetchInFlight: false,
            requestSequence: 1,
            settledSequence: 1,
            load,
        });
        rerender(renderEstimator());

        await waitFor(() => expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveFocus());
    });

    test.each([
        {
            name: 'an empty estimate',
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
        },
        {
            name: 'a retryable lookup failure',
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
        },
    ])('keeps focus in the composed calculator when a request settles with $name', async (result) => {
        const user = userEvent.setup();
        const load = vi.fn();
        const renderEstimator = () => (
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>
        );
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        });
        const { rerender } = render(renderEstimator(), { wrapper: AllProvidersWrapper });

        await user.click(await screen.findByRole('radio', { name: /^Delivery/ }));
        await user.click(screen.getByRole('button', { name: 'Change destination: 94105' }));
        const calculate = screen.getByRole('button', { name: 'Calculate delivery estimate' });
        await user.click(calculate);
        expect(load).toHaveBeenCalledWith('94105', 'US');

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            ...result,
            autoFetchInFlight: false,
            requestSequence: 1,
            settledSequence: 1,
            load,
        });
        rerender(renderEstimator());

        await waitFor(() => expect(screen.getByRole('button', { name: 'Calculate delivery estimate' })).toHaveFocus());
        expect(document.activeElement).not.toBe(screen.getByRole('radio', { name: /^Delivery/ }));
    });

    test('does not move focus when the previous product request settles after a variant change', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        const renderProduct = (productId: string) => (
            <>
                <button type="button">Select blue variant</button>
                <ShippingDeliveryProvider productId={productId}>
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: productId, inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <EstimatedDelivery enableFulfillmentPresentation productId={productId} />
                </ShippingDeliveryProvider>
            </>
        );
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 0,
            settledSequence: 0,
            load,
        });
        const { rerender } = render(renderProduct('product-a'), { wrapper: AllProvidersWrapper });

        await user.click(screen.getByRole('radio', { name: /^Delivery/ }));
        await user.type(screen.getByRole('textbox'), 'SW1A1AA');
        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');

        const variantChange = screen.getByRole('button', { name: 'Select blue variant' });
        await user.click(variantChange);
        expect(variantChange).toHaveFocus();

        useShippingEstimate.mockReturnValue({
            isLoading: true,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: true,
            requestSequence: 2,
            settledSequence: 0,
            load,
        });
        rerender(renderProduct('product-b'));

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: 'SW1A 1AA',
            autoFetchInFlight: false,
            requestSequence: 2,
            settledSequence: 2,
            load,
        });
        rerender(renderProduct('product-b'));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Select blue variant' })).toHaveFocus());
        expect(document.activeElement).not.toBe(screen.getByRole('radio', { name: /^Delivery/ }));
        expect(document.activeElement).not.toBe(screen.getByRole('status'));
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('focuses a standalone merchant fallback after an edited estimate settles', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 1,
            settledSequence: 1,
            load,
        });
        const { rerender } = render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: 'SW1A 1AA', countryCode: 'GB' }}
            />,
            { wrapper: AllProvidersWrapper }
        );

        await user.click(screen.getByRole('button', { name: 'Change destination: SW1A 1AA' }));
        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
            matchedZipcode: null,
            autoFetchInFlight: false,
            requestSequence: 2,
            settledSequence: 2,
            load,
        });
        rerender(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: 'SW1A 1AA', countryCode: 'GB' }}
            />
        );

        const fallbackStatus = screen.getByRole('status');
        await waitFor(() => expect(fallbackStatus).toHaveFocus());
        expect(fallbackStatus).toHaveTextContent('Arrives in 7–10 business days');
        expect(document.activeElement).not.toBe(document.body);
    });

    test('rejects invalid postal codes without starting an estimate lookup', () => {
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load,
        });
        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });

        fireEvent.change(screen.getByLabelText('postcode'), { target: { value: 'sw1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));

        expect(load).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid postcode (e.g. SW1A 1AA).');
    });

    test('preloads calculated delivery methods before the shopper opens the dialog', async () => {
        const user = userEvent.setup();
        render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                displayStyle="summary"
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        const trigger = screen.getByRole('button', { name: 'View All Shipping Options' });
        expect(trigger).toHaveClass('underline');
        await waitFor(() =>
            expect(infoModalProps).toHaveBeenCalledWith(
                expect.objectContaining({
                    open: false,
                    data: expect.objectContaining({ type: 'estimated-delivery' }),
                })
            )
        );

        await user.click(trigger);
        expect(screen.queryByText('Calculating...')).not.toBeInTheDocument();
        const dialog = await screen.findByRole('dialog', { name: 'Estimated Delivery Date' });
        expect(infoModalProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }));
        expect(within(dialog).getByRole('heading', { name: 'Shipping options', level: 3 })).toBeInTheDocument();
        expect(within(dialog).getByText('Ground')).toBeInTheDocument();
        expect(within(dialog).getByText('Express')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    test('announces a pending dialog only when its lazy module has not loaded after activation', async () => {
        const user = userEvent.setup();
        render(
            <EstimatedDelivery
                productId="product-1"
                initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                displayStyle="summary"
            />,
            {
                wrapper: AllProvidersWrapper,
            }
        );

        const trigger = screen.getByRole('button', { name: 'View All Shipping Options' });
        await waitFor(() => expect(infoModalProps).toHaveBeenCalled());
        expect(screen.queryByText('Opening delivery options...')).not.toBeInTheDocument();

        deferredInfoModal.suspend();
        await user.click(trigger);
        expect(screen.getByText('Opening delivery options...')).toHaveAttribute('role', 'status');

        act(() => deferredInfoModal.resolve());
        await screen.findByRole('dialog');
        expect(screen.queryByText('Opening delivery options...')).not.toBeInTheDocument();
    });

    test('moves focus to Pickup when visibility closes an open delivery modal', async () => {
        const user = userEvent.setup();
        let setVisible: (visible: boolean) => void;

        function Harness() {
            const [visible, updateVisible] = useState(true);
            setVisible = updateVisible;

            return (
                <>
                    <input id="fulfillment-option-product-1-pickup" type="radio" aria-label="Pickup" />
                    <div hidden={!visible}>
                        <EstimatedDelivery
                            productId="product-1"
                            initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                            displayStyle="summary"
                            visible={visible}
                        />
                    </div>
                </>
            );
        }

        render(<Harness />, { wrapper: AllProvidersWrapper });
        await user.click(await screen.findByRole('button', { name: 'View All Shipping Options' }));
        await screen.findByRole('dialog');

        act(() => setVisible(false));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Pickup' })));
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('coordinates a resolved estimate with the explicitly eligible Delivery host', async () => {
        const user = userEvent.setup();
        const hostProps = {
            enableDeliveryEstimatePresentation: true,
            instanceId: 'primary-pdp-picker',
        } as ComponentProps<typeof DeliveryOptions>;

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    {...hostProps}
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                        displayStyle="detailed"
                    />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = await screen.findByRole('radio', { name: /^Delivery, Deliver to 94105$/ });
        const pickup = screen.getByRole('radio', { name: /pickup in/i });
        await waitFor(() =>
            expect(delivery).toHaveAccessibleDescription(expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/))
        );
        const coordinatedStatus = screen.getByRole('status');
        expect(screen.getByTestId('standalone-target')).toContainElement(coordinatedStatus);
        expect(screen.getByTestId('standalone-target').querySelector('.rounded-ui')).toBeNull();
        const unresolvedSelectionDestination = screen.getByRole('button', { name: 'Change destination: 94105' });
        expect(delivery).not.toBeChecked();
        expect(delivery.parentElement).toContainElement(unresolvedSelectionDestination);
        expect(delivery.parentElement).toHaveTextContent(/Deliver to\s*94105/);
        expect(delivery.parentElement).toHaveTextContent(/Sat 2 Jan.*Tue 5 Jan/);
        expect(delivery.parentElement).not.toHaveTextContent('Arrives');

        await user.click(delivery);

        const changeDestination = screen.getByRole('button', { name: 'Change destination: 94105' });
        const allOptions = screen.getByRole('button', { name: 'View All Shipping Options' });
        expect(allOptions).toHaveClass('underline');
        expect(delivery.parentElement).toContainElement(changeDestination);
        expect(delivery.parentElement).toContainElement(allOptions);
        expect(delivery.parentElement).toHaveTextContent(/Deliver to\s*94105/);
        expect(delivery.parentElement).toHaveTextContent(/Sat 2 Jan.*Tue 5 Jan/);
        expect(delivery.parentElement).not.toHaveTextContent('Arrives');
        expect(screen.getAllByRole('button', { name: 'Change destination: 94105' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'View All Shipping Options' })).toHaveLength(1);

        await user.click(allOptions);
        const dialog = await screen.findByRole('dialog', { name: 'Shipping options' });
        const modalHeading = within(dialog).getByRole('heading', { name: 'Shipping options' });
        expect(dialog.querySelector('[data-slot="dialog-close"]')).toHaveAttribute('aria-label', 'Close');
        expect(within(dialog).getAllByRole('heading')).toHaveLength(1);
        expect(modalHeading).toHaveFocus();
        expect(within(dialog).queryByRole('heading', { name: 'Estimated Delivery Date' })).not.toBeInTheDocument();
        act(() => pickup.click());

        expect(delivery.parentElement).toContainElement(
            screen.getByRole('button', { name: 'Change destination: 94105' })
        );
        const persistentAllOptions = screen.getByRole('button', { name: 'View All Shipping Options' });
        expect(delivery.parentElement).toContainElement(persistentAllOptions);
        expect(delivery).toHaveAccessibleDescription(expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/));
        await waitFor(() => expect(pickup).toHaveFocus());
        expect(pickup).toHaveAttribute('id', 'fulfillment-option-primary-pdp-picker-pickup');
    });

    test('shows cookie-restoration loading only in Delivery for an eligible host', async () => {
        const user = userEvent.setup();
        useShippingEstimate.mockReturnValue({
            isLoading: true,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: true,
            load: vi.fn(),
        });

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = screen.getByRole('radio', { name: 'Delivery' });
        const loading = await screen.findByRole('status');
        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(delivery.parentElement).toContainElement(loading);
        expect(screen.getByTestId('standalone-target')).not.toContainElement(loading);
        expect(screen.getByTestId('standalone-target')).toBeEmptyDOMElement();

        await user.click(screen.getByRole('radio', { name: /pickup in/i }));
        expect(delivery.parentElement).toContainElement(loading);
        expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    test('keeps resolved estimate controls at the standalone target without an eligible host', () => {
        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByTestId('standalone-target')).toContainElement(
            screen.getByRole('button', { name: 'Change destination: 94105' })
        );
        expect(screen.getByRole('heading', { name: 'Estimated Delivery Date' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Change destination: 94105' }).closest('section')).toHaveClass(
            'mt-4'
        );
        expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
            'Enter a postal code to get a delivery estimate'
        );
    });

    test('defaults a direct estimator to standalone presentation even with an eligible provider host', () => {
        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByRole('button', { name: 'Change destination: 94105' })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAccessibleDescription(
            'Enter a postal code to get a delivery estimate'
        );
    });

    test('coordinates a variant estimate with the master product presentation host', async () => {
        render(
            <ShippingDeliveryProvider productId="master-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'variant-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="variant-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );
        expect(screen.getByRole('status')).toHaveClass('sr-only');
        expect(screen.getByRole('radio', { name: /^Delivery/ }).parentElement).toContainElement(
            screen.getByRole('button', { name: 'Change destination: 94105' })
        );
    });

    test('restores the estimate prompt when a new variant has no estimate', async () => {
        const renderProduct = (productId: string) => (
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'master-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId={productId}
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );
        const { rerender } = render(renderProduct('variant-1'));

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        rerender(renderProduct('variant-2'));

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAccessibleDescription(
                'Enter a postal code to get a delivery estimate'
            )
        );
        expect(screen.queryByRole('button', { name: 'Change destination: 94105' })).not.toBeInTheDocument();
    });

    test('shows loading, not a blank Delivery option, when returning to a resolved variant whose estimate is refetching', async () => {
        // A variant with an empty merchant fallback forces the estimator open (recovery effect). Switching
        // back to a previously resolved variant must not leave that per-variant edit state stuck: while the
        // returning variant's estimate refetches, the recovery effect cannot clear editing (no estimate yet),
        // so without a variant-change reset the option publishes `editing` and renders blank.
        const renderProduct = (productId: string) => (
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'master-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId={productId}
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        // Variant 1 resolves — its arrival window coordinates into the Delivery option.
        const { rerender } = render(renderProduct('variant-1'));
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );

        // Variant 2 returns an empty merchant fallback: no estimate and no fallback text force the editor open.
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: '',
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        rerender(renderProduct('variant-2'));

        // Return to variant 1 while its estimate is still refetching (stale fetcher data → in-flight).
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: true,
            load: vi.fn(),
        });
        rerender(renderProduct('variant-1'));

        const delivery = screen.getByRole('radio', { name: /^Delivery/ });
        await waitFor(() => {
            const loading = within(delivery.parentElement as HTMLElement).queryByRole('status');
            expect(loading).toHaveTextContent('Calculating...');
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('uses unique IDs for multiple standalone estimators', () => {
        const { container } = render(
            <>
                <EstimatedDelivery productId="product-1" />
                <EstimatedDelivery productId="product-2" />
            </>,
            { wrapper: AllProvidersWrapper }
        );
        const ids = [...container.querySelectorAll('[id]')].map(({ id }) => id);

        expect(new Set(ids).size).toBe(ids.length);
        for (const input of screen.getAllByRole('textbox')) {
            expect(input).not.toHaveAttribute('aria-describedby');
        }
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('keeps input and hard-error branches at the standalone target when composition is disabled', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary-pdp-picker"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery productId="product-1" />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        expect(screen.getByTestId('standalone-target')).toContainElement(screen.getByRole('textbox'));
        expect(screen.getByTestId('standalone-target')).toContainElement(screen.getByRole('status'));
        expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAccessibleDescription(
            'Enter a postal code to get a delivery estimate'
        );
    });

    test('keeps a hard-error calculator at the standalone target', () => {
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });

        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary-pdp-picker"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery enableFulfillmentPresentation productId="product-1" />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = screen.getByRole('radio', { name: 'Delivery' });
        const standaloneTarget = screen.getByTestId('standalone-target');
        expect(standaloneTarget).toContainElement(screen.getByRole('textbox'));
        expect(standaloneTarget).toContainElement(screen.getByRole('status'));
        expect(delivery.parentElement).not.toContainElement(screen.getByRole('textbox'));
        expect(screen.getByRole('heading', { name: 'Estimated Delivery Date' })).toBeInTheDocument();
    });

    test('uses only the primary matching host and ignores stale host cleanup', async () => {
        const user = userEvent.setup();

        function Host({ instanceId }: { instanceId: string }) {
            return (
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId={instanceId}
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
            );
        }

        const { rerender } = render(
            <ShippingDeliveryProvider productId="product-1">
                <Host instanceId="primary" />
                <Host instanceId="secondary" />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const primaryDelivery = document.getElementById('fulfillment-option-primary-delivery');
        const secondaryDelivery = document.getElementById('fulfillment-option-secondary-delivery');
        expect(primaryDelivery).not.toBeNull();
        expect(secondaryDelivery).not.toBeNull();
        if (!primaryDelivery || !secondaryDelivery) throw new Error('Expected both delivery controls');
        await waitFor(() =>
            expect(primaryDelivery).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );
        expect(secondaryDelivery).toHaveAccessibleDescription('Enter a postal code to get a delivery estimate');

        await user.click(primaryDelivery);
        expect(primaryDelivery.parentElement).toContainElement(
            screen.getByRole('button', { name: 'Change destination: 94105' })
        );

        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <Host instanceId="secondary" />
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        const replacementDelivery = document.getElementById('fulfillment-option-secondary-delivery');
        expect(replacementDelivery).not.toBeNull();
        if (!replacementDelivery) throw new Error('Expected replacement delivery control');
        await waitFor(() =>
            expect(replacementDelivery).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );
    });

    test('clears coordinated success before showing destination editing', async () => {
        const user = userEvent.setup();
        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = screen.getByRole('radio', { name: /^Delivery/ });
        await waitFor(() =>
            expect(delivery).toHaveAccessibleDescription(expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/))
        );
        await user.click(delivery);
        await user.click(screen.getByRole('button', { name: 'Change destination: 94105' }));

        expect(screen.getByRole('textbox')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /^Delivery/ })).not.toHaveAccessibleDescription();
        expect(screen.queryByRole('button', { name: 'More Delivery Options' })).not.toBeInTheDocument();
    });

    test('moves coordinated cookie-restoration loading into Delivery', async () => {
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            load,
        });
        const { rerender } = render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = screen.getByRole('radio', { name: /^Delivery/ });
        await waitFor(() =>
            expect(delivery).toHaveAccessibleDescription(expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/))
        );
        useShippingEstimate.mockReturnValue({
            isLoading: true,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: true,
            load,
        });
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        const loading = screen.getByRole('status');
        expect(loading).toHaveTextContent('Calculating...');
        const refreshedDelivery = screen.getByRole('radio', { name: /^Delivery/ });
        expect(refreshedDelivery.parentElement).toContainElement(loading);
        expect(loading.closest('[data-testid="standalone-target"]')).toBeNull();
    });

    test('uses the destination link and fallback guidance in the composed Delivery option', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
            matchedZipcode: null,
            autoFetchInFlight: false,
            load,
        });
        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 0, orderable: false } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId="product-1"
                        initialDestination={{ postalCode: 'SW1A 1AA', countryCode: 'GB' }}
                    />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        const delivery = screen.getByRole('radio', { name: 'Delivery, Deliver to SW1A 1AA' });
        expect(delivery).toBeDisabled();
        expect(delivery).not.toBeChecked();
        const changeDestination = screen.getByRole('button', { name: 'Change destination: SW1A 1AA' });
        expect(delivery.parentElement).toContainElement(changeDestination);
        expect(delivery).toHaveAccessibleDescription('Arrives in 7–10 business days');
        expect(
            screen.queryByRole('button', { name: 'Enter a postal code to get a delivery estimate' })
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('standalone-target')).not.toContainElement(changeDestination);
        expect(screen.queryByRole('heading', { name: 'Estimated Delivery Date' })).not.toBeInTheDocument();
        expect(screen.getAllByText(/Deliver to\s*SW1A 1AA/)).toHaveLength(1);
        await user.click(changeDestination);

        expect(screen.getByTestId('standalone-target')).toContainElement(screen.getByRole('textbox'));
        expect(delivery.parentElement).not.toContainElement(screen.getByRole('textbox'));
        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');
        expect(screen.getByRole('radio', { name: 'Delivery, Deliver to SW1A 1AA' })).toHaveAccessibleDescription(
            'Arrives in 7–10 business days'
        );
        expect(screen.getByRole('status')).toHaveTextContent('Calculating...');
    });

    test('retains the postal-code disclosure when a resolved estimate changes to fallback guidance', async () => {
        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: deliveryEstimate,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        const renderEstimator = () => (
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>
        );
        const { rerender } = render(renderEstimator(), { wrapper: AllProvidersWrapper });

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Arrives in 7–10 business days',
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        rerender(renderEstimator());

        expect(await screen.findByRole('radio', { name: 'Delivery, Deliver to 94105' })).toBeInTheDocument();
    });

    test('clears coordinated presentation on product change', async () => {
        const { rerender } = render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );

        useShippingEstimate.mockReturnValue({
            isLoading: false,
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            autoFetchInFlight: false,
            load: vi.fn(),
        });
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-2">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'product-2', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <EstimatedDelivery productId="product-2" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
            'Enter a postal code to get a delivery estimate'
        );
    });

    test('coordinates only one estimator source and leaves duplicate estimators standalone', async () => {
        const user = userEvent.setup();
        render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="first-estimator">
                    <EstimatedDelivery
                        enableFulfillmentPresentation
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </div>
                <div data-testid="second-estimator">
                    <EstimatedDelivery
                        productId="product-1"
                        initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                    />
                </div>
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );
        expect(screen.getByTestId('first-estimator')).toContainElement(screen.getAllByRole('status')[0]);
        expect(screen.getByTestId('second-estimator')).toContainElement(
            within(screen.getByTestId('second-estimator')).getByRole('button', { name: 'Change destination: 94105' })
        );
        await user.click(screen.getByRole('radio', { name: /^Delivery/ }));
        expect(screen.getAllByRole('button', { name: 'Change destination: 94105' })).toHaveLength(2);
    });

    test('resolves every aria-labelledby reference in coordinated presentation', async () => {
        const { container } = render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: /^Delivery/ })).toHaveAccessibleDescription(
                expect.stringMatching(/^Estimated Sat 2 Jan.*Tue 5 Jan$/)
            )
        );

        for (const element of container.querySelectorAll('[aria-labelledby]')) {
            for (const id of element.getAttribute('aria-labelledby')?.split(/\s+/) ?? []) {
                expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
            }
        }
    });

    test.each([
        {
            name: 'loading',
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            isLoading: true,
            autoFetchInFlight: true,
        },
        {
            name: 'destination editing',
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            isLoading: false,
            autoFetchInFlight: false,
        },
        {
            name: 'hard error',
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
            isLoading: false,
            autoFetchInFlight: false,
        },
    ])('does not reference a standalone heading during coordinated $name presentation', async (state) => {
        useShippingEstimate.mockReturnValue({ ...state, load: vi.fn() });
        const { container } = render(
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <EstimatedDelivery
                    enableFulfillmentPresentation
                    productId="product-1"
                    initialDestination={{ postalCode: '94105', countryCode: 'US' }}
                />
            </ShippingDeliveryProvider>,
            { wrapper: AllProvidersWrapper }
        );

        await waitFor(() => expect(screen.getByRole('radio', { name: 'Delivery' })).toBeInTheDocument());
        for (const element of container.querySelectorAll('[aria-labelledby]')) {
            for (const id of element.getAttribute('aria-labelledby')?.split(/\s+/) ?? []) {
                expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
            }
        }
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
});
