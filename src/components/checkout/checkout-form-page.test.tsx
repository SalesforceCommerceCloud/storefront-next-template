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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act, type ReactNode, type ComponentProps } from 'react';
import i18next from 'i18next';
import { mockAltSiteObject } from '@/test-utils/config';
import CheckoutFormPage from './checkout-form-page';

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

vi.mock('./components/checkout-skeletons', () => ({
    CheckoutSkeleton: () => <div data-testid="checkout-skeleton">Loading checkout...</div>,
    ContactInfoSkeleton: () => <div data-testid="contact-info-skeleton">Loading...</div>,
    ShippingAddressSkeleton: () => <div data-testid="shipping-address-skeleton">Loading...</div>,
    ShippingOptionsSkeleton: () => <div data-testid="shipping-options-skeleton">Loading...</div>,
    PaymentSkeleton: () => <div data-testid="payment-skeleton">Loading...</div>,
    ExpressPaymentsSkeleton: () => <div data-testid="express-payments-skeleton">Loading...</div>,
    MyCartSkeleton: () => <div data-testid="my-cart-skeleton">Loading...</div>,
    OrderSummarySkeleton: () => <div data-testid="order-summary-skeleton">Loading...</div>,
    PickupSkeleton: () => <div data-testid="pickup-skeleton">Loading...</div>,
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
vi.mock('./components/express-payments', () => ({
    default: ExpressPaymentsMock,
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

// Mock the checkout actions hook - stable references so tests can assert on calls
const mockIsSubmitting = vi.fn((_key: string) => false);
const mockSubmitContactInfo = vi.fn();
const mockSubmitShippingAddress = vi.fn();
const mockSubmitShippingOptions = vi.fn();
const mockSubmitPayment = vi.fn();
const mockSubmitPlaceOrder = vi.fn();
const mockHandleCreateAccountPreferenceChange = vi.fn();
let mockShouldCreateAccount = false;
let mockContactFetcherState: 'idle' | 'submitting' = 'idle';
let mockContactFetcherData: {
    success?: boolean;
    error?: string | { code: string; message: string };
    step?: string;
} | null = null;
let mockShippingAddressFetcherState: 'idle' | 'submitting' = 'idle';
let mockShippingAddressFetcherData: {
    success?: boolean;
    error?: string | { code: string; message: string };
    step?: string;
    data?: Record<string, unknown>;
} | null = null;
let mockShippingOptionsFetcherState: 'idle' | 'submitting' = 'idle';
let mockShippingOptionsFetcherData: {
    success?: boolean;
    error?: string | { code: string; message: string };
    step?: string;
} | null = null;
let mockPlaceOrderFetcherState: 'idle' | 'submitting' = 'idle';
let mockPlaceOrderFetcherData: {
    success?: boolean;
    error?: string | { code: string; message: string };
    step?: string;
} | null = null;
let mockPaymentFetcherState: 'idle' | 'submitting' = 'idle';
let mockPaymentFetcherData: {
    success?: boolean;
    error?: string | { code: string; message: string };
    step?: string;
} | null = null;

vi.mock('@/hooks/use-checkout-actions', () => ({
    useCheckoutActions: () => ({
        submitContactInfo: mockSubmitContactInfo,
        submitShippingAddress: mockSubmitShippingAddress,
        submitShippingOptions: mockSubmitShippingOptions,
        submitPayment: mockSubmitPayment,
        submitPlaceOrder: mockSubmitPlaceOrder,
        buildPlaceOrderFinalizeFormData: () => new FormData(),
        get contactFetcher() {
            return { data: mockContactFetcherData, state: mockContactFetcherState };
        },
        get shippingAddressFetcher() {
            return { data: mockShippingAddressFetcherData, state: mockShippingAddressFetcherState };
        },
        get shippingOptionsFetcher() {
            return { data: mockShippingOptionsFetcherData, state: mockShippingOptionsFetcherState };
        },
        get paymentFetcher() {
            return { data: mockPaymentFetcherData, state: mockPaymentFetcherState };
        },
        get placeOrderFetcher() {
            return { data: mockPlaceOrderFetcherData, state: mockPlaceOrderFetcherState };
        },
        isSubmitting: mockIsSubmitting,
        handleCreateAccountPreferenceChange: mockHandleCreateAccountPreferenceChange,
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

// Mock auth provider - default to guest; tests for registered users override this
const mockUseAuth = vi.fn(() => ({ userType: 'guest' }));
vi.mock('@/providers/auth', () => ({
    useAuth: () => mockUseAuth(),
}));

// Mock Form component and hooks at module level
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
vi.mock('./components/contact-info', () => ({
    default: () => <div data-testid="contact-info">Contact Info Form</div>,
}));

vi.mock('./components/shipping-address', () => ({
    default: () => <div data-testid="shipping-address">Shipping Address Form</div>,
}));

vi.mock('./components/shipping-options', () => ({
    default: () => <div data-testid="shipping-options">Shipping Options Form</div>,
}));

let mockPaymentFormDataGetter: (() => Record<string, unknown>) | null = null;
let capturedSetFormErrors: ((errors: Record<string, { type: string; message: string }>) => void) | null = null;
let mockOnPlaceOrder: (() => Promise<string | null>) | null = null;
let mockBillingAddressGetter: (() => Record<string, unknown> | null) | null = null;

vi.mock('./components/payment', () => ({
    default: ({ paymentSubmissionRef }: { paymentSubmissionRef?: { current: Record<string, unknown> } }) => {
        if (paymentSubmissionRef) {
            paymentSubmissionRef.current.formDataGetter = mockPaymentFormDataGetter;
            paymentSubmissionRef.current.setFormErrors = (
                errors: Record<string, { type: string; message: string }>
            ) => {
                capturedSetFormErrors?.(errors);
            };
            paymentSubmissionRef.current.onPlaceOrder = mockOnPlaceOrder;
            paymentSubmissionRef.current.billingAddressGetter = mockBillingAddressGetter;
        }
        return <div data-testid="payment">Payment Form</div>;
    },
}));

vi.mock('./components/register-customer-selection', () => ({
    default: () => <div data-testid="register-customer-checkbox">Create Account Checkbox</div>,
}));

vi.mock('./checkout-progress', () => ({
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

describe('CheckoutFormPage', () => {
    // Default test props. The shipping methods map is streamed by the loader (see
    // `CheckoutPageData.shippingMethodsMap`) and resolved inside `ShippingMethodsBridge`, so
    // tests provide a resolved Promise rather than the raw map.
    const defaultProps = {
        shippingMethodsMapPromise: Promise.resolve({
            me: { applicableShippingMethods: [], defaultShippingMethodId: undefined },
        }),
        productMapPromise: Promise.resolve({}),
    };

    // The page's children are React.lazy. React Testing Library's documented
    // pattern for testing components with Suspense is `await act(async () =>
    // render(...))` - the async form lets the runner drive the lazy import
    // resolution. Tests that need to assert on specific lazy children layer
    // findBy*/waitFor on top.
    const renderCheckoutPage = async (
        props: Partial<ComponentProps<typeof CheckoutFormPage>> = {}
    ): Promise<ReturnType<typeof render>> => {
        let view: ReturnType<typeof render> | undefined;
        await act(
            // eslint-disable-next-line @typescript-eslint/require-await
            async () => {
                view = render(<CheckoutFormPage {...defaultProps} {...props} />);
            }
        );
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
            basketId: 'test-basket',
            productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
        });
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());
        mockUseCartStore.mockReturnValue({
            basketId: 'test-basket',
            productItems: [{ itemId: '1', productName: 'Test Product', price: 99.99, quantity: 1 }],
            productTotal: 99.99,
            orderTotal: 99.99,
        });
        mockShouldCreateAccount = false;
        mockContactFetcherState = 'idle';
        mockContactFetcherData = null;
        mockShippingAddressFetcherState = 'idle';
        mockShippingAddressFetcherData = null;
        mockShippingOptionsFetcherState = 'idle';
        mockShippingOptionsFetcherData = null;
        mockPlaceOrderFetcherState = 'idle';
        mockPlaceOrderFetcherData = null;
        mockPaymentFetcherState = 'idle';
        mockPaymentFetcherData = null;
        mockShippingAddressFetcherState = 'idle';
        mockShippingAddressFetcherData = null;

        mockPaymentFormDataGetter = null;
        capturedSetFormErrors = null;
        mockOnPlaceOrder = null;
        mockBillingAddressGetter = null;

        // Setup checkout context mocks
        mockUseCustomerProfile.mockReturnValue(null); // Default to guest user
        mockUseCompletedSteps.mockReturnValue([]); // Default to no completed steps
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Basic Rendering', () => {
        test('renders without crashing', async () => {
            await renderCheckoutPage();
        });

        test('displays main checkout content', async () => {
            await renderCheckoutPage();

            // Should render all forms (they are all displayed)
            // Use findByText to wait for async rendering
            expect(await screen.findByText('Contact Info Form')).toBeInTheDocument();
            // Order summary may be lazy-loaded, wait for it
            const orderSummaries = await screen.findAllByTestId('order-summary');
            expect(orderSummaries.length).toBeGreaterThan(0);
        });

        test('displays all checkout forms', async () => {
            mockUseBasket.mockReturnValueOnce({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1, shipmentId: 'me' }],
                shipments: [{ shipmentId: 'me' }],
            });
            await renderCheckoutPage();

            // Use findByText to wait for async rendering
            expect(await screen.findByText('Contact Info Form')).toBeInTheDocument();
            expect(screen.getByText('Shipping Address Form')).toBeInTheDocument();
            expect(screen.getByText('Shipping Options Form')).toBeInTheDocument();
            expect(screen.getByText('Payment Form')).toBeInTheDocument();
        });
    });

    describe('Analytics tracking', () => {
        test('tracks the initial checkout step when a basket is present', async () => {
            await renderCheckoutPage();

            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStep).toHaveBeenCalledWith({
                    stepName: 'CONTACT_INFO',
                    stepNumber: defaultSteps.CONTACT_INFO,
                    basket: expect.objectContaining({ basketId: 'test-basket' }),
                });
            });
        });
    });

    describe('Express payment handlers', () => {
        test('renders express payments component with all buttons', async () => {
            await renderCheckoutPage();

            // Wait for express payments component to load (lazy loaded with Suspense)
            const expressPayments = await screen.findByTestId('express-payments');
            expect(expressPayments).toBeInTheDocument();

            // Wait for all buttons to be available and ensure they are not disabled
            const applePayButton = await screen.findByRole('button', { name: /apple pay/i });
            const googlePayButton = await screen.findByRole('button', { name: /google pay/i });
            const amazonPayButton = await screen.findByRole('button', { name: /amazon pay/i });
            const venmoButton = await screen.findByRole('button', { name: /venmo/i });
            const paypalButton = await screen.findByRole('button', { name: /paypal/i });

            // Verify all express payment buttons are present and enabled
            expect(applePayButton).toBeInTheDocument();
            expect(applePayButton).not.toBeDisabled();
            expect(googlePayButton).toBeInTheDocument();
            expect(googlePayButton).not.toBeDisabled();
            expect(amazonPayButton).toBeInTheDocument();
            expect(amazonPayButton).not.toBeDisabled();
            expect(venmoButton).toBeInTheDocument();
            expect(venmoButton).not.toBeDisabled();
            expect(paypalButton).toBeInTheDocument();
            expect(paypalButton).not.toBeDisabled();

            // Note: Click handler behavior is comprehensively tested in express-payments.test.tsx
        });
    });

    describe('Error Handling', () => {
        test('displays form errors from server', async () => {
            mockUseActionData.mockReturnValue({
                success: false,
                formError: 'Please enter your email address',
                step: 'contactInfo',
            });

            await renderCheckoutPage();

            // Component should handle error state
            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();
        });

        test('handles loading state', async () => {
            mockUseNavigation.mockReturnValue({ state: 'submitting' });

            await renderCheckoutPage();

            // Component should render in loading state
            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();
        });
    });

    describe('Create Account Checkbox Visibility', () => {
        beforeEach(() => {
            // Mock sessionStorage for these tests
            const mockSessionStorage = {
                getItem: vi.fn(),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn(),
            };
            Object.defineProperty(window, 'sessionStorage', {
                value: mockSessionStorage,
                writable: true,
            });
        });

        test('hides create account checkbox for registered users', async () => {
            mockUseCustomerProfile.mockReturnValue({
                customer: {
                    customerId: 'registered-customer-123',
                    email: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                },
                addresses: [],
                paymentInstruments: [],
            });

            await renderCheckoutPage();
            expect(screen.queryByTestId('register-customer-checkbox')).not.toBeInTheDocument();
        });

        test('shows create account checkbox for guest users with guest recommendation', async () => {
            mockUseCustomerProfile.mockReturnValue(null);

            const mockGetItem = vi.fn((key: string) => {
                if (key === 'customerLookupResult') {
                    return JSON.stringify({ recommendation: 'guest' });
                }
                return null;
            });
            window.sessionStorage.getItem = mockGetItem;

            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );

            await renderCheckoutPage();
            expect(await screen.findByTestId('register-customer-checkbox')).toBeInTheDocument();
        });

        test('shows create account checkbox when no customer ID or lookup data', async () => {
            mockUseCustomerProfile.mockReturnValue(null);
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                customerInfo: null,
            });

            const mockGetItem = vi.fn(() => null);
            window.sessionStorage.getItem = mockGetItem;

            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );

            await renderCheckoutPage();
            expect(await screen.findByTestId('register-customer-checkbox')).toBeInTheDocument();
        });

        test('hides create account checkbox for guest users with returning recommendation', async () => {
            mockUseCustomerProfile.mockReturnValue(null);

            const mockGetItem = vi.fn((key: string) => {
                if (key === 'customerLookupResult') {
                    return JSON.stringify({ recommendation: 'returning' });
                }
                return null;
            });
            window.sessionStorage.getItem = mockGetItem;

            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                customerInfo: { customerId: 'customer-123' },
            });

            await renderCheckoutPage();
            expect(screen.queryByTestId('register-customer-checkbox')).not.toBeInTheDocument();
        });

        test('handles malformed customer lookup data gracefully', async () => {
            mockUseCustomerProfile.mockReturnValue(null);

            const mockGetItem = vi.fn((key: string) => {
                if (key === 'customerLookupResult') {
                    return 'invalid-json';
                }
                return null;
            });
            window.sessionStorage.getItem = mockGetItem;

            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                customerInfo: null,
            });

            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );

            await renderCheckoutPage();
            expect(await screen.findByTestId('register-customer-checkbox')).toBeInTheDocument();
        });

        test('prioritizes customer profile over session storage recommendation', async () => {
            mockUseCustomerProfile.mockReturnValue({
                customer: {
                    customerId: 'registered-customer-123',
                    email: 'test@example.com',
                },
                addresses: [],
                paymentInstruments: [],
            });

            const mockGetItem = vi.fn((key: string) => {
                if (key === 'customerLookupResult') {
                    return JSON.stringify({ recommendation: 'guest' });
                }
                return null;
            });
            window.sessionStorage.getItem = mockGetItem;

            await renderCheckoutPage();
            expect(screen.queryByTestId('register-customer-checkbox')).not.toBeInTheDocument();
        });

        test('hides create account checkbox for registered user via auth session even without customerProfile', async () => {
            mockUseCustomerProfile.mockReturnValue(null);
            mockUseAuth.mockReturnValue({ userType: 'registered' });

            const mockGetItem = vi.fn((key: string) => {
                if (key === 'customerLookupResult') {
                    return JSON.stringify({ recommendation: 'guest' });
                }
                return null;
            });
            window.sessionStorage.getItem = mockGetItem;

            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );

            await renderCheckoutPage();
            expect(screen.queryByTestId('register-customer-checkbox')).not.toBeInTheDocument();
            mockUseAuth.mockReturnValue({ userType: 'guest' });
        });
    });

    describe('Mobile order summary', () => {
        test('renders order summary and cart content on mobile', async () => {
            await renderCheckoutPage();

            // Both mobile and md+ sections render OrderSummary and MyCart
            const orderSummaries = screen.getAllByTestId('order-summary');
            expect(orderSummaries.length).toBeGreaterThanOrEqual(1);

            const myCarts = screen.getAllByTestId('my-cart');
            expect(myCarts.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Responsive order summary layout', () => {
        test('keeps main checkout content before sidebar in DOM so keyboard tab order matches visual reading order (WCAG 2.4.3)', async () => {
            await renderCheckoutPage();

            const sidebar = screen.getByTestId('checkout-order-summary-sidebar');
            const expressPayments = screen.getByTestId('express-payments');

            const relation = expressPayments.compareDocumentPosition(sidebar);
            expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });

        test('uses responsive order classes to move sidebar right on lg while staying above main on md', async () => {
            const { container } = await renderCheckoutPage();

            const grid = container.querySelector('.grid.grid-cols-1.lg\\:grid-cols-3.gap-8');
            expect(grid).toBeInTheDocument();

            const sidebar = screen.getByTestId('checkout-order-summary-sidebar');
            expect(sidebar.className).toContain('md:order-1');
            expect(sidebar.className).toContain('lg:order-2');
            expect(sidebar.className).toContain('lg:col-span-1');

            const mainContent = screen.getByTestId('express-payments').closest('div.space-y-6');
            expect(mainContent).toBeInTheDocument();
            expect(mainContent?.className).toContain('md:order-2');
            expect(mainContent?.className).toContain('lg:order-1');
            expect(mainContent?.className).toContain('lg:col-span-2');
        });

        test('place order button is DOM-after sidebar so promo code is tabbed before place order (WCAG 2.4.3)', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PAYMENT,
                })
            );

            await renderCheckoutPage();

            const sidebar = screen.getByTestId('checkout-order-summary-sidebar');
            const placeOrderButton = screen.getByRole('button', { name: /place order/i });

            const relation = sidebar.compareDocumentPosition(placeOrderButton);
            expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });
    });

    describe('Conditional rendering', () => {
        test('renders empty cart state when basket has no items', async () => {
            mockUseBasket.mockReturnValueOnce({
                basketId: 'empty-basket',
                productItems: [],
            });

            await renderCheckoutPage();

            expect(screen.getByText(i18next.t('checkout:common.emptyCart'))).toBeInTheDocument();
        });
    });

    describe('Place order section', () => {
        test('renders place order button when step is payment (guest flow)', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PAYMENT,
                })
            );

            await renderCheckoutPage();

            expect(screen.getByRole('button', { name: /place order/i })).toBeInTheDocument();
        });

        test('renders place order button when step is place order (returning shopper)', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );

            await renderCheckoutPage();

            expect(screen.getByRole('button', { name: /place order/i })).toBeInTheDocument();
        });

        test('place order section renders when user has chosen to create account', async () => {
            mockShouldCreateAccount = true;
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );

            await renderCheckoutPage();
            expect(screen.getByRole('button', { name: /place order/i })).toBeInTheDocument();
        });

        test('disables place order button and shows processing text while submitting', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PLACE_ORDER,
                })
            );
            mockPlaceOrderFetcherState = 'submitting';

            await renderCheckoutPage();

            const button = screen.getByRole('button', { name: i18next.t('checkout:placeOrder.processing') });
            expect(button).toBeDisabled();
        });
    });

    describe('Analytics tracking edge cases', () => {
        test('tracks checkout start on initial mount', async () => {
            await renderCheckoutPage();

            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStart).toHaveBeenCalledTimes(1);
                expect(mockAnalytics.trackCheckoutStart).toHaveBeenCalledWith({
                    basket: expect.objectContaining({
                        basketId: 'test-basket',
                        productItems: expect.arrayContaining([
                            expect.objectContaining({
                                itemId: 'item1',
                                productId: 'product1',
                                quantity: 1,
                            }),
                        ]),
                    }),
                });
            });
        });

        test('does not track checkout start when cart is empty', async () => {
            mockUseBasket.mockReturnValue({
                basketId: 'empty-basket',
                productItems: [],
            });

            await renderCheckoutPage();

            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStart).not.toHaveBeenCalled();
            });
        });

        test('tracks step changes when step updates', async () => {
            const { rerender } = await renderCheckoutPage();

            // Initial step tracking
            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStep).toHaveBeenCalledWith({
                    stepName: 'CONTACT_INFO',
                    stepNumber: defaultSteps.CONTACT_INFO,
                    basket: expect.objectContaining({ basketId: 'test-basket' }),
                });
            });

            // Update step
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.SHIPPING_ADDRESS,
                })
            );

            act(() => {
                rerender(<CheckoutFormPage {...defaultProps} />);
            });

            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStep).toHaveBeenCalledWith({
                    stepName: 'SHIPPING_ADDRESS',
                    stepNumber: defaultSteps.SHIPPING_ADDRESS,
                    basket: expect.objectContaining({ basketId: 'test-basket' }),
                });
            });
        });

        test('tracks step only when step changes', async () => {
            const { rerender } = await renderCheckoutPage();

            // Initial step tracking
            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStep).toHaveBeenCalledTimes(1);
            });

            // Clear mock to verify subsequent calls
            mockAnalytics.trackCheckoutStep.mockClear();

            // Re-render with same step - should not track again
            act(() => {
                rerender(<CheckoutFormPage {...defaultProps} />);
            });

            // Should not be called again when step hasn't changed
            // Note: In a real scenario, the ref guard prevents this, but in tests
            // re-rendering creates a new component instance, so we verify the initial call
            expect(mockAnalytics.trackCheckoutStep).not.toHaveBeenCalled();
        });

        test('does not track step when cart is empty', async () => {
            mockUseBasket.mockReturnValue({
                basketId: 'empty-basket',
                productItems: [],
            });

            await renderCheckoutPage();

            await waitFor(() => {
                expect(mockAnalytics.trackCheckoutStep).not.toHaveBeenCalled();
            });
        });
    });

    describe('Empty cart edge cases', () => {
        test('handles null cart', async () => {
            mockUseBasket.mockReturnValue(null);

            await renderCheckoutPage();

            // When cart is null, show loading skeleton (prevents race condition)
            expect(screen.getByTestId('checkout-skeleton')).toBeInTheDocument();
        });

        test('handles cart without basketId', async () => {
            mockUseBasket.mockReturnValue({
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
            });

            await renderCheckoutPage();

            expect(screen.getByText(i18next.t('checkout:common.emptyCart'))).toBeInTheDocument();
        });

        test('handles cart with null productItems', async () => {
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: null,
            });

            await renderCheckoutPage();

            expect(screen.getByText(i18next.t('checkout:common.emptyCart'))).toBeInTheDocument();
        });

        test('handles cart with undefined productItems', async () => {
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
            });

            await renderCheckoutPage();

            expect(screen.getByText(i18next.t('checkout:common.emptyCart'))).toBeInTheDocument();
        });
    });

    describe('Step state management', () => {
        test('handles editing step state correctly', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PAYMENT,
                    editingStep: defaultSteps.CONTACT_INFO,
                })
            );

            await renderCheckoutPage();

            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();
        });

        test('handles completed step state correctly', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PAYMENT,
                })
            );

            await renderCheckoutPage();

            // All previous steps should be completed
            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();
            expect(screen.getByText('Shipping Address Form')).toBeInTheDocument();
            expect(screen.getByText('Shipping Options Form')).toBeInTheDocument();
            expect(screen.getByText('Payment Form')).toBeInTheDocument();
        });
    });

    describe('MyCartWithData component', () => {
        test('handles productMapPromise resolution', async () => {
            const productMap = { product1: { id: 'product1', productId: 'product1', name: 'Test Product' } };
            const productMapPromise = Promise.resolve(productMap);

            await renderCheckoutPage({
                productMapPromise,
            });

            // Component should render without errors (may appear multiple times - mobile and desktop)
            const cartElements = screen.getAllByTestId('my-cart');
            expect(cartElements.length).toBeGreaterThan(0);
        });

        test('handles promotionsPromise resolution', async () => {
            const promotions = { promo1: { id: 'promo1', name: 'Test Promotion' } };
            const promotionsPromise = Promise.resolve(promotions);

            await renderCheckoutPage({
                promotionsPromise,
            });

            // Component should render without errors (may appear multiple times - mobile and desktop)
            const cartElements = screen.getAllByTestId('my-cart');
            expect(cartElements.length).toBeGreaterThan(0);
        });

        test('handles missing promotionsPromise', async () => {
            await renderCheckoutPage({
                promotionsPromise: undefined,
            });

            // Component should render without errors (may appear multiple times - mobile and desktop)
            const cartElements = screen.getAllByTestId('my-cart');
            expect(cartElements.length).toBeGreaterThan(0);
        });
    });

    describe('GuestAccountCreation edge cases', () => {
        beforeEach(() => {
            const mockSessionStorage = {
                getItem: vi.fn(),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn(),
            };
            Object.defineProperty(window, 'sessionStorage', {
                value: mockSessionStorage,
                writable: true,
            });
        });

        test('handles sessionStorage being undefined (SSR)', async () => {
            // Mock sessionStorage as undefined for SSR test
            const originalSessionStorage = window.sessionStorage;
            Object.defineProperty(window, 'sessionStorage', {
                value: undefined,
                writable: true,
                configurable: true,
            });

            mockUseCustomerProfile.mockReturnValue(null);
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                customerInfo: null,
            });

            await renderCheckoutPage();

            // Should handle gracefully without throwing
            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();

            // Restore sessionStorage
            Object.defineProperty(window, 'sessionStorage', {
                value: originalSessionStorage,
                writable: true,
                configurable: true,
            });
        });

        test('handles customerLookupResult with null recommendation', async () => {
            mockUseCustomerProfile.mockReturnValue(null);
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                customerInfo: null,
            });

            const mockGetItem = vi.fn((key: string) => {
                if (key === 'customerLookupResult') {
                    return JSON.stringify({ recommendation: null });
                }
                return null;
            });
            window.sessionStorage.getItem = mockGetItem;

            await renderCheckoutPage();

            // When recommendation is null and no customer ID, should show checkbox
            // (based on logic: !cart?.customerInfo?.customerId && !customerLookupResult)
            // Since customerLookupResult exists (even with null recommendation), it might not show
            // Let's verify the component renders correctly
            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();
        });
    });

    describe('Session cleanup for returning shoppers', () => {
        test('clears stale registeredViaCheckout and shouldCreateAccount flags for returning shoppers with saved payment methods', async () => {
            const mockRemoveItem = vi.fn();
            const mockGetItem = vi.fn(() => null);
            Object.defineProperty(window, 'sessionStorage', {
                value: {
                    getItem: mockGetItem,
                    setItem: vi.fn(),
                    removeItem: mockRemoveItem,
                    clear: vi.fn(),
                },
                writable: true,
                configurable: true,
            });

            mockUseCustomerProfile.mockReturnValue({
                customer: { customerId: 'returning-cust', email: 'returning@example.com' },
                addresses: [{ addressId: 'addr-1' }],
                paymentInstruments: [{ paymentInstrumentId: 'pi-1' }],
            });
            mockUseAuth.mockReturnValue({ userType: 'registered' });

            const { rerender } = await renderCheckoutPage();

            expect(mockRemoveItem).toHaveBeenCalledWith('registeredViaCheckout');
            expect(mockRemoveItem).toHaveBeenCalledWith('shouldCreateAccount');
            expect(mockHandleCreateAccountPreferenceChange).toHaveBeenCalledWith(false);

            // Cleanup should only run once even when deps change (ref guard)
            mockRemoveItem.mockClear();
            mockHandleCreateAccountPreferenceChange.mockClear();

            // Simulate profile update with more payment instruments
            mockUseCustomerProfile.mockReturnValue({
                customer: { customerId: 'returning-cust', email: 'returning@example.com' },
                addresses: [{ addressId: 'addr-1' }],
                paymentInstruments: [{ paymentInstrumentId: 'pi-1' }, { paymentInstrumentId: 'pi-2' }],
            });

            act(() => {
                rerender(<CheckoutFormPage {...defaultProps} />);
            });

            // Should NOT fire again due to ref guard
            expect(mockRemoveItem).not.toHaveBeenCalledWith('registeredViaCheckout');
            expect(mockHandleCreateAccountPreferenceChange).not.toHaveBeenCalledWith(false);

            mockUseAuth.mockReturnValue({ userType: 'guest' });
        });

        test('does not clear session flags for newly registered user without saved payment methods', async () => {
            const mockRemoveItem = vi.fn();
            const mockGetItem = vi.fn((key: string) => {
                if (key === 'registeredViaCheckout') return 'true';
                return null;
            });
            Object.defineProperty(window, 'sessionStorage', {
                value: {
                    getItem: mockGetItem,
                    setItem: vi.fn(),
                    removeItem: mockRemoveItem,
                    clear: vi.fn(),
                },
                writable: true,
                configurable: true,
            });

            mockUseCustomerProfile.mockReturnValue({
                customer: { customerId: 'new-cust', email: 'new@example.com' },
                addresses: [],
                paymentInstruments: [],
            });
            mockUseAuth.mockReturnValue({ userType: 'registered' });

            await renderCheckoutPage();

            // Should NOT clear because no saved payment methods
            expect(mockRemoveItem).not.toHaveBeenCalledWith('registeredViaCheckout');
            expect(mockRemoveItem).not.toHaveBeenCalledWith('shouldCreateAccount');

            mockUseAuth.mockReturnValue({ userType: 'guest' });
        });
    });

    describe('Form submission handlers', () => {
        test('handlers are properly assigned to form components', async () => {
            await renderCheckoutPage();

            // Verify that forms render, which means handlers are assigned
            expect(screen.getByText('Contact Info Form')).toBeInTheDocument();
            expect(screen.getByText('Shipping Address Form')).toBeInTheDocument();
            expect(screen.getByText('Shipping Options Form')).toBeInTheDocument();
            expect(screen.getByText('Payment Form')).toBeInTheDocument();
        });
    });

    describe('Error toast notifications', () => {
        test('fires error toast when contact info submission fails', async () => {
            const mockShowToast = vi.fn();
            mockContactFetcherData = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Failed to update email' },
                step: 'contactInfo',
            };

            await renderCheckoutPage({ showToast: mockShowToast });

            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith(
                    "We couldn't save the contact information. Try again.",
                    'error'
                );
            });
        });

        test('fires error toast when shipping address submission fails', async () => {
            const mockShowToast = vi.fn();
            mockShippingAddressFetcherData = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Invalid shipping address' },
                step: 'shippingAddress',
            };

            await renderCheckoutPage({ showToast: mockShowToast });

            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith(
                    'Address validation failed. Check your address and try again.',
                    'error'
                );
            });
        });

        test('fires error toast when shipping options submission fails', async () => {
            const mockShowToast = vi.fn();
            mockShippingOptionsFetcherData = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Shipping method unavailable' },
                step: 'shippingOptions',
            };

            await renderCheckoutPage({ showToast: mockShowToast });

            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith(
                    "The selected shipping method isn't available. Choose another option.",
                    'error'
                );
            });
        });

        test('fires error toast when payment submission fails', async () => {
            const mockShowToast = vi.fn();
            mockPaymentFetcherData = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Payment processing failed' },
                step: 'payment',
            };

            await renderCheckoutPage({ showToast: mockShowToast });

            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith('Payment processing failed. Try again.', 'error');
            });
        });

        test('fires error toast when place order fails', async () => {
            const mockShowToast = vi.fn();
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockPlaceOrderFetcherData = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Order placement failed' },
                step: 'placeOrder',
            };

            await renderCheckoutPage({ showToast: mockShowToast });

            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith('Failed to create order. Try again.', 'error');
            });
        });

        test('does not fire error toast when fetcher succeeds', async () => {
            const mockShowToast = vi.fn();
            mockContactFetcherData = { success: true, step: 'contactInfo' };

            await renderCheckoutPage({ showToast: mockShowToast });

            expect(mockShowToast).not.toHaveBeenCalled();
        });

        test('does not fire error toast when fetcher has no data', async () => {
            const mockShowToast = vi.fn();
            mockContactFetcherData = null;

            await renderCheckoutPage({ showToast: mockShowToast });

            expect(mockShowToast).not.toHaveBeenCalled();
        });

        test('does not fire error toast for a different step', async () => {
            const mockShowToast = vi.fn();
            mockContactFetcherData = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Some error' },
                step: 'shippingAddress',
            };

            await renderCheckoutPage({ showToast: mockShowToast });

            expect(mockShowToast).not.toHaveBeenCalled();
        });
    });

    describe('Payment sync on place order (returning shopper)', () => {
        const basketWithSavedPayment = {
            basketId: 'test-basket',
            productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pi-1',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: { cardType: 'Visa', holder: 'John Doe', maskedNumber: '***1111' },
                },
            ],
        };

        test('blocks place order and shows validation errors when returning shopper switches to new card with empty fields', async () => {
            const mockGoToStep = vi.fn();
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({ step: defaultSteps.PLACE_ORDER, goToStep: mockGoToStep })
            );
            mockUseBasket.mockReturnValue(basketWithSavedPayment);
            mockUseCustomerProfile.mockReturnValue({
                customer: { customerId: 'cust-1', email: 'test@example.com' },
                addresses: [{ addressId: 'addr-1' }],
                paymentInstruments: [{ paymentInstrumentId: 'pi-1' }],
            });

            let receivedErrors: Record<string, { type: string; message: string }> | null = null;
            capturedSetFormErrors = (errors) => {
                receivedErrors = errors;
            };

            mockPaymentFormDataGetter = () => ({
                cardNumber: '',
                cardholderName: '',
                expiryDate: '',
                cvv: '',
                useDifferentBilling: false,
                useSavedPaymentMethod: false,
                selectedSavedPaymentMethod: undefined,
            });

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', {
                name: /Place Order/,
            });

            act(() => {
                fireEvent.click(placeOrderButton);
            });

            expect(mockSubmitPlaceOrder).not.toHaveBeenCalled();
            expect(mockSubmitPayment).not.toHaveBeenCalled();
            expect(mockGoToStep).toHaveBeenCalledWith(defaultSteps.PAYMENT);
            expect(receivedErrors).not.toBeNull();
            expect(receivedErrors).toHaveProperty('cardNumber');
            expect(receivedErrors).toHaveProperty('cvv');
        });

        test('submits payment before place order when returning shopper switches to new card with valid fields', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithSavedPayment);
            mockUseCustomerProfile.mockReturnValue({
                customer: { customerId: 'cust-1', email: 'test@example.com' },
                addresses: [{ addressId: 'addr-1' }],
                paymentInstruments: [{ paymentInstrumentId: 'pi-1' }],
            });

            mockPaymentFormDataGetter = () => ({
                cardNumber: '4111111111111111',
                cardholderName: 'Jane Smith',
                expiryDate: '12/28',
                cvv: '123',
                useDifferentBilling: false,
                useSavedPaymentMethod: false,
                selectedSavedPaymentMethod: undefined,
            });

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', {
                name: /Place Order/,
            });

            act(() => {
                fireEvent.click(placeOrderButton);
            });

            expect(mockSubmitPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    cardNumber: '4111111111111111',
                    useSavedPaymentMethod: false,
                })
            );
            expect(mockSubmitPlaceOrder).not.toHaveBeenCalled();
        });

        test('re-submits payment when returning shopper keeps saved card to ensure correct instrument', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithSavedPayment);
            mockUseCustomerProfile.mockReturnValue({
                customer: { customerId: 'cust-1', email: 'test@example.com' },
                addresses: [{ addressId: 'addr-1' }],
                paymentInstruments: [{ paymentInstrumentId: 'pi-1' }],
            });

            mockPaymentFormDataGetter = () => ({
                cardNumber: '',
                cardholderName: '',
                expiryDate: '',
                cvv: '',
                useDifferentBilling: false,
                useSavedPaymentMethod: true,
                selectedSavedPaymentMethod: 'pi-1',
            });

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', {
                name: /Place Order/,
            });

            act(() => {
                fireEvent.click(placeOrderButton);
            });

            expect(mockSubmitPayment).toHaveBeenCalled();
            expect(mockSubmitPlaceOrder).not.toHaveBeenCalled();
        });

        test('submits payment when basket has no payment instrument (guest flow)', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                paymentInstruments: [],
            });

            mockPaymentFormDataGetter = () => ({
                cardNumber: '4111111111111111',
                cardholderName: 'Guest User',
                expiryDate: '12/28',
                cvv: '456',
                useDifferentBilling: false,
                useSavedPaymentMethod: false,
                selectedSavedPaymentMethod: undefined,
            });

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', {
                name: /Place Order/,
            });

            act(() => {
                fireEvent.click(placeOrderButton);
            });

            expect(mockSubmitPayment).toHaveBeenCalled();
            expect(mockSubmitPlaceOrder).not.toHaveBeenCalled();
        });
    });

    describe('No shipping methods toast', () => {
        test('fires error toast when shipping address succeeds but yields no shipping methods', async () => {
            const mockShowToast = vi.fn();

            mockShippingAddressFetcherData = {
                success: true,
                step: 'shippingAddress',
            };

            await renderCheckoutPage({
                showToast: mockShowToast,
                shippingMethodsMapPromise: Promise.resolve({
                    me: { applicableShippingMethods: [], defaultShippingMethodId: undefined },
                }),
            });

            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith(
                    i18next.t('errors:checkout.noShippingMethodsForAddress'),
                    'error'
                );
            });
        });

        test('does not fire toast when shipping address succeeds with available methods', async () => {
            const mockShowToast = vi.fn();

            mockShippingAddressFetcherData = {
                success: true,
                step: 'shippingAddress',
            };

            await renderCheckoutPage({
                showToast: mockShowToast,
                shippingMethodsMapPromise: Promise.resolve({
                    me: {
                        applicableShippingMethods: [{ id: 'standard', name: 'Standard Shipping', price: 5.99 }],
                        defaultShippingMethodId: 'standard',
                    },
                }),
            });

            expect(mockShowToast).not.toHaveBeenCalled();
        });

        test('does not fire toast when shipping address fetcher has no data', async () => {
            const mockShowToast = vi.fn();
            mockShippingAddressFetcherData = null;

            await renderCheckoutPage({ showToast: mockShowToast });

            expect(mockShowToast).not.toHaveBeenCalled();
        });
    });

    // These tests guard the reload-pin invariants — the last step of streamed prefill. Without them,
    // regressions where `hasAnyValidShippingMethod` is used in place of `hasValidShippingMethodForEveryShipment`
    // would only surface on refresh in a multi-shipment basket with partial coverage, which is
    // easy to miss in QA.
    describe('Reload-pin (shipping address without valid methods)', () => {
        const buildAddressedBasket = (extra?: Record<string, unknown>) => ({
            basketId: 'test-basket',
            productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1, shipmentId: 'me' }],
            shipments: [
                {
                    shipmentId: 'me',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Anytown',
                        stateCode: 'CA',
                        postalCode: '12345',
                        countryCode: 'US',
                    },
                },
            ],
            ...(extra ?? {}),
        });

        test('pins to SHIPPING_ADDRESS on refresh when a shipment has no valid methods for its address', async () => {
            const mockShowToast = vi.fn();
            const pinToStep = vi.fn();
            mockUseBasket.mockReturnValue(buildAddressedBasket());
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PAYMENT, pinToStep }));
            // No submit in flight — this is a fresh load.
            mockShippingAddressFetcherData = null;

            await renderCheckoutPage({
                showToast: mockShowToast,
                // Populated map with an empty methods entry — the address was submitted, the
                // hook ran, but no methods came back. Note: `Promise.resolve({})` would trip
                // the vacuous-truth branch of `hasValidShippingMethodForEveryShipment` and not
                // pin, which is the intended behavior when no address has been submitted yet.
                shippingMethodsMapPromise: Promise.resolve({
                    me: { applicableShippingMethods: [], defaultShippingMethodId: undefined },
                }),
            });

            await waitFor(() => {
                expect(pinToStep).toHaveBeenCalledWith(defaultSteps.SHIPPING_ADDRESS);
            });
            expect(mockShowToast).toHaveBeenCalledWith(
                i18next.t('errors:checkout.noShippingMethodsForAddress'),
                'error'
            );
        });

        test('pins to SHIPPING_ADDRESS on refresh when a multi-shipment basket has one shipment lacking methods', async () => {
            // Regression: previously this used `hasAnyValidShippingMethod`, so ANY valid method in the
            // map would suppress the pin even though a second shipment could not be delivered. The
            // check must be every-shipment.
            const mockShowToast = vi.fn();
            const pinToStep = vi.fn();
            mockUseBasket.mockReturnValue(
                buildAddressedBasket({
                    shipments: [
                        {
                            shipmentId: 'me',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Anytown',
                                stateCode: 'CA',
                                postalCode: '12345',
                                countryCode: 'US',
                            },
                        },
                        {
                            shipmentId: 'gift',
                            shippingAddress: {
                                firstName: 'Jane',
                                lastName: 'Roe',
                                address1: '456 Elm St',
                                city: 'Elsewhere',
                                stateCode: 'NY',
                                postalCode: '10001',
                                countryCode: 'US',
                            },
                        },
                    ],
                })
            );
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PAYMENT, pinToStep }));
            mockShippingAddressFetcherData = null;

            await renderCheckoutPage({
                showToast: mockShowToast,
                shippingMethodsMapPromise: Promise.resolve({
                    me: {
                        applicableShippingMethods: [{ id: 'standard', name: 'Standard', price: 5.99 }],
                        defaultShippingMethodId: 'standard',
                    },
                    gift: { applicableShippingMethods: [], defaultShippingMethodId: undefined },
                }),
            });

            await waitFor(() => {
                expect(pinToStep).toHaveBeenCalledWith(defaultSteps.SHIPPING_ADDRESS);
            });
        });

        test('does not pin when every shipment has at least one valid method', async () => {
            const mockShowToast = vi.fn();
            const pinToStep = vi.fn();
            mockUseBasket.mockReturnValue(buildAddressedBasket());
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PAYMENT, pinToStep }));
            mockShippingAddressFetcherData = null;

            await renderCheckoutPage({
                showToast: mockShowToast,
                shippingMethodsMapPromise: Promise.resolve({
                    me: {
                        applicableShippingMethods: [{ id: 'standard', name: 'Standard Shipping', price: 5.99 }],
                        defaultShippingMethodId: 'standard',
                    },
                }),
            });

            expect(pinToStep).not.toHaveBeenCalled();
            expect(mockShowToast).not.toHaveBeenCalled();
        });

        test('does not pin when the basket has no shipping address yet', async () => {
            // First-time checkout with an empty basket — the address has not been submitted, so the
            // shopper should not be pinned or toasted.
            const mockShowToast = vi.fn();
            const pinToStep = vi.fn();
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                shipments: [{ shipmentId: 'me' }],
            });
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({ step: defaultSteps.SHIPPING_ADDRESS, pinToStep })
            );
            mockShippingAddressFetcherData = null;

            await renderCheckoutPage({
                showToast: mockShowToast,
                shippingMethodsMapPromise: Promise.resolve({}),
            });

            expect(pinToStep).not.toHaveBeenCalled();
            expect(mockShowToast).not.toHaveBeenCalled();
        });
    });

    // Guards the streamed-prefill flash: a returning customer with a complete saved profile
    // computes to PLACE_ORDER on the post-prefill paint, before the streamed shipping-methods
    // map resolves. If that saved address turns out undeliverable, the reload-pin would then
    // bounce them back to Shipping Address — a visible PLACE_ORDER → Shipping Address flash.
    // Gating Place Order/Payment on `shippingMethodsResolved` holds the section until methods land.
    describe('Place Order gated on streamed shipping methods (returning shopper)', () => {
        const addressedBasket = {
            basketId: 'test-basket',
            productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1, shipmentId: 'me' }],
            shipments: [
                {
                    shipmentId: 'me',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Anytown',
                        stateCode: 'CA',
                        postalCode: '12345',
                        countryCode: 'US',
                    },
                },
            ],
        };

        test('hides Place Order while the streamed shipping-methods map is still pending', async () => {
            mockUseBasket.mockReturnValue(addressedBasket);
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));

            // A never-resolving promise keeps `resolvedShippingMethodsMap` undefined, so
            // `shippingMethodsResolved` stays false and the section must not paint.
            await renderCheckoutPage({
                shippingMethodsMapPromise: new Promise(() => {}),
            });

            expect(screen.queryByRole('button', { name: /Place Order/ })).not.toBeInTheDocument();
        });

        test('shows Place Order once the streamed map resolves with valid methods', async () => {
            mockUseBasket.mockReturnValue(addressedBasket);
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));

            await renderCheckoutPage({
                shippingMethodsMapPromise: Promise.resolve({
                    me: {
                        applicableShippingMethods: [{ id: 'standard', name: 'Standard Shipping', price: 5.99 }],
                        defaultShippingMethodId: 'standard',
                    },
                }),
            });

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Place Order/ })).toBeInTheDocument();
            });
        });

        test('keeps Place Order hidden when the resolved map has no valid methods for the address', async () => {
            mockUseBasket.mockReturnValue(addressedBasket);
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));

            await renderCheckoutPage({
                shippingMethodsMapPromise: Promise.resolve({
                    me: { applicableShippingMethods: [], defaultShippingMethodId: undefined },
                }),
            });

            // Resolved but no valid methods → noShippingMethodsRef keeps the section blocked.
            await waitFor(() => {
                expect(screen.queryByRole('button', { name: /Place Order/ })).not.toBeInTheDocument();
            });
        });
    });

    describe('emailVerificationEnabled hides create account checkbox', () => {
        let originalSessionStorage: Storage;

        beforeEach(() => {
            originalSessionStorage = window.sessionStorage;
            mockUseCustomerProfile.mockReturnValue(null);
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                customerInfo: null,
            });
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    step: defaultSteps.PAYMENT,
                })
            );
            Object.defineProperty(window, 'sessionStorage', {
                value: {
                    getItem: vi.fn(() => null),
                    setItem: vi.fn(),
                    removeItem: vi.fn(),
                    clear: vi.fn(),
                },
                writable: true,
                configurable: true,
            });
        });

        afterEach(() => {
            Object.defineProperty(window, 'sessionStorage', {
                value: originalSessionStorage,
                writable: true,
                configurable: true,
            });
        });

        test('hides create account checkbox when emailVerificationEnabled is false', async () => {
            await renderCheckoutPage({ emailVerificationEnabled: false });

            expect(screen.queryByTestId('register-customer-checkbox')).not.toBeInTheDocument();
        });

        test('shows create account checkbox when emailVerificationEnabled is true', async () => {
            await renderCheckoutPage({ emailVerificationEnabled: true });

            expect(screen.getByTestId('register-customer-checkbox')).toBeInTheDocument();
        });

        test('shows create account checkbox when emailVerificationEnabled is undefined', async () => {
            await renderCheckoutPage({ emailVerificationEnabled: undefined });

            expect(screen.getByTestId('register-customer-checkbox')).toBeInTheDocument();
        });
    });

    describe('Loading state live region (a11y)', () => {
        // Reset mockIsSubmitting after each test in this block. vi.clearAllMocks() clears
        // call history but not implementations for vi.fn(), so mockImplementation() would
        // otherwise leak into subsequent tests in the outer describe.
        afterEach(() => {
            mockIsSubmitting.mockReturnValue(false);
        });

        test('status region is empty when no section is submitting', async () => {
            await renderCheckoutPage();

            const region = screen.getByRole('status');
            expect(region).toBeInTheDocument();
            expect(region).toHaveTextContent('');
        });

        test('status region contains "Saving" when contact section is submitting', async () => {
            mockIsSubmitting.mockImplementation((key: string) => key === 'contact');
            await renderCheckoutPage();

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Saving');
            });
        });

        test('status region contains "Saving" when shipping-address section is submitting', async () => {
            mockIsSubmitting.mockImplementation((key: string) => key === 'shipping-address');
            await renderCheckoutPage();

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Saving');
            });
        });

        test('status region contains "Saving" when shipping-options section is submitting', async () => {
            mockIsSubmitting.mockImplementation((key: string) => key === 'shipping-options');
            await renderCheckoutPage();

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Saving');
            });
        });

        test('status region contains "Saving" when payment section is submitting', async () => {
            mockIsSubmitting.mockImplementation((key: string) => key === 'payment');
            await renderCheckoutPage();

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Saving');
            });
        });

        test('status region clears when submission completes', async () => {
            mockIsSubmitting.mockImplementation((key: string) => key === 'contact');
            const { rerender } = await renderCheckoutPage();

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Saving');
            });

            // Submission completes - all sections go back to idle
            mockIsSubmitting.mockReturnValue(false);
            act(() => {
                rerender(<CheckoutFormPage {...defaultProps} />);
            });

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('');
            });
        });

        test('status region contains "Placing order" when isPlaceOrderPending is true', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                paymentInstruments: [],
            });

            // No payment data getter - falls through to submitPlaceOrder path which sets isPlaceOrderPending
            mockPaymentFormDataGetter = null;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Placing order');
            });
        });

        test('"Placing order" takes priority over "Saving" when both isPlaceOrderPending and a section is submitting', async () => {
            // Scenario: user clicks Place Order; isPlaceOrderPending is set synchronously,
            // then the payment fetcher starts submitting. Both flags are true at the same time.
            // The status should show "Placing order", not "Saving".
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
                paymentInstruments: [],
            });

            // No payment data - falls through to submitPlaceOrder, sets isPlaceOrderPending=true.
            mockPaymentFormDataGetter = null;

            const { rerender } = await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            // isPlaceOrderPending is now true. Simulate a section also saving at the same time.
            mockIsSubmitting.mockImplementation((key: string) => key === 'payment');
            act(() => {
                rerender(<CheckoutFormPage {...defaultProps} />);
            });

            // "Placing order" must win over "Saving" even when both are true.
            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Placing order');
            });
        });
    });

    describe('onPlaceOrder delegation (extension full delegation)', () => {
        const basketWithPayment = {
            basketId: 'test-basket',
            productItems: [{ itemId: 'item1', productId: 'product1', quantity: 1 }],
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pi-1',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: { cardType: 'Visa', holder: 'John Doe', maskedNumber: '***1111' },
                },
            ],
        };

        let originalFetch: typeof fetch;
        let originalLocation: Location;
        let assignedHref: string | null;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
            originalLocation = window.location;
            assignedHref = null;
            // Replace window.location with a stub that captures href assignment.
            // jsdom's default location object's href setter triggers a real navigation
            // (NotSupportedError); capturing here keeps the test environment stable.
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: {
                    ...originalLocation,
                    set href(v: string) {
                        assignedHref = v;
                    },
                    get href() {
                        return assignedHref ?? '';
                    },
                },
            });
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        });

        test('runs prepare, awaits onPlaceOrder, then runs finalize and navigates on success', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');

            const fetchMock = vi
                .fn()
                .mockImplementationOnce(() =>
                    Promise.resolve(
                        new Response(JSON.stringify({ success: true }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    )
                )
                .mockImplementationOnce(() =>
                    Promise.resolve(
                        new Response(JSON.stringify({ success: true, redirectUrl: '/order-confirmation/ORD-9001' }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    )
                );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(assignedHref).toBe('/order-confirmation/ORD-9001');
            });

            expect(mockSubmitPlaceOrder).not.toHaveBeenCalled();
            expect(mockSubmitPayment).not.toHaveBeenCalled();
            expect(mockOnPlaceOrder).toHaveBeenCalledTimes(1);
            // Two BFF calls: prepare first, then finalize after onPlaceOrder.
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(fetchMock.mock.calls[0]?.[0]).toBe('/action/place-order-prepare');
            expect(fetchMock.mock.calls[1]?.[0]).toBe('/action/place-order-finalize');
            const finalizeFormData = (fetchMock.mock.calls[1]?.[1] as { body: FormData }).body;
            expect(finalizeFormData.get('orderNo')).toBe('ORD-9001');
        });

        test('does not call onPlaceOrder or finalize when prepare rejects the basket', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');

            const fetchMock = vi.fn().mockResolvedValueOnce(
                new Response(JSON.stringify({ success: false, error: 'no-basket' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            // Wait for the prepare fetch to land. Don't call mockOnPlaceOrder -
            // assert non-call after the awaited signal.
            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            expect(fetchMock.mock.calls[0]?.[0]).toBe('/action/place-order-prepare');
            expect(mockOnPlaceOrder).not.toHaveBeenCalled();
            expect(assignedHref).toBeNull();
        });

        test('does not call finalize when onPlaceOrder resolves with null', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue(null);

            const fetchMock = vi.fn().mockResolvedValueOnce(
                new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(mockOnPlaceOrder).toHaveBeenCalledTimes(1);
            });
            expect(mockSubmitPlaceOrder).not.toHaveBeenCalled();
            // Prepare fired; finalize did not.
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls[0]?.[0]).toBe('/action/place-order-prepare');
            expect(assignedHref).toBeNull();
        });

        test('falls through to existing place-order flow when onPlaceOrder is null', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = null; // explicit, though already the default

            const fetchMock = vi.fn();
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            expect(mockSubmitPlaceOrder).toHaveBeenCalledTimes(1);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('two clicks in the same paint trigger only one prepare/onPlaceOrder chain', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');

            const fetchMock = vi
                .fn()
                .mockImplementationOnce(() =>
                    Promise.resolve(
                        new Response(JSON.stringify({ success: true }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    )
                )
                .mockImplementationOnce(() =>
                    Promise.resolve(
                        new Response(JSON.stringify({ success: true, redirectUrl: '/order-confirmation/ORD-9001' }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    )
                );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            // Synchronous double-click within the same paint - the React-state pending
            // flag hasn't applied yet, so the synchronous ref guard is the only thing
            // preventing two onPlaceOrder chains.
            act(() => {
                fireEvent.click(placeOrderButton);
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                // Only one prepare + one finalize, not four.
                expect(fetchMock).toHaveBeenCalledTimes(2);
            });
            expect(mockOnPlaceOrder).toHaveBeenCalledTimes(1);
        });

        test('clears pending state and stays put when finalize returns non-success', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');

            const fetchMock = vi
                .fn()
                .mockImplementationOnce(() =>
                    Promise.resolve(
                        new Response(JSON.stringify({ success: true }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    )
                )
                .mockImplementationOnce(() =>
                    Promise.resolve(
                        new Response(JSON.stringify({ success: false, error: 'place_order_finalize_failed' }), {
                            status: 500,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    )
                );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            // Both fetches must complete before we can assert no navigation occurred.
            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(2);
            });
            expect(assignedHref).toBeNull();
        });

        test('navigates to confirmation when finalize fetch throws but onPlaceOrder produced an orderNo', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');

            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                )
                .mockRejectedValueOnce(new Error('network'));
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            // Order is real (onPlaceOrder produced an orderNo); the catch path builds a
            // site-prefixed confirmation URL and hard-navigates so the loader's
            // idempotent destroyBasket clears the cookie.
            await waitFor(() => {
                expect(assignedHref).toContain('/order-confirmation/ORD-9001');
            });
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        test('stays put with toast when finalize fetch throws before onPlaceOrder produced an orderNo', async () => {
            // For example, prepare succeeds, but the fetch fails before onPlaceOrder runs.
            // Without an orderNo, we can't safely navigate to confirmation.
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockRejectedValue(new Error('PSP confirmation failed'));

            const fetchMock = vi.fn().mockResolvedValueOnce(
                new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            // Wait for the failure path to run by observing the toast helper. assignedHref
            // not being set is the assertion we care about, but we need a positive signal
            // first to avoid asserting before the async chain has resolved the rejection.
            await waitFor(() => {
                expect(mockOnPlaceOrder).toHaveBeenCalled();
            });
            expect(assignedHref).toBeNull();
        });

        test('handles malformed finalize response body without crashing', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');

            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                )
                .mockResolvedValueOnce(
                    // Malformed JSON body - exercises the catch branch in the parse block.
                    new Response('not-json', { status: 500, headers: { 'Content-Type': 'text/plain' } })
                );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(2);
            });
            expect(assignedHref).toBeNull();
        });

        test('persists billing address to update-basket-billing-address before prepare when getter returns an address', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');
            mockBillingAddressGetter = vi.fn().mockReturnValue({
                firstName: 'Jane',
                lastName: 'Smith',
                address1: '456 Billing Ave',
                city: 'Los Angeles',
                stateCode: 'CA',
                postalCode: '90001',
                countryCode: 'US',
            });

            const fetchMock = vi
                .fn()
                // 0. update-basket-billing-address
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                )
                // 1. prepare
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                )
                // 2. finalize
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true, redirectUrl: '/order-confirmation/ORD-9001' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(assignedHref).toBe('/order-confirmation/ORD-9001');
            });

            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(fetchMock.mock.calls[0]?.[0]).toBe('/resource/update-basket-billing-address');
            const billingBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
                string,
                unknown
            >;
            expect(billingBody.firstName).toBe('Jane');
            expect(fetchMock.mock.calls[1]?.[0]).toBe('/action/place-order-prepare');
            expect(fetchMock.mock.calls[2]?.[0]).toBe('/action/place-order-finalize');
            expect(mockOnPlaceOrder).toHaveBeenCalledTimes(1);
        });

        test('skips update-basket-billing-address when getter returns null', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');
            mockBillingAddressGetter = vi.fn().mockReturnValue(null);

            const fetchMock = vi
                .fn()
                // prepare
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                )
                // finalize
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ success: true, redirectUrl: '/order-confirmation/ORD-9001' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                );
            globalThis.fetch = fetchMock as typeof fetch;

            await renderCheckoutPage();

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(assignedHref).toBe('/order-confirmation/ORD-9001');
            });

            // Only prepare and finalize - no update-basket-billing-address call.
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(fetchMock.mock.calls[0]?.[0]).toBe('/action/place-order-prepare');
            expect(fetchMock.mock.calls[1]?.[0]).toBe('/action/place-order-finalize');
        });

        test('does not invoke onPlaceOrder or prepare when update-basket-billing-address returns non-ok', async () => {
            mockUseCheckoutContext.mockReturnValue(buildCheckoutContext({ step: defaultSteps.PLACE_ORDER }));
            mockUseBasket.mockReturnValue(basketWithPayment);
            mockOnPlaceOrder = vi.fn().mockResolvedValue('ORD-9001');
            mockBillingAddressGetter = vi.fn().mockReturnValue({
                firstName: 'Jane',
                lastName: 'Smith',
                address1: '456 Billing Ave',
                city: 'Los Angeles',
                stateCode: 'CA',
                postalCode: '90001',
                countryCode: 'US',
            });

            const fetchMock = vi.fn().mockResolvedValueOnce(
                new Response(JSON.stringify({ success: false }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            globalThis.fetch = fetchMock as typeof fetch;

            const mockShowToast = vi.fn();
            await renderCheckoutPage({ showToast: mockShowToast });

            const placeOrderButton = screen.getByRole('button', { name: /Place Order/ });
            act(() => {
                fireEvent.click(placeOrderButton);
            });

            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            expect(fetchMock.mock.calls[0]?.[0]).toBe('/resource/update-basket-billing-address');
            expect(mockOnPlaceOrder).not.toHaveBeenCalled();
            expect(assignedHref).toBeNull();
            await waitFor(() => {
                expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
            });
        });
    });
});
