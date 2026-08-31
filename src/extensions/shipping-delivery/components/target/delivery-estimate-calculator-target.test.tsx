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
import { useLayoutEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    ShippingDeliveryProvider,
    type ShippingDeliveryPresentation,
    useShippingDelivery,
} from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import { useAuth } from '@/providers/auth';
import { useOptionalProductView } from '@/providers/product-view';
import { resourceRoutes } from '@/route-paths';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// @sfdc-extension-line SFDC_EXT_BOPIS
import DeliveryOptions from '@/components/fulfillment/delivery-options';
import DeliveryEstimateCalculatorTarget from './delivery-estimate-calculator-target';

const useDeliveryDestination = vi.hoisted(() => vi.fn());
const useFetcher = vi.hoisted(() => vi.fn());
type DestinationFetcher = {
    state: 'idle';
    data:
        | { success: true; destination: { postalCode: string; countryCode: string } | null }
        | { success: false }
        | undefined;
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
    default: function MockEstimatedDelivery({
        productId,
        initialDestination,
        enableFulfillmentPresentation,
        fulfillmentPresentationSourceId,
        focusPostalCodeOnMount,
        onFulfillmentPresentationChange,
    }: {
        productId: string;
        initialDestination?: { postalCode: string; countryCode?: string };
        enableFulfillmentPresentation?: boolean;
        fulfillmentPresentationSourceId?: object;
        focusPostalCodeOnMount?: boolean;
        onFulfillmentPresentationChange?: (presentation: ShippingDeliveryPresentation | null) => void;
    }) {
        const shippingDelivery = useShippingDelivery();
        useLayoutEffect(() => {
            if (!fulfillmentPresentationSourceId || !initialDestination?.postalCode) return;
            if (productId === 'variant-without-estimate') {
                onFulfillmentPresentationChange?.(null);
                return;
            }
            onFulfillmentPresentationChange?.({
                kind: productId === 'fallback-product' ? 'fallback' : 'resolved',
                sourceId: fulfillmentPresentationSourceId,
                productId: shippingDelivery?.productId ?? productId,
                title: `Deliver to ${initialDestination.postalCode}`,
                text:
                    productId === 'fallback-product' ? 'Order received within 7-10 business days' : 'Arrives tomorrow',
            });
        }, [
            fulfillmentPresentationSourceId,
            initialDestination?.postalCode,
            onFulfillmentPresentationChange,
            productId,
            shippingDelivery?.productId,
        ]);

        return (
            <button
                data-testid="delivery-estimate-calculator"
                data-zip={initialDestination?.postalCode}
                data-country={initialDestination?.countryCode}
                data-focus-postal-code={focusPostalCodeOnMount || undefined}
                data-presentation={enableFulfillmentPresentation || undefined}>
                {productId}
            </button>
        );
    },
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

// @sfdc-extension-block-start SFDC_EXT_BOPIS
function renderTargetWithEligibleHost() {
    return render(
        <AllProvidersWrapper>
            <ShippingDeliveryProvider productId="product-1">
                <DeliveryOptions
                    enableDeliveryEstimatePresentation
                    instanceId="primary"
                    product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                    quantity={1}
                    pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                />
                <div data-testid="standalone-target">
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </div>
            </ShippingDeliveryProvider>
        </AllProvidersWrapper>
    );
}

function RequestDeliveryEstimate({ productId }: { productId: string }) {
    const shippingDelivery = useShippingDelivery();

    return (
        <button type="button" onClick={() => shippingDelivery?.requestDeliveryEstimate?.(productId)}>
            Request delivery estimate
        </button>
    );
}
// @sfdc-extension-block-end SFDC_EXT_BOPIS

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
        expect(calculator).toHaveAttribute('data-presentation', 'true');
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('discloses and focuses a no-destination calculator when Delivery is selected in an eligible host', async () => {
        const user = userEvent.setup();
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        useDeliveryDestination.mockReturnValue(null);
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                observe(): void {}

                disconnect(): void {}
            }
        );
        renderTargetWithEligibleHost();

        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Delivery' })).not.toBeChecked();

        screen.getByRole('radio', { name: 'Delivery' }).focus();
        await user.keyboard(' ');

        const calculator = await screen.findByTestId('delivery-estimate-calculator');
        expect(calculator).not.toHaveAttribute('data-zip');
        expect(calculator).toHaveAttribute('data-focus-postal-code', 'true');
        expect(screen.getByRole('radio', { name: 'Delivery' }).parentElement).toHaveTextContent(
            'Enter postal code to see delivery estimate'
        );
    });

    test('keeps a saved-destination fallback calculator at the standalone target when Delivery is unavailable', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        useDeliveryDestination.mockReturnValue({ postalCode: 'SW1A 1AA', countryCode: 'GB' });

        render(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="fallback-product">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'fallback-product', inventory: { ats: 0, orderable: false } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        const delivery = await screen.findByRole('radio', { name: 'Delivery, Deliver to SW1A 1AA' });
        expect(delivery).toBeDisabled();
        expect(delivery).not.toBeChecked();

        expect(await screen.findByTestId('delivery-estimate-calculator')).toHaveAttribute('data-zip', 'SW1A 1AA');
    });

    test('discloses the selected-variant calculator from a master-product fulfillment host', async () => {
        const user = userEvent.setup();
        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-1' },
        } as never);
        useDeliveryDestination.mockReturnValue(null);
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                observe(): void {}

                disconnect(): void {}
            }
        );

        render(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'variant-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();

        await user.click(screen.getByRole('radio', { name: 'Delivery' }));

        expect(await screen.findByTestId('delivery-estimate-calculator')).toHaveTextContent('variant-1');
    });

    test('does not retain a resolved presentation when the selected variant has no estimate', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-1' },
        } as never);
        const { rerender } = render(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'master-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(await screen.findByRole('radio', { name: 'Delivery, Deliver to 94105' })).toBeInTheDocument();

        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-without-estimate' },
        } as never);
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'master-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(await screen.findAllByText('Enter postal code to see delivery estimate')).toHaveLength(2);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

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
        expect(screen.getByRole('region', { name: 'Estimated Delivery Date' })).toHaveAttribute('aria-busy', 'true');
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

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('loads a registered shopper profile only after the postal-code action', async () => {
        const user = userEvent.setup();
        const load = vi.fn();
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        vi.mocked(useAuth).mockReturnValue({ userType: 'registered' } as never);
        useDeliveryDestination.mockReturnValue(null);
        useFetcher.mockReturnValue({ state: 'idle', data: undefined, load });

        renderTargetWithEligibleHost();

        expect(load).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Enter postal code to see delivery estimate' })
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        await user.click(screen.getByRole('radio', { name: 'Delivery' }));

        expect(load).toHaveBeenCalledWith(resourceRoutes.shippingDestination);
        const skeleton = await screen.findByRole('region', { name: 'Estimated Delivery Date' });
        expect(screen.getByTestId('standalone-target')).toContainElement(skeleton);
        expect(screen.getByRole('radio', { name: 'Delivery' }).parentElement).not.toContainElement(skeleton);
    });

    test.each([
        { success: true, destination: null } as const,
        { success: false } as const,
    ])('renders the standalone calculator when a requested registered-profile lookup settles without a destination', async (data) => {
        const user = userEvent.setup();
        const load = vi.fn();
        const fetcher: DestinationFetcher = { state: 'idle', data: undefined, load };
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        vi.mocked(useAuth).mockReturnValue({ userType: 'registered' } as never);
        useDeliveryDestination.mockReturnValue(null);
        useFetcher.mockReturnValue(fetcher);

        const { rerender } = renderTargetWithEligibleHost();

        expect(load).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Enter postal code to see delivery estimate' })
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole('radio', { name: 'Delivery' }));
        expect(load).toHaveBeenCalledWith(resourceRoutes.shippingDestination);
        expect(await screen.findByRole('region', { name: 'Estimated Delivery Date' })).toHaveAttribute(
            'aria-busy',
            'true'
        );

        fetcher.data = data;
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
                    <div data-testid="standalone-target">
                        <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                    </div>
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(await screen.findByTestId('delivery-estimate-calculator')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('defers saved-destination presentation until the hosted calculator target is visible', async () => {
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

        renderTargetWithEligibleHost();

        const delivery = screen.getByRole('radio', { name: 'Delivery' });
        expect(delivery).toHaveAccessibleDescription('Enter postal code to see delivery estimate');
        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();

        act(() => {
            intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });

        expect(await screen.findByTestId('delivery-estimate-calculator')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Delivery, Deliver to 94105' })).toBeInTheDocument();
    });

    test('does not server-render a standalone calculator card for an eligible host', () => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);

        const html = renderToString(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(html).not.toContain('Estimated Delivery Date');
        expect(html).not.toContain('Calculating...');
    });

    test('keeps the standalone calculator fallback in server HTML without an eligible host', () => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);

        const html = renderToString(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(html).toContain('Estimated Delivery Date');
        expect(html).toContain('data-slot="skeleton"');
        expect(html).not.toContain('Calculating...');
    });

    test.each([
        ['an eligible host', true],
        ['no eligible host', false],
    ])('hydrates the calculator target without a mismatch when rendered with %s', async (_name, includeHost) => {
        vi.mocked(useOptionalProductView).mockReturnValue(null);
        const renderApp = () => (
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="product-1">
                    {includeHost && (
                        <DeliveryOptions
                            enableDeliveryEstimatePresentation
                            instanceId="primary"
                            product={{ id: 'product-1', inventory: { ats: 1, orderable: true } } as never}
                            quantity={1}
                            pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                        />
                    )}
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );
        const container = document.createElement('div');
        container.innerHTML = renderToString(renderApp());
        document.body.appendChild(container);

        const recoverableErrors: string[] = [];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            let root: ReturnType<typeof hydrateRoot>;
            await act(async () => {
                root = hydrateRoot(container, renderApp(), {
                    onRecoverableError: (error) => recoverableErrors.push(String(error)),
                });
                await Promise.resolve();
            });

            const complaints = [...errorSpy.mock.calls.map((call) => String(call[0])), ...recoverableErrors];
            expect(complaints.filter((message) => /hydrat/i.test(message))).toEqual([]);

            act(() => root.unmount());
        } finally {
            errorSpy.mockRestore();
            document.body.removeChild(container);
        }
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    test('renders nothing without a shipping delivery provider', () => {
        render(
            <AllProvidersWrapper>
                <DeliveryEstimateCalculatorTarget displayStyle="summary" />
            </AllProvidersWrapper>
        );

        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();
        expect(screen.queryByText('Estimated Delivery Date')).not.toBeInTheDocument();
    });

    test('does not render or load an estimate for a nested Quick Add product view', () => {
        const load = vi.fn();
        vi.mocked(useOptionalProductView).mockReturnValue({
            product: { id: 'quick-add-product' },
            currentVariant: { productId: 'quick-add-variant' },
        } as never);
        vi.mocked(useAuth).mockReturnValue({ userType: 'registered' } as never);
        useFetcher.mockReturnValue({ state: 'idle', data: undefined, load });

        renderTarget();

        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();
        expect(load).not.toHaveBeenCalled();
    });

    test('passes the resolved variant product to the live calculator', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-1' },
        } as never);
        renderTarget();

        expect(await screen.findByTestId('delivery-estimate-calculator')).toHaveTextContent('variant-1');
    });

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    test('does not disclose or refocus a destination-less calculator for a later variant', async () => {
        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-1' },
        } as never);
        useDeliveryDestination.mockReturnValue(null);
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                observe(): void {}

                disconnect(): void {}
            }
        );

        const { rerender } = render(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'master-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <RequestDeliveryEstimate productId="variant-1" />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        await userEvent.click(screen.getByRole('button', { name: 'Request delivery estimate' }));
        expect(await screen.findByTestId('delivery-estimate-calculator')).toHaveTextContent('variant-1');
        const variantSelector = document.createElement('button');
        variantSelector.textContent = 'Select variant 2';
        document.body.appendChild(variantSelector);
        variantSelector.focus();

        vi.mocked(useOptionalProductView).mockReturnValue({
            currentVariant: { productId: 'variant-2' },
        } as never);
        rerender(
            <AllProvidersWrapper>
                <ShippingDeliveryProvider productId="master-1">
                    <DeliveryOptions
                        enableDeliveryEstimatePresentation
                        instanceId="primary"
                        product={{ id: 'master-1', inventory: { ats: 1, orderable: true } } as never}
                        quantity={1}
                        pickupLocation={{ id: 'store-1', inventoryId: 'inventory-1' }}
                    />
                    <RequestDeliveryEstimate productId="variant-1" />
                    <DeliveryEstimateCalculatorTarget displayStyle="summary" />
                </ShippingDeliveryProvider>
            </AllProvidersWrapper>
        );

        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();
        expect(variantSelector).toHaveFocus();
        document.body.removeChild(variantSelector);
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

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

    test('shows a skeleton before the standalone lazy calculator mounts', async () => {
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

        const skeleton = await screen.findByRole('region', { name: 'Estimated Delivery Date' });
        expect(skeleton).toHaveAttribute('aria-busy', 'true');
        expect(skeleton.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByTestId('delivery-estimate-calculator')).not.toBeInTheDocument();

        act(() => {
            intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });

        expect(await screen.findByTestId('delivery-estimate-calculator')).not.toHaveAttribute('data-zip');
        expect(skeleton).not.toBeInTheDocument();
    });
});
