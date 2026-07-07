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
import { render as rtlRender, screen, waitFor, renderHook, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShippingOptions from './shipping-options';
import { useShippingOptions } from './use-shipping-options';
import type { ShopperBasketsV2 } from '@/scapi';
import { mockAltSiteObject } from '@/test-utils/config';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const render = (ui: React.ReactElement, options?: RenderOptions) =>
    rtlRender(ui, { wrapper: AllProvidersWrapper, ...options });

vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: vi.fn(() => null),
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useSite: vi.fn(() => ({
            site: { id: mockAltSiteObject.id, defaultLocale: mockAltSiteObject.defaultLocale },
            language: mockAltSiteObject.defaultLocale,
            currency: mockAltSiteObject.defaultCurrency,
        })),
    };
});

const createMockBasket = (overrides = {}) => ({
    basketId: 'test-basket-123',
    currency: mockAltSiteObject.defaultCurrency,
    customerInfo: { email: 'test@example.com' },
    shipments: [
        {
            shipmentId: 'shipment-1',
            shippingAddress: {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
            },
        },
    ],
    ...overrides,
});

const createShippingMethods = (): ShopperBasketsV2.schemas['ShippingMethodResult'] => ({
    applicableShippingMethods: [
        { id: 'standard', name: 'Standard Shipping', description: '5-7 business days', price: 5.99 },
        { id: 'express', name: 'Express Shipping', description: '2-3 business days', price: 12.99 },
        { id: 'overnight', name: 'Overnight Shipping', description: 'Next business day', price: 24.99 },
    ],
    defaultShippingMethodId: 'standard',
});

const createDefaultProps = (overrides = {}) => ({
    onSubmit: vi.fn(),
    isLoading: false,
    actionData: undefined,
    shippingMethods: createShippingMethods(),
    isCompleted: false,
    isEditing: true,
    onEdit: vi.fn(),
    ...overrides,
});

// ─── Hook Tests ──────────────────────────────────────────────────────────────

