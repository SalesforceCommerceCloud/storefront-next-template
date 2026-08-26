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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import type { ShippingEstimate } from '@/lib/shipping-estimate/types';
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
        expect(screen.getByRole('button', { name: 'Calculate delivery estimate' })).toBeInTheDocument();
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
            fallbackDeliveryDescription:
                matchAgainst === 'SW1A 1AA' ? 'Order received within 7-10 business days' : null,
            matchedZipcode: null,
            autoFetchInFlight: false,
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
        expect(fallbackGuidance).toHaveTextContent('Order received within 7-10 business days');
        expect(changeDestination.compareDocumentPosition(fallbackGuidance) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
        expect(changeDestination).toHaveClass('underline');
        expect(changeDestination).toHaveClass('focus-visible:ring-2');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        await user.click(changeDestination);

        const input = screen.getByLabelText('postcode');
        expect(input).toHaveValue('SW1A 1AA');
        expect(input).toHaveAttribute('aria-describedby', 'estimated-delivery-message');
        expect(screen.getByRole('status')).toHaveTextContent('Order received within 7-10 business days');
        expect(screen.getByRole('button', { name: 'Calculate delivery estimate' })).toBeEnabled();
        await waitFor(() => expect(input).toHaveFocus());

        await user.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
        expect(load).toHaveBeenCalledWith('SW1A 1AA', 'GB');

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Change destination: SW1A 1AA' })).toBeInTheDocument();
    });

    test('returns to neutral instructions when the shopper edits a failed lookup', async () => {
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
        expect(screen.getByText('Enter your postcode (e.g. SW1A 1AA) to see delivery estimates.')).toBeInTheDocument();
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
            load,
        });
        render(<EstimatedDelivery productId="product-1" />, { wrapper: AllProvidersWrapper });

        const input = screen.getByLabelText('postcode') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'sw1a1aa' } });
        expect(input.value).toBe('SW1A 1AA');

        fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery estimate' }));
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
            load,
        });
        rerender(<EstimatedDelivery productId="product-1" />);

        const result = await screen.findByRole('status');
        await waitFor(() => expect(result).toHaveFocus());
        expect(result).toHaveTextContent(/Sat 2 Jan.*Tue 5 Jan/);
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

        const trigger = screen.getByRole('button', { name: 'See All Delivery Options' });
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
        await screen.findByRole('dialog');
        expect(infoModalProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }));
        expect(screen.getByText('Ground')).toBeInTheDocument();
        expect(screen.getByText('Express')).toBeInTheDocument();

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

        const trigger = screen.getByRole('button', { name: 'See All Delivery Options' });
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
        await user.click(await screen.findByRole('button', { name: 'See All Delivery Options' }));
        await screen.findByRole('dialog');

        act(() => setVisible(false));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Pickup' })));
    });
});
