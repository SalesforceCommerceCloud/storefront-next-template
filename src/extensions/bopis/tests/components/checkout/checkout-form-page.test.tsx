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
import { act, type ReactNode, type ComponentProps } from 'react';
import { mockAltSiteObject } from '@/test-utils/config';
import CheckoutFormPage from '@/components/checkout/checkout-form-page';

// Type definitions for mock components
interface MockButtonProps extends ComponentProps<'button'> {
    children: ReactNode;
}

interface MockCardProps extends ComponentProps<'div'> {
    children: ReactNode;
}

interface MockTypographyProps extends ComponentProps<'p'> {
    children: ReactNode;
    variant?: string;
    as?: string;
}

interface MockFormProps extends ComponentProps<'form'> {
    children: ReactNode;
}

// Mock functions
const mockUseCartStore = vi.fn();
const mockUseActionData = vi.fn();
const mockUseNavigation = vi.fn();
const mockUseBasket = vi.fn();

// Mock UI components
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, disabled, ...props }: MockButtonProps) => (
        <button disabled={disabled} {...props}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/ui/card', () => ({
    Card: ({ children, ...props }: MockCardProps) => {
        const dataTestId = (props as Record<string, unknown>)['data-testid'];
        return (
            <div data-slot="card" {...props} data-testid={dataTestId}>
                {children}
            </div>
        );
    },
    CardContent: ({ children, ...props }: MockCardProps) => (
        <div data-slot="card-content" {...props}>
            {children}
        </div>
    ),
    CardHeader: ({ children, ...props }: MockCardProps) => (
        <div data-slot="card-header" {...props}>
            {children}
        </div>
    ),
    CardTitle: ({ children, ...props }: MockCardProps) => (
        <div data-slot="card-title" {...props}>
            {children}
        </div>
    ),
    CardAction: ({ children, ...props }: MockCardProps) => (
        <div data-slot="card-action" {...props}>
            {children}
        </div>
    ),
}));

vi.mock('@/components/ui/input', () => ({
    Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));

vi.mock('@/components/typography', () => ({
    Typography: ({ children, variant, ...props }: MockTypographyProps) => {
        const Component = variant === 'h4' ? 'h4' : 'p';
        return <Component {...props}>{children}</Component>;
    },
}));

vi.mock('@/components/order-summary', () => ({
    default: () => <div data-testid="order-summary">Order Summary</div>,
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: vi.fn(),
    }),
}));

const mockAnalytics = {
    trackCheckoutStart: vi.fn(),
    trackCheckoutStep: vi.fn(),
};
const mockUseAnalytics = vi.fn(() => mockAnalytics);
vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => mockUseAnalytics(),
}));

const ExpressPaymentsMock = ({
    onApplePayClick,
    onGooglePayClick,
    onAmazonPayClick,
    onVenmoClick,
    onPayPalClick,
}: {
    onApplePayClick: () => void;
    onGooglePayClick: () => void;
    onAmazonPayClick: () => void;
    onVenmoClick: () => void;
    onPayPalClick: () => void;
}) => (
    <div data-testid="express-payments">
        <button type="button" onClick={onApplePayClick}>
            Apple Pay
        </button>
        <button type="button" onClick={onGooglePayClick}>
            Google Pay
        </button>
        <button type="button" onClick={onAmazonPayClick}>
            Amazon Pay
        </button>
        <button type="button" onClick={onVenmoClick}>
            Venmo
        </button>
        <button type="button" onClick={onPayPalClick}>
            PayPal
        </button>
    </div>
);
vi.mock('@/components/checkout/components/express-payments', () => ({
    default: ExpressPaymentsMock,
}));

const mockFilterDeliveryShippingMethods = vi.fn((map: unknown) => map);

vi.mock('@/extensions/bopis/lib/basket-utils', () => ({
    filterDeliveryShippingMethods: (map: unknown) => mockFilterDeliveryShippingMethods(map),
}));

vi.mock('@/extensions/bopis/components/checkout/checkout-pickup-with-data', () => ({
    default: () => <div data-testid="store-pickup">Store Pickup</div>,
}));

vi.mock('@/extensions/bopis/context/pickup-context', () => ({
    usePickup: () => ({
        pickupStores: new Map([
            [
                'store1',
                {
                    id: 'store1',
                    name: 'Mock Store',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'CA',
                    postalCode: '90000',
                    countryCode: 'US',
                },
            ],
        ]),
    }),
}));

// Mock the checkout context
const mockUseCheckoutContext = vi.fn();