describe('useShippingOptions', () => {
    let useBasket: ReturnType<typeof vi.fn>;
    let useCustomerProfile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const basketModule = await import('@/providers/basket');
        const profileModule = await import('@/hooks/checkout/use-customer-profile');
        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useCustomerProfile = profileModule.useCustomerProfile as ReturnType<typeof vi.fn>;
        useBasket.mockReturnValue(createMockBasket());
        useCustomerProfile.mockReturnValue(null);
    });

    const renderShippingHook = (overrides = {}) =>
        renderHook(() =>
            useShippingOptions({
                onSubmit: vi.fn(),
                isLoading: false,
                shippingMethods: createShippingMethods(),
                isEditing: true,
                ...overrides,
            })
        );

    test('excludes methods with missing id, name, or invalid price', () => {
        const { result } = renderShippingHook({
            shippingMethods: {
                applicableShippingMethods: [
                    { id: '', name: 'No ID', price: 5 },
                    { id: 'ok', name: '', price: 5 },
                    { id: 'nan', name: 'NaN Price', price: NaN },
                    { id: 'valid', name: 'Valid', price: 9.99 },
                ],
            },
        });
        expect(result.current.availableShippingMethods).toEqual([{ id: 'valid', name: 'Valid', price: 9.99 }]);
    });

    test('resolves summaryMethod from available list when basket method matches', () => {
        useBasket.mockReturnValue(
            createMockBasket({ shipments: [{ shipmentId: 's1', shippingMethod: { id: 'express' } }] })
        );
        const { result } = renderShippingHook();
        expect(result.current.summaryMethod).toEqual({
            id: 'express',
            name: 'Express Shipping',
            description: '2-3 business days',
            price: 12.99,
        });
    });

    test('returns undefined summaryMethod when basket method is not in available list', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: { id: 'unlisted', name: 'Custom', description: 'desc', price: 7.5 },
                    },
                ],
            })
        );
        const { result } = renderShippingHook();
        expect(result.current.summaryMethod).toBeUndefined();
    });

    describe('getDiscountedPrice', () => {
        test('returns base price when no discount exists', () => {
            const { result } = renderShippingHook();
            expect(result.current.getDiscountedPrice(10)).toBe(10);
        });

        test('returns 0 for free discount type', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'free' } }] }],
                })
            );
            const { result } = renderShippingHook();
            expect(result.current.getDiscountedPrice(10)).toBe(0);
        });

        test('applies percentage discount', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'percentage', amount: 0.5 } }] }],
                })
            );
            const { result } = renderShippingHook();
            expect(result.current.getDiscountedPrice(10)).toBe(5);
        });

        test('applies amount discount and floors at 0', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'amount', amount: 15 } }] }],
                })
            );
            const { result } = renderShippingHook();
            expect(result.current.getDiscountedPrice(10)).toBe(0);
        });

        test('applies fixed_price discount', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'fixed_price', amount: 3.99 } }] }],
                })
            );
            const { result } = renderShippingHook();
            expect(result.current.getDiscountedPrice(10)).toBe(3.99);
        });
    });

    describe('auto-submit for returning customers', () => {
        const setupAutoSubmit = (overrides = {}) => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } });
            useBasket.mockReturnValue(createMockBasket({ shipments: [{ shipmentId: 's1', shippingMethod: null }] }));
            return { onSubmit, hookOverrides: { onSubmit, isEditing: true, ...overrides } };
        };

        test('auto-submits default method for returning customer with no selection', async () => {
            const { onSubmit, hookOverrides } = setupAutoSubmit();
            renderShippingHook(hookOverrides);

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledTimes(1);
                const formData = onSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('standard');
            });
        });

        test('does not auto-submit for guest users when no promotions exist', async () => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue(null);
            useBasket.mockReturnValue(createMockBasket({ shipments: [{ shipmentId: 's1', shippingMethod: null }] }));
            renderShippingHook({ onSubmit, isEditing: true });

            await vi.waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
        });

        test('auto-submits via onAutoSubmit for guest who just entered address with promotions present', async () => {
            const onSubmit = vi.fn();
            const onAutoSubmit = vi.fn();
            useCustomerProfile.mockReturnValue(null);
            useBasket.mockReturnValue(createMockBasket({ shipments: [{ shipmentId: 's1', shippingMethod: null }] }));
            renderShippingHook({
                onSubmit,
                onAutoSubmit,
                isEditing: true,
                justEnteredAddress: true,
                shippingMethods: {
                    applicableShippingMethods: [
                        {
                            id: 'standard',
                            name: 'Standard',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    ],
                    defaultShippingMethodId: 'standard',
                },
            });

            await waitFor(() => {
                expect(onSubmit).not.toHaveBeenCalled();
                expect(onAutoSubmit).toHaveBeenCalledTimes(1);
                const formData = onAutoSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('standard');
            });
        });

        test('auto-submits via onSubmit for guest with promotions when justEnteredAddress is false', async () => {
            const onSubmit = vi.fn();
            const onAutoSubmit = vi.fn();
            useCustomerProfile.mockReturnValue(null);
            useBasket.mockReturnValue(createMockBasket({ shipments: [{ shipmentId: 's1', shippingMethod: null }] }));
            renderShippingHook({
                onSubmit,
                onAutoSubmit,
                isEditing: true,
                justEnteredAddress: false,
                shippingMethods: {
                    applicableShippingMethods: [
                        {
                            id: 'standard',
                            name: 'Standard',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    ],
                    defaultShippingMethodId: 'standard',
                },
            });

            await waitFor(() => {
                expect(onAutoSubmit).not.toHaveBeenCalled();
                expect(onSubmit).toHaveBeenCalledTimes(1);
                const formData = onSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('standard');
            });
        });

        test('does not auto-submit when a method is already selected and no promotions exist', async () => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } });
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [{ shipmentId: 's1', shippingMethod: { id: 'standard', name: 'Standard' } }],
                })
            );
            renderShippingHook({ onSubmit, isEditing: true });

            await vi.waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
        });

        test('auto-submits selected method to recalculate price when promotions exist but priceAdjustments are absent', async () => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } });
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [{ shipmentId: 's1', shippingMethod: { id: 'standard', name: 'Standard' } }],
                    shippingItems: [{}], // no priceAdjustments yet
                })
            );
            renderShippingHook({
                onSubmit,
                isEditing: true,
                shippingMethods: {
                    applicableShippingMethods: [
                        {
                            id: 'standard',
                            name: 'Standard',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    ],
                },
            });

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledTimes(1);
                const formData = onSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('standard');
            });
        });

        test('uses onAutoSubmit for price recalculation when justEnteredAddress is true', async () => {
            const onSubmit = vi.fn();
            const onAutoSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } });
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [{ shipmentId: 's1', shippingMethod: { id: 'standard', name: 'Standard' } }],
                    shippingItems: [{}], // no priceAdjustments yet
                })
            );
            renderShippingHook({
                onSubmit,
                onAutoSubmit,
                isEditing: true,
                justEnteredAddress: true,
                shippingMethods: {
                    applicableShippingMethods: [
                        {
                            id: 'standard',
                            name: 'Standard',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    ],
                },
            });

            await waitFor(() => {
                expect(onSubmit).not.toHaveBeenCalled();
                expect(onAutoSubmit).toHaveBeenCalledTimes(1);
                const formData = onAutoSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('standard');
            });
        });

        test('does not auto-submit when method is selected and priceAdjustments are already present', async () => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } });
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [{ shipmentId: 's1', shippingMethod: { id: 'standard', name: 'Standard' } }],
                    shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'free' } }] }],
                })
            );
            renderShippingHook({
                onSubmit,
                isEditing: true,
                shippingMethods: {
                    applicableShippingMethods: [
                        {
                            id: 'standard',
                            name: 'Standard',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    ],
                },
            });

            await vi.waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
        });

        test('falls back to first method when defaultShippingMethodId is invalid', async () => {
            const { onSubmit, hookOverrides } = setupAutoSubmit({
                shippingMethods: {
                    applicableShippingMethods: [
                        { id: 'standard', name: 'Standard', price: 5.99 },
                        { id: 'express', name: 'Express', price: 12.99 },
                    ],
                    defaultShippingMethodId: 'nonexistent',
                },
            });
            renderShippingHook(hookOverrides);

            await waitFor(() => {
                const formData = onSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('standard');
            });
        });

        test('uses valid defaultShippingMethodId when available', async () => {
            const { onSubmit, hookOverrides } = setupAutoSubmit({
                shippingMethods: {
                    applicableShippingMethods: [
                        { id: 'standard', name: 'Standard', price: 5.99 },
                        { id: 'express', name: 'Express', price: 12.99 },
                    ],
                    defaultShippingMethodId: 'express',
                },
            });
            renderShippingHook(hookOverrides);

            await waitFor(() => {
                const formData = onSubmit.mock.calls[0][0] as FormData;
                expect(formData.get('shippingMethodId')).toBe('express');
            });
        });

        test('resets auto-submit guard when leaving and re-entering step', async () => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } });
            useBasket.mockReturnValue(createMockBasket({ shipments: [{ shipmentId: 's1', shippingMethod: null }] }));
            const baseProps = {
                onSubmit,
                isLoading: false,
                shippingMethods: createShippingMethods(),
                isEditing: true,
            };

            const { rerender } = renderHook((props: typeof baseProps) => useShippingOptions(props), {
                initialProps: baseProps,
            });

            await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

            rerender({ ...baseProps, isEditing: false });
            onSubmit.mockClear();

            rerender({ ...baseProps, isEditing: true });

            await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        });
    });
});

