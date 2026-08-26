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
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ShippingDeliveryProvider } from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import { useAuth } from '@/providers/auth';
import { useOptionalProductView } from '@/providers/product-view';
import { resourceRoutes } from '@/route-paths';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import DeliveryEstimateCalculatorTarget from './delivery-estimate-calculator-target';

const useDeliveryDestination = vi.hoisted(() => vi.fn());
const useFetcher = vi.hoisted(() => vi.fn());
type DestinationFetcher = {
    state: 'idle';
    data: { success: true; destination: { postalCode: string; countryCode: string } } | undefined;
    load: ReturnType<typeof vi.fn>;
};

vi.mock('@/providers/product-view', () => ({
    useOptionalProductView: vi.fn(),
}));

vi.mock('@/providers/auth', () => ({ useAuth: vi.fn() }));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    useFetcher,
}));

vi.mock('@/extensions/shipping-delivery/lib/api/use-delivery-destination', () => ({ useDeliveryDestination }));

vi.mock('@/extensions/shipping-delivery/components/estimated-delivery', () => ({
    default: ({
        productId,
        initialDestination,
    }: {
        productId: string;
        initialDestination?: { postalCode: string; countryCode?: string };
    }) => (
        <button
            data-testid="delivery-estimate-calculator"
            data-zip={initialDestination?.postalCode}
            data-country={initialDestination?.countryCode}>
            {productId}
        </button>
    ),
}));

function renderTarget() {
    return render(
        <AllProvidersWrapper>
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryEstimateCalculatorTarget displayStyle="summary" />
            </ShippingDeliveryProvider>
        </AllProvidersWrapper>
    );
}

describe('DeliveryEstimateCalculatorTarget', () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;

    beforeEach(() => {
        vi.mocked(useOptionalProductView).mockReset();
        vi.mocked(useAuth).mockReturnValue(undefined);
        useDeliveryDestination.mockReturnValue({ postalCode: '94105', countryCode: 'US' });
        useFetcher.mockReturnValue({ state: 'idle', data: undefined, load: vi.fn() });
        intersectionCallback = undefined;
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                constructor(callback: IntersectionObserverCallback) {
                    intersectionCallback = callback;
                }

                observe(): void {
                    intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
                }

                disconnect(): void {}
            }
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('passes the product and saved postal code to the live calculator', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        renderTarget();

        const calculator = await screen.findByTestId('delivery-estimate-calculator');
        expect(calculator).toHaveTextContent('product-1');
        expect(calculator).toHaveAttribute('data-zip', '94105');
    });

    test('uses an empty destination when the browser has no saved destination', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        useDeliveryDestination.mockReturnValue(null);
        renderTarget();

        const calculator = await screen.findByTestId('delivery-estimate-calculator');
        expect(calculator).not.toHaveAttribute('data-zip');
        expect(calculator).not.toHaveAttribute('data-country');
    });

    test('waits for a registered shopper address only after the target becomes visible', async () => {
        const load = vi.fn();
        const fetcher: DestinationFetcher = { state: 'idle', data: undefined, load };
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        vi.mocked(useAuth).mockReturnValue({ userType: 'registered' } as never);
        useDeliveryDestination.mockReturnValue(null);
        useFetcher.mockReturnValue(fetcher);

        const { rerender } = renderTarget();

        expect(load).toHaveBeenCalledWith(resourceRoutes.shippingDestination);
        expect(screen.getByRole('status')).toHaveTextContent('Calculating...');
        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();

        fetcher.data = { success: true, destination: { postalCode: 'M5V 3A8', countryCode: 'CA' } };
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        const calculator = await screen.findByTestId('delivery-estimate-calculator');
        expect(calculator).toHaveAttribute('data-zip', 'M5V 3A8');
        expect(calculator).toHaveAttribute('data-country', 'CA');
    });

    test('renders nothing without a shipping delivery provider', () => {
        render(
            <AllProvidersWrapper>
                <DeliveryEstimateCalculatorTarget displayStyle="summary" />
            </AllProvidersWrapper>
        );

        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();
        expect(screen.queryByText('Estimated Delivery Date')).not.toBeInTheDocument();
    });

    test('passes the resolved variant product to the live calculator', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-1' },
        } as never);
        renderTarget();

        expect(await screen.findByTestId('delivery-estimate-calculator')).toHaveTextContent('variant-1');
    });

    test.each([
        ['Delivery', { optionId: 'delivery' }],
        ['Pickup', { optionId: 'pickup' }],
        ['no fulfillment selection', undefined],
    ])('shows the calculator when %s is selected', async (_label, fulfillmentSelection) => {
        vi.mocked(useOptionalProductView).mockReturnValue({ fulfillmentSelection } as never);
        renderTarget();

        const calculator = await screen.findByTestId('delivery-estimate-calculator');
        expect(calculator.parentElement).not.toHaveAttribute('hidden');
        expect(calculator).toHaveAttribute('data-zip', '94105');
        expect(screen.getByRole('button')).toBe(calculator);
    });

    test('keeps the calculator visible when the fulfillment selection changes', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue({ fulfillmentSelection: { optionId: 'delivery' } } as never);
        const { rerender } = renderTarget();
        const calculator = await screen.findByTestId('delivery-estimate-calculator');

        vi.mocked(useOptionalProductView).mockReturnValue({ fulfillmentSelection: { optionId: 'pickup' } } as never);
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(screen.getByTestId('delivery-estimate-calculator')).toBe(calculator);
        expect(calculator.parentElement).not.toHaveAttribute('hidden');

        vi.mocked(useOptionalProductView).mockReturnValue({ fulfillmentSelection: undefined } as never);
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(screen.getByTestId('delivery-estimate-calculator')).toBe(calculator);
        expect(calculator.parentElement).not.toHaveAttribute('hidden');
    });

    test('prompts for a postal code instead of announcing calculation before the lazy calculator mounts', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                constructor(callback: IntersectionObserverCallback) {
                    intersectionCallback = callback;
                }

                observe(): void {}

                disconnect(): void {}
            }
        );

        useDeliveryDestination.mockReturnValue(null);
        renderTarget();

        expect(await screen.findByText('Enter your postal code to see delivery estimates.')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();

        act(() => {
            intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });

        expect(await screen.findByTestId('delivery-estimate-calculator')).not.toHaveAttribute('data-zip');
    });
});