const defaultSteps = {
    CONTACT_INFO: 0,
    PICKUP_ADDRESS: 1,
    SHIPPING_ADDRESS: 2,
    SHIPPING_OPTIONS: 3,
    PAYMENT: 4,
    PLACE_ORDER: 5,
} as const;

const buildCheckoutContext = (overrides?: Record<string, unknown>) => ({
    step: 0,
    computedStep: 0,
    editingStep: null,
    STEPS: defaultSteps,
    customerProfile: undefined,
    shippingDefaultSet: Promise.resolve(undefined),
    shipmentDistribution: {
        hasUnaddressedDeliveryItems: false,
        hasEmptyShipments: false,
        deliveryShipments: [],
        hasDeliveryItems: true,
        hasPickupItems: false,
        enableMultiAddress: false,
        hasMultipleDeliveryAddresses: false,
        isDeliveryProductItem: () => true,
    },
    savedAddresses: [],
    setSavedAddresses: vi.fn(),
    goToNextStep: vi.fn(),
    goToStep: vi.fn(),
    exitEditMode: vi.fn(),
    ...(overrides || {}),
});

vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => mockUseCheckoutContext(),
}));

// Mock the checkout context utilities
const mockUseCustomerProfile = vi.fn();
const mockUseCompletedSteps = vi.fn();
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: () => mockUseCustomerProfile(),
}));

vi.mock('@/hooks/checkout/use-completed-steps', () => ({
    useCompletedSteps: () => mockUseCompletedSteps(),
}));

// Mock the checkout actions hook
const mockIsSubmitting = vi.fn(() => false);
let mockShouldCreateAccount = false;

vi.mock('@/hooks/use-checkout-actions', () => ({
    useCheckoutActions: () => ({
        submitContactInfo: vi.fn(),
        submitShippingAddress: vi.fn(),
        submitShippingOptions: vi.fn(),
        submitPayment: vi.fn(),
        submitPlaceOrder: vi.fn(),
        contactFetcher: { data: null, state: 'idle' },
        shippingAddressFetcher: { data: null, state: 'idle' },
        shippingOptionsFetcher: { data: null, state: 'idle' },
        paymentFetcher: { data: null, state: 'idle' },
        placeOrderFetcher: { data: null, state: 'idle' },
        isSubmitting: mockIsSubmitting,
        handleCreateAccountPreferenceChange: vi.fn(),
        get shouldCreateAccount() {
            return mockShouldCreateAccount;
        },
    }),
}));

// Mock cart store
vi.mock('@/providers/cart-store', () => ({
    useCartStore: () => mockUseCartStore(),
}));

// Mock basket provider
vi.mock('@/providers/basket', () => ({
    useBasket: () => mockUseBasket(),
    useBasketHydrated: () => true,
}));

// Mock React Router hooks
vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useActionData: () => mockUseActionData(),
        useNavigation: () => mockUseNavigation(),
        useFetcher: () => ({
            data: null,
            state: 'idle',
            submit: vi.fn(),
            Form: ({ children, ...props }: MockFormProps) => <form {...props}>{children}</form>,
        }),
        Form: ({ children, ...props }: MockFormProps) => <form {...props}>{children}</form>,
    };
});

// Mock step components
vi.mock('@/components/checkout/components/contact-info', () => ({
    default: () => <div data-testid="contact-info">Contact Info Form</div>,
}));

vi.mock('@/components/checkout/components/shipping-address', () => ({
    default: () => <div data-testid="shipping-address">Shipping Address Form</div>,
}));

vi.mock('@/components/checkout/components/shipping-options', () => ({
    default: () => <div data-testid="shipping-options">Shipping Options Form</div>,
}));

vi.mock('@/components/checkout/components/payment', () => ({
    default: () => <div data-testid="payment">Payment Form</div>,
}));

vi.mock('@/components/checkout/components/register-customer-selection', () => ({
    default: () => <div data-testid="register-customer-checkbox">Create Account Checkbox</div>,
}));

vi.mock('@/components/checkout/checkout-progress', () => ({
    CheckoutProgress: () => <div data-testid="checkout-progress">Checkout Progress</div>,
}));