// ─── Component Tests ─────────────────────────────────────────────────────────

describe('ShippingOptions Component', () => {
    let useBasket: ReturnType<typeof vi.fn>;
    let useCustomerProfile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const basketModule = await import('@/providers/basket');
        const profileModule = await import('@/hooks/checkout/use-customer-profile');
        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useCustomerProfile = profileModule.useCustomerProfile as ReturnType<typeof vi.fn>;
        useBasket.mockReturnValue(createMockBasket());
        useCustomerProfile.mockReturnValue(null);
    });

    test('renders "Free" instead of $0.00 for zero-price methods', () => {
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                { id: 'free', name: 'Free Standard', description: '7-10 days', price: 0 },
                { id: 'express', name: 'Express', description: '2-3 days', price: 12.99 },
            ],
        };
        render(<ShippingOptions {...createDefaultProps({ shippingMethods: methods })} />);

        expect(screen.getByText(/^free$/i)).toBeInTheDocument();
        expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
        expect(screen.getByText('$12.99')).toBeInTheDocument();
    });

    test('selects a method and submits the correct shippingMethodId', async () => {
        const user = userEvent.setup();
        const handleSubmit = vi.fn();
        render(<ShippingOptions {...createDefaultProps({ onSubmit: handleSubmit })} />);

        await user.click(screen.getByLabelText(/2-3 business days/i));
        await user.click(screen.getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(handleSubmit).toHaveBeenCalledTimes(1);
            const formData = handleSubmit.mock.calls[0][0] as FormData;
            expect(formData.get('shippingMethodId')).toBe('express');
        });
    });

    test('pre-selects the method already on the basket', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [{ shipmentId: 's1', shippingMethod: { id: 'express', name: 'Express', price: 12.99 } }],
            })
        );
        render(<ShippingOptions {...createDefaultProps()} />);

        expect(screen.getByLabelText(/2-3 business days/i)).toBeChecked();
    });

    test('shows description and price in summary view', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: {
                            id: 'express',
                            name: 'Express Shipping',
                            description: '2-3 days',
                            price: 12.99,
                        },
                    },
                ],
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                { id: 'express', name: 'Express Shipping', description: '2-3 days', price: 12.99 },
            ],
        };
        render(
            <ShippingOptions
                {...createDefaultProps({ shippingMethods: methods, isEditing: false, isCompleted: true })}
            />
        );

        expect(screen.getByText('2-3 days')).toBeInTheDocument();
        expect(screen.getByText('$12.99 | Express Shipping')).toBeInTheDocument();
    });

    test('shows "Free" in summary for zero-price selected method', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [{ shipmentId: 's1', shippingMethod: { id: 'free', name: 'Free Standard', price: 0 } }],
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [{ id: 'free', name: 'Free Standard', price: 0 }],
        };
        render(
            <ShippingOptions
                {...createDefaultProps({ shippingMethods: methods, isEditing: false, isCompleted: true })}
            />
        );

        expect(screen.getByText('FREE | Free Standard')).toBeInTheDocument();
        expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    });

    test('shows correct prompt for guest vs signed-in user when no method selected', () => {
        render(<ShippingOptions {...createDefaultProps({ isEditing: false })} />);
        expect(screen.getByText(/complete previous steps to continue/i)).toBeInTheDocument();

        useCustomerProfile.mockReturnValue({ customer: { customerId: 'c1' } } as never);
        const { unmount } = render(<ShippingOptions {...createDefaultProps({ isEditing: false })} />);
        expect(screen.getByText(/enter your shipping address to view available shipping methods/i)).toBeInTheDocument();
        unmount();
    });

    test('uses description as primary label and name as secondary label', () => {
        render(<ShippingOptions {...createDefaultProps()} />);

        const labels = screen.getAllByText(/business day/i);
        expect(labels[0].tagName).toBe('SPAN');
        expect(labels[0].className).toContain('font-medium');

        const secondaryLabels = screen.getAllByText(/Shipping$/);
        for (const label of secondaryLabels) {
            expect(label.className).toContain('pl-6');
        }
    });

    test('falls back to name as primary label when description is absent', () => {
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [{ id: 'basic', name: 'Basic Shipping', price: 3.99 }],
        };
        render(<ShippingOptions {...createDefaultProps({ shippingMethods: methods })} />);

        const primaryLabel = screen.getByText('Basic Shipping', { selector: '.font-medium' });
        expect(primaryLabel).toBeInTheDocument();
    });

    test('shows strikethrough price with discounted price in summary view', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: {
                            id: 'standard',
                            name: 'Standard Shipping',
                            description: '5-7 days',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    },
                ],
                shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'free' } }] }],
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                {
                    id: 'standard',
                    name: 'Standard Shipping',
                    description: '5-7 days',
                    price: 5.99,
                    shippingPromotions: [{ promotionId: 'promo1' }],
                },
            ],
        };
        render(
            <ShippingOptions
                {...createDefaultProps({ shippingMethods: methods, isEditing: false, isCompleted: true })}
            />
        );

        const strikethrough = screen.getByText('$5.99');
        expect(strikethrough.className).toContain('line-through');
        expect(screen.getByText(/Standard Shipping/)).toBeInTheDocument();
    });

    test('does not show strikethrough when promotion is on the method but basket has no priceAdjustments yet', () => {
        // Basket loaded before a shipping method is submitted — priceAdjustments is absent.
        // getDiscountedPrice returns base price unchanged, so both prices would be identical.
        // The guard must suppress the strikethrough in this case.
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: {
                            id: 'standard',
                            name: 'Standard Shipping',
                            description: '5-7 days',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1' }],
                        },
                    },
                ],
                shippingItems: [{}], // no priceAdjustments
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                {
                    id: 'standard',
                    name: 'Standard Shipping',
                    description: '5-7 days',
                    price: 5.99,
                    shippingPromotions: [{ promotionId: 'promo1' }],
                },
            ],
        };
        render(<ShippingOptions {...createDefaultProps({ shippingMethods: methods })} />);

        const prices = screen.queryAllByText('$5.99');
        // Only one price element should exist — no strikethrough duplicate
        expect(prices).toHaveLength(1);
        expect(prices[0].className).not.toContain('line-through');
    });

    test('shows strikethrough price with discounted price for promotional shipping', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: {
                            id: 'standard',
                            name: 'Standard Shipping',
                            description: '5-7 days',
                            price: 5.99,
                            shippingPromotions: [{ promotionId: 'promo1', calloutMsg: 'Free shipping!' }],
                        },
                    },
                ],
                shippingItems: [{ priceAdjustments: [{ appliedDiscount: { type: 'free' } }] }],
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                {
                    id: 'standard',
                    name: 'Standard Shipping',
                    description: '5-7 days',
                    price: 5.99,
                    shippingPromotions: [{ promotionId: 'promo1', calloutMsg: 'Free shipping!' }],
                },
            ],
        };
        render(<ShippingOptions {...createDefaultProps({ shippingMethods: methods })} />);

        const strikeThroughPrice = screen.getByText('$5.99');
        expect(strikeThroughPrice.className).toContain('line-through');
        expect(screen.getByText('FREE')).toBeInTheDocument();
    });

    test('shows delivery window in edit view when present on a method', () => {
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                {
                    id: 'standard',
                    name: 'Standard Shipping',
                    description: '5-7 days',
                    price: 5.99,
                    deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                },
            ],
        };
        render(<ShippingOptions {...createDefaultProps({ shippingMethods: methods })} />);

        expect(screen.getByText(/Arrives/)).toBeInTheDocument();
        expect(screen.getByText(/30.*Apr.*2026|Apr 30.*2026/)).toBeInTheDocument();
    });

    test('does not show delivery window in edit view when absent', () => {
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                { id: 'standard', name: 'Standard Shipping', description: '5-7 days', price: 5.99 },
            ],
        };
        render(<ShippingOptions {...createDefaultProps({ shippingMethods: methods })} />);

        expect(screen.queryByText(/Arrives/)).not.toBeInTheDocument();
    });

    test('shows delivery window in summary view when present on selected method', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: {
                            id: 'standard',
                            name: 'Standard Shipping',
                            description: '5-7 days',
                            price: 5.99,
                        },
                    },
                ],
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [
                {
                    id: 'standard',
                    name: 'Standard Shipping',
                    description: '5-7 days',
                    price: 5.99,
                    deliveryWindow: { startAt: '2026-04-30T12:00:00Z', endAt: '2026-05-07T12:00:00Z' },
                },
            ],
        };
        render(
            <ShippingOptions
                {...createDefaultProps({ shippingMethods: methods, isEditing: false, isCompleted: true })}
            />
        );

        expect(screen.getByText(/Arrives/)).toBeInTheDocument();
        expect(screen.getByText(/30.*Apr.*2026|Apr 30.*2026/)).toBeInTheDocument();
    });

    test('does not show delivery window in summary view when absent on selected method', () => {
        useBasket.mockReturnValue(
            createMockBasket({
                shipments: [
                    {
                        shipmentId: 's1',
                        shippingMethod: { id: 'standard', name: 'Standard Shipping', price: 5.99 },
                    },
                ],
            })
        );
        const methods: ShopperBasketsV2.schemas['ShippingMethodResult'] = {
            applicableShippingMethods: [{ id: 'standard', name: 'Standard Shipping', price: 5.99 }],
        };
        render(
            <ShippingOptions
                {...createDefaultProps({ shippingMethods: methods, isEditing: false, isCompleted: true })}
            />
        );

        expect(screen.queryByText(/Arrives/)).not.toBeInTheDocument();
    });
});
