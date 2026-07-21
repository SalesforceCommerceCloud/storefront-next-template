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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import ShippingMultiOptions from './shipping-multi-options';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { ShopperBasketsV2 } from '@/scapi';

const wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider config={mockConfig}>{children}</ConfigProvider>
);

// Mock hooks
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: vi.fn(),
}));

import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';

describe('ShippingMultiOptions', () => {
    const mockOnSubmit = vi.fn();
    const mockOnEdit = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCustomerProfile).mockReturnValue({
            addresses: [],
            paymentInstruments: [],
        });
    });

    const createDefaultProps = (overrides = {}) => ({
        onSubmit: mockOnSubmit,
        isLoading: false,
        isEditing: true,
        onEdit: mockOnEdit,
        isCompleted: false,
        shipments: [],
        shippingMethodsMap: {},
        ...overrides,
    });

    test('renders empty state when no shipments', () => {
        render(<ShippingMultiOptions {...createDefaultProps()} />, { wrapper });

        expect(screen.getByText(/no shipments available/i)).toBeInTheDocument();
    });

    test('renders shipments with shipping methods', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        price: 5.99,
                    },
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        expect(screen.getByLabelText(/standard shipping/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/express shipping/i)).toBeInTheDocument();
    });

    test('submits form with selected shipping methods', async () => {
        const user = userEvent.setup();

        // Prevent auto-submit by ensuring customerProfile is null for this test
        vi.mocked(useCustomerProfile).mockReturnValue(null as any);

        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        price: 5.99,
                    },
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // Select a shipping method
        const expressRadio = screen.getByLabelText(/express shipping/i);
        await user.click(expressRadio);

        // Wait a bit to ensure the selection is registered
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Submit form
        const submitButton = screen.getByRole('button', { name: /continue/i });
        await user.click(submitButton);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalled();
        });

        const formData = mockOnSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('shippingMethod_ship-1')).toBe('express');
    });

    test('auto-submits default shipping methods for registered customers', async () => {
        vi.mocked(useCustomerProfile).mockReturnValue({
            customer: { customerId: 'test-customer' },
            addresses: [],
            paymentInstruments: [],
        });

        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                defaultShippingMethodId: 'standard',
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        price: 5.99,
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // Wait for auto-submit
        await waitFor(
            () => {
                expect(mockOnSubmit).toHaveBeenCalled();
            },
            { timeout: 1000 }
        );

        const formData = mockOnSubmit.mock.calls[0][0] as FormData;
        expect(formData.get('shippingMethod_ship-1')).toBe('standard');
    });

    test('does not auto-submit for guest customers', async () => {
        // Mock guest customer - use null/undefined to represent no customer profile
        // The component checks `customerProfile` truthiness, so null/undefined prevents auto-submit
        vi.mocked(useCustomerProfile).mockReturnValue(null as any);

        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                defaultShippingMethodId: 'standard',
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        price: 5.99,
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // Wait a bit to ensure auto-submit doesn't happen
        await new Promise((resolve) => setTimeout(resolve, 600));

        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    test('disables submit button when no shipping methods available', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        const submitButton = screen.getByRole('button', { name: 'No shipping methods available' });
        expect(submitButton).toBeDisabled();
    });

    test('shows shipment labels when multiple shipments', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
            {
                shipmentId: 'ship-2',
                shippingAddress: {
                    firstName: 'Jane',
                    lastName: 'Smith',
                    address1: '456 Oak Ave',
                    city: 'Portland',
                    stateCode: 'OR',
                    postalCode: '97201',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        price: 5.99,
                    },
                ],
            },
            'ship-2': {
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        price: 5.99,
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // Should show shipment numbers when multiple shipments
        expect(screen.getByText(/shipment.*1/i)).toBeInTheDocument();
        expect(screen.getByText(/shipment.*2/i)).toBeInTheDocument();
    });

    test('displays estimated arrival time when available', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                        estimatedArrivalTime: '2-3 business days',
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        expect(screen.getByText(/2-3 business days/i)).toBeInTheDocument();
    });

    test('prefers deliveryWindow over estimatedArrivalTime when both are present', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                        estimatedArrivalTime: '2-3 business days',
                        deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // The formatted delivery window is shown; the raw estimatedArrivalTime is not.
        expect(screen.getByText(/Arrives/)).toBeInTheDocument();
        expect(screen.getByText(/30.*Apr|Apr 30/)).toBeInTheDocument();
        expect(screen.queryByText(/2-3 business days/i)).not.toBeInTheDocument();
    });

    test('falls back to estimatedArrivalTime when no deliveryWindow', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                        c_estimatedArrivalTime: 'Dec 15-17',
                    } as any,
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        expect(screen.getByText(/Dec 15-17/i)).toBeInTheDocument();
    });

    test('summary view shows the deliveryWindow of the selected method, not c_estimatedArrivalTime', () => {
        // The selected shipping method on the shipment carries only the id; the delivery window
        // lives on the matching applicableShippingMethods entry. The summary must resolve it.
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingMethod: { id: 'express' },
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                        c_estimatedArrivalTime: '2-3 business days',
                        deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                    } as any,
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                    isEditing: false,
                    isCompleted: true,
                })}
            />,
            { wrapper }
        );

        expect(screen.getByText(/30.*Apr|Apr 30/)).toBeInTheDocument();
        expect(screen.queryByText(/2-3 business days/i)).not.toBeInTheDocument();
    });

    test('summary view falls back to c_estimatedArrivalTime when the selected method has no deliveryWindow', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingMethod: { id: 'express' },
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        price: 12.99,
                        c_estimatedArrivalTime: '2 Business Days',
                    } as any,
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                    isEditing: false,
                    isCompleted: true,
                })}
            />,
            { wrapper }
        );

        expect(screen.getByText(/2 Business Days/i)).toBeInTheDocument();
    });

    test('displays free shipping when price is 0', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'free',
                        name: 'Free Shipping',
                        price: 0,
                    },
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // The component displays "FREE" when price is 0 (not "Free Shipping" which is the method name)
        expect(screen.getByText('FREE')).toBeInTheDocument();
    });

    test('filters invalid shipping methods', () => {
        const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
            {
                shipmentId: 'ship-1',
                shippingAddress: {
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                },
            },
        ];

        const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {
            'ship-1': {
                applicableShippingMethods: [
                    {
                        id: 'valid',
                        name: 'Valid Method',
                        price: 5.99,
                    },
                    {
                        // Missing id
                        name: 'Invalid Method',
                        price: 10.99,
                    } as any,
                    {
                        id: 'no-name',
                        // Missing name
                        price: 15.99,
                    } as any,
                    {
                        id: 'invalid-price',
                        name: 'Invalid Price',
                        price: NaN,
                    } as any,
                ],
            },
        };

        render(
            <ShippingMultiOptions
                {...createDefaultProps({
                    shipments,
                    shippingMethodsMap,
                })}
            />,
            { wrapper }
        );

        // Only valid method should be displayed
        expect(screen.getByText(/valid method/i)).toBeInTheDocument();
        expect(screen.queryByText(/invalid method/i)).not.toBeInTheDocument();
    });
});