// Mock MyCart component
vi.mock('@/components/my-cart', () => ({
    default: () => <div data-testid="my-cart">My Cart</div>,
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: vi.fn(() => ({
        engagement: {
            adapters: {
                einstein: { enabled: true },
            },
        },
    })),
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

describe('CheckoutFormPage - bopis', () => {
    // Default test props. The shipping methods map is streamed by the loader and resolved inside
    // `ShippingMethodsBridge`; tests provide a resolved Promise rather than the raw map.
    const defaultProps = {
        shippingMethodsMapPromise: Promise.resolve({
            me: { applicableShippingMethods: [], defaultShippingMethodId: undefined },
        }),
        productMapPromise: Promise.resolve({}),
    };

    const renderCheckoutPage = async (
        props: Partial<ComponentProps<typeof CheckoutFormPage>> = {}
    ): Promise<ReturnType<typeof render>> => {
        let view: ReturnType<typeof render> | undefined;
        await act(async () => {
            view = render(<CheckoutFormPage {...defaultProps} {...props} />);
            await Promise.resolve();
        });
        if (!view) {
            throw new Error('CheckoutFormPage failed to render');
        }
        return view;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockAnalytics.trackCheckoutStart.mockReset();
        mockAnalytics.trackCheckoutStep.mockReset();
        mockUseAnalytics.mockReturnValue(mockAnalytics);
        Object.defineProperty(window, 'scrollTo', {
            writable: true,
            value: vi.fn(),
        });

        mockUseActionData.mockReturnValue(undefined);
        mockUseNavigation.mockReturnValue({ state: 'idle', formAction: '' });
        mockUseBasket.mockReturnValue({
            basketId: 'plain-basket',
            productItems: [],
            shipments: [],
        });
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());
        mockUseCartStore.mockReturnValue({
            basketId: 'test-basket',
            productItems: [{ itemId: '1', productName: 'Test Product', price: 99.99, quantity: 1 }],
            productTotal: 99.99,
            orderTotal: 99.99,
        });
        mockFilterDeliveryShippingMethods.mockImplementation((map: unknown) => map);
        mockShouldCreateAccount = false;

        // Setup checkout context mocks
        mockUseCustomerProfile.mockReturnValue(null); // Default to guest user
        mockUseCompletedSteps.mockReturnValue([]); // Default to no completed steps
    });

    test('shows store pickup only when basket is pickup-only', async () => {
        mockUseBasket.mockReturnValue({
            basketId: 'pickup-basket',
            productItems: [
                {
                    itemId: 'p1',
                    productId: 'product1',
                    quantity: 1,
                    inventoryId: 'inv1',
                    shipmentId: 'me',
                },
            ],
            shipments: [{ shipmentId: 'me', c_fromStoreId: 'store1' }],
        });
        mockUseCheckoutContext.mockReturnValue(
            buildCheckoutContext({
                shipmentDistribution: {
                    hasUnaddressedDeliveryItems: false,
                    hasEmptyShipments: false,
                    deliveryShipments: [],
                    hasDeliveryItems: false,
                    hasPickupItems: true,
                    enableMultiAddress: false,
                    hasMultipleDeliveryAddresses: false,
                    isDeliveryProductItem: () => false,
                },
            })
        );
        await renderCheckoutPage();
        await waitFor(() => {
            expect(screen.getByTestId('store-pickup')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('shipping-address')).not.toBeInTheDocument();
        expect(screen.queryByTestId('shipping-options')).not.toBeInTheDocument();
    });

    test('shows both pickup and shipping for mixed basket', async () => {
        mockUseBasket.mockReturnValue({
            basketId: 'mixed-basket',
            productItems: [
                {
                    itemId: 'p1',
                    productId: 'product1',
                    quantity: 1,
                    inventoryId: 'inv1',
                    shipmentId: 'me',
                },
                {
                    itemId: 'd1',
                    productId: 'product2',
                    quantity: 1,
                    shipmentId: 'delivery',
                },
            ],
            shipments: [{ shipmentId: 'me', c_fromStoreId: 'store1' }, { shipmentId: 'delivery' }],
        });
        mockUseCheckoutContext.mockReturnValue(
            buildCheckoutContext({
                shipmentDistribution: {
                    hasUnaddressedDeliveryItems: false,
                    hasEmptyShipments: false,
                    deliveryShipments: [{ shipmentId: 'delivery' }],
                    hasDeliveryItems: true,
                    hasPickupItems: true,
                    enableMultiAddress: false,
                    hasMultipleDeliveryAddresses: false,
                    isDeliveryProductItem: (item: { shipmentId?: string }) => item.shipmentId === 'delivery',
                },
            })
        );
        await renderCheckoutPage();
        await waitFor(() => {
            expect(screen.getByTestId('store-pickup')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByTestId('shipping-address')).toBeInTheDocument();
        });
        expect(screen.getByTestId('shipping-options')).toBeInTheDocument();
    });
});
