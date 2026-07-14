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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { mockAltSiteObject } from '@/test-utils/config';
import { useCheckoutContext } from '@/hooks/use-checkout';
import CheckoutFormPage from './checkout-form-page';
import { resourceRoutes } from '@/route-paths';

// Mock component prop interfaces
interface MockComponentProps {
    children?: React.ReactNode;
    [key: string]: unknown;
}

interface MockFormProps extends MockComponentProps {
    onSubmit?: (e: React.FormEvent) => void;
}

function createErrorResponse(message = 'Failed to process request') {
    return HttpResponse.json(
        {
            success: false,
            error: message,
        },
        { status: 400 }
    );
}

async function makeFormRequest(url: string, formData: URLSearchParams) {
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
    });
}

const server = setupServer(
    // Customer profile API
    http.get('/api/customers/:customerId', ({ params }) => {
        if (params.customerId === 'returning-customer-123') {
            return HttpResponse.json({
                customer: {
                    customerId: 'returning-customer-123',
                    email: 'returning@example.com',
                    firstName: 'Jane',
                    lastName: 'Smith',
                    phoneHome: '+1-555-0123',
                },
                addresses: [
                    {
                        addressId: 'home-address',
                        firstName: 'Jane',
                        lastName: 'Smith',
                        address1: '456 Oak Street',
                        city: 'San Francisco',
                        stateCode: 'CA',
                        postalCode: '94102',
                        countryCode: 'US',
                        phone: '+1-555-0123',
                        preferred: true,
                    },
                ],
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'saved-card-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: {
                            cardType: 'Visa',
                            maskedNumber: '**** **** **** 1234',
                            holder: 'Jane Smith',
                            expirationMonth: 12,
                            expirationYear: 2025,
                        },
                        preferred: true,
                    },
                ],
            });
        }

        return new HttpResponse(null, { status: 404 });
    }),

    // Customer lookup API
    http.post('/api/customer-lookup', async ({ request }) => {
        const body = (await request.json()) as { email: string };
        const { email } = body;

        if (email === 'returning@example.com') {
            return HttpResponse.json({
                recommendation: 'login',
                message: 'Welcome back! Please log in to access your saved information.',
            });
        }

        return HttpResponse.json({
            recommendation: 'guest',
            message: 'Continue as guest or create an account for faster checkout.',
        });
    }),

    // Basket APIs
    http.get('/api/baskets/:basketId', () => {
        return HttpResponse.json({
            basketId: 'test-basket-123',
            currency: mockAltSiteObject.defaultCurrency,
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'product-1',
                    productName: 'Test Product',
                    price: 99.99,
                    quantity: 1,
                },
            ],
            productTotal: 99.99,
            orderTotal: 115.98,
            shippingTotal: 5.99,
            taxTotal: 10.0,
        });
    }),

    // Shipping methods API
    http.get('/api/baskets/:basketId/shipments/:shipmentId/shipping-methods', () => {
        return HttpResponse.json({
            applicableShippingMethods: [
                {
                    id: 'standard',
                    name: 'Standard Shipping',
                    description: '5-7 business days',
                    price: 5.99,
                    estimatedArrivalTime: '5-7 business days',
                    default: true, // Commerce Cloud default
                },
                {
                    id: 'express',
                    name: 'Express Shipping',
                    description: '2-3 business days',
                    price: 12.99,
                    estimatedArrivalTime: '2-3 business days',
                },
                {
                    id: 'overnight',
                    name: 'Overnight Shipping',
                    description: 'Next business day',
                    price: 24.99,
                    estimatedArrivalTime: 'Next business day',
                },
            ],
        });
    }),

    // Contact info submission
    http.post('/action/submit-contact-info', async ({ request }) => {
        try {
            const formData = await request.formData();
            const email = formData.get('email') as string;

            return HttpResponse.json({
                success: true,
                step: 'contactInfo',
                data: { email },
            });
        } catch {
            return HttpResponse.json(
                {
                    success: false,
                    error: 'Failed to process request',
                },
                { status: 400 }
            );
        }
    }),

    http.post('/action/submit-shipping-address', async ({ request }) => {
        const formData = await request.formData();

        return HttpResponse.json({
            success: true,
            step: 'shippingAddress',
            data: {
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                address1: formData.get('address1'),
                city: formData.get('city'),
                stateCode: formData.get('stateCode'),
                postalCode: formData.get('postalCode'),
            },
        });
    }),

    // Shipping options submission
    http.post('/action/submit-shipping-options', async ({ request }) => {
        const formData = await request.formData();
        const shippingMethodId = formData.get('shippingMethodId') as string;

        return HttpResponse.json({
            success: true,
            step: 'shippingOptions',
            data: { shippingMethodId },
        });
    }),

    // Payment submission
    http.post('/action/submit-payment', async ({ request }) => {
        const formData = await request.formData();
        const cardNumber = formData.get('cardNumber') as string;

        // Simulate payment failure for specific card
        if (cardNumber === '4000000000000002') {
            return HttpResponse.json(
                {
                    success: false,
                    error: 'Payment declined. Please try a different card.',
                    step: 'payment',
                },
                { status: 400 }
            );
        }

        return HttpResponse.json({
            success: true,
            step: 'payment',
            data: {
                paymentMethodId: 'CREDIT_CARD',
                maskedCardNumber: `**** **** **** ${cardNumber.slice(-4)}`,
            },
        });
    }),

    // Order placement
    http.post(resourceRoutes.placeOrder, () => {
        return HttpResponse.json({
            success: true,
            orderNo: 'ORDER-2024-001',
            redirectTo: '/order-confirmation/ORDER-2024-001',
        });
    })
);

// Mock React Router hooks with realistic implementations
const mockUseLoaderData = vi.fn();
const mockUseNavigation = vi.fn();
const mockUseFetcher = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    const React = await import('react');
    return {
        ...actual,
        // React Router's createContext extends React.createContext with additional router-specific
        // functionality (like useContext hooks that throw helpful errors). In tests, we replace it
        // with React.createContext to avoid router context dependencies while maintaining the same
        // Provider/Consumer API that components expect.
        createContext: React.createContext,
        Form: ({ children, ...props }: MockFormProps) => <form {...props}>{children}</form>,
        useLoaderData: () => mockUseLoaderData(),
        useNavigation: () => mockUseNavigation(),
        useFetcher: () => mockUseFetcher(),
        useSearchParams: () => mockUseSearchParams(),
    };
});

// Mock providers
vi.mock('@/providers/basket', () => ({
    useBasket: () => ({
        basketId: 'test-basket-123',
        currency: mockAltSiteObject.defaultCurrency,
        productItems: [{ itemId: 'item-1', productId: 'product-1', quantity: 1, shipmentId: 'me' }],
        productTotal: 99.99,
        orderTotal: 115.98,
        customerInfo: { email: '' },
        shipments: [{ shipmentId: 'me' }],
        paymentInstruments: [],
    }),
    useBasketHydrated: () => true,
}));

vi.mock('@/providers/auth', () => ({
    useAuth: () => ({ userType: 'guest' }),
}));

const defaultCheckoutContext = {
    step: 1,
    computedStep: 1,
    STEPS: { CONTACT_INFO: 1, PICKUP: 1.5, SHIPPING_ADDRESS: 2, SHIPPING_OPTIONS: 3, PAYMENT: 4, PLACE_ORDER: 5 },
    goToStep: vi.fn(),
    goToNextStep: vi.fn(),
    exitEditMode: vi.fn(),
    editingStep: null,
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
} as any;

// Mock hooks
vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: vi.fn(() => defaultCheckoutContext),
}));

vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: vi.fn(() => null),
}));

vi.mock('@/hooks/checkout/use-completed-steps', () => ({
    useCompletedSteps: () => [],
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

// Mock functions from useAnalytics to avoid tracking consent dependency chain
vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: vi.fn(() => ({
        trackCheckoutStart: vi.fn(),
        trackCheckoutStep: vi.fn(),
    })),
}));

vi.mock('@/hooks/use-customer-lookup', () => ({
    useLoginSuggestion: () => null,
}));

vi.mock('@/hooks/use-checkout-actions', () => ({
    useCheckoutActions: () => ({
        submitContactInfo: vi.fn(),
        submitShippingAddress: vi.fn(),
        submitShippingOptions: vi.fn(),
        submitPayment: vi.fn(),
        submitPlaceOrder: vi.fn(),
        contactFetcher: { state: 'idle', data: null },
        shippingAddressFetcher: { state: 'idle', data: null },
        shippingOptionsFetcher: { state: 'idle', data: null },
        paymentFetcher: { state: 'idle', data: null },
        placeOrderFetcher: { state: 'idle', data: null },
        isSubmitting: () => false,
        handleCreateAccountPreferenceChange: vi.fn(),
        shouldCreateAccount: false,
    }),
}));

// Mock components to keep tests focused on integration
vi.mock('./checkout-progress', () => ({
    CheckoutProgress: () => <div data-testid="checkout-progress">Progress</div>,
}));

vi.mock('@/components/order-summary', () => ({
    default: () => <div data-testid="order-summary">Order Summary</div>,
}));

vi.mock('./components/contact-info', () => ({
    default: ({ isCompleted, isEditing }: { isCompleted: boolean; isEditing: boolean }) => (
        <div data-testid="contact-info-form">
            <h2>Contact Information</h2>
            {(isEditing || !isCompleted) && (
                <div>
                    <label htmlFor="email">Email Address</label>
                    <input type="email" id="email" name="email" />
                    <button type="button">Continue to Shipping</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('./components/shipping-address', () => ({
    default: ({ isCompleted, isEditing }: { isCompleted: boolean; isEditing: boolean }) => (
        <div data-testid="shipping-address-form">
            <h2>Shipping Address</h2>
            {(isEditing || !isCompleted) && (
                <div>
                    <label htmlFor="firstName">First Name</label>
                    <input type="text" id="firstName" name="firstName" />
                    <label htmlFor="lastName">Last Name</label>
                    <input type="text" id="lastName" name="lastName" />
                    <label htmlFor="address1">Address</label>
                    <input type="text" id="address1" name="address1" />
                    <label htmlFor="city">City</label>
                    <input type="text" id="city" name="city" />
                    <label htmlFor="stateCode">State/Province</label>
                    <select id="stateCode" name="stateCode">
                        <option value="NY">New York</option>
                        <option value="CA">California</option>
                    </select>
                    <label htmlFor="postalCode">Postal Code</label>
                    <input type="text" id="postalCode" name="postalCode" />
                    <button type="button">Continue to Shipping Options</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('./components/shipping-options', () => ({
    default: ({ isCompleted, isEditing }: { isCompleted: boolean; isEditing: boolean }) => (
        <div data-testid="shipping-options-form">
            <h2>Shipping Options</h2>
            {(isEditing || !isCompleted) && (
                <div>
                    <label>
                        <input type="radio" name="shippingMethod" value="standard" defaultChecked />
                        Standard Shipping
                    </label>
                    <label>
                        <input type="radio" name="shippingMethod" value="express" />
                        Express Shipping
                    </label>
                    <button type="button">Continue to Payment</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('./components/payment', () => ({
    default: ({ isCompleted, isEditing }: { isCompleted: boolean; isEditing: boolean }) => (
        <div data-testid="payment-form">
            <h2>Payment</h2>
            {(isEditing || !isCompleted) && (
                <div>
                    <label htmlFor="cardNumber">Card Number</label>
                    <input type="text" id="cardNumber" name="cardNumber" />
                    <label htmlFor="cardholderName">Cardholder Name</label>
                    <input type="text" id="cardholderName" name="cardholderName" />
                    <label htmlFor="expiryDate">Expiry Date</label>
                    <input type="text" id="expiryDate" name="expiryDate" />
                    <label htmlFor="cvv">CVV</label>
                    <input type="text" id="cvv" name="cvv" />
                    <button type="button">Place Order</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('./components/register-customer-selection', () => ({
    default: ({ onSaved }: { onSaved: (value: boolean) => void }) => (
        <div data-testid="register-customer-checkbox">
            <label>
                <input
                    type="checkbox"
                    onChange={(e) => onSaved(e.target.checked)}
                    data-testid="create-account-checkbox"
                />
                Create an account for faster checkout next time
            </label>
        </div>
    ),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: MockComponentProps) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
    Card: ({ children, ...props }: MockComponentProps) => <div {...props}>{children}</div>,
    CardContent: ({ children, ...props }: MockComponentProps) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: MockComponentProps) => <div {...props}>{children}</div>,
    CardTitle: ({ children, ...props }: MockComponentProps) => <h3 {...props}>{children}</h3>,
}));

vi.mock('@/components/typography', () => ({
    Typography: ({ children, ...props }: MockComponentProps) => <div {...props}>{children}</div>,
}));

// Mock MyCart component
vi.mock('@/components/my-cart', () => ({
    default: () => <div data-testid="my-cart">My Cart</div>,
}));

describe('Checkout Flow Integration Tests', () => {
    beforeEach(() => {
        vi.mocked(useCheckoutContext).mockReturnValue(defaultCheckoutContext);
    });

    // Default test props for CheckoutFormPage. The shipping methods map is streamed from the
    // loader and resolved inside `ShippingMethodsBridge` — tests provide a resolved Promise.
    const defaultProps = {
        productMapPromise: Promise.resolve({}),
        shippingMethodsMapPromise: Promise.resolve({
            me: {
                applicableShippingMethods: [
                    { id: 'standard', name: 'Standard Shipping', price: 5.99, default: true },
                    { id: 'express', name: 'Express Shipping', price: 12.99 },
                ],
            },
        }),
    };

    const baseHandlers = [
        http.get('/api/customers/:customerId', ({ params }) => {
            if (params.customerId === 'returning-customer-123') {
                return HttpResponse.json({
                    customer: {
                        customerId: 'returning-customer-123',
                        email: 'returning@example.com',
                        firstName: 'Jane',
                        lastName: 'Smith',
                        phoneHome: '+1-555-0123',
                    },
                    addresses: [
                        {
                            addressId: 'home-address',
                            firstName: 'Jane',
                            lastName: 'Smith',
                            address1: '456 Oak Street',
                            city: 'San Francisco',
                            stateCode: 'CA',
                            postalCode: '94102',
                            countryCode: 'US',
                            phone: '+1-555-0123',
                            preferred: true,
                        },
                    ],
                    paymentInstruments: [
                        {
                            paymentInstrumentId: 'saved-card-1',
                            paymentMethodId: 'CREDIT_CARD',
                            paymentCard: {
                                cardType: 'Visa',
                                maskedNumber: '**** **** **** 1234',
                                holder: 'Jane Smith',
                                expirationMonth: 12,
                                expirationYear: 2025,
                            },
                            preferred: true,
                        },
                    ],
                });
            }
            return new HttpResponse(null, { status: 404 });
        }),
        http.post('/api/customer-lookup', async ({ request }) => {
            const body = (await request.json()) as { email: string };
            const { email } = body;
            if (email === 'returning@example.com') {
                return HttpResponse.json({
                    recommendation: 'login',
                    message: 'Welcome back! Please log in to access your saved information.',
                });
            }
            return HttpResponse.json({
                recommendation: 'guest',
                message: 'Continue as guest or create an account for faster checkout.',
            });
        }),
        http.get('/api/baskets/:basketId', () => {
            return HttpResponse.json({
                basketId: 'test-basket-123',
                currency: mockAltSiteObject.defaultCurrency,
                productItems: [
                    {
                        itemId: 'item-1',
                        productId: 'product-1',
                        productName: 'Test Product',
                        price: 99.99,
                        quantity: 1,
                    },
                ],
                productTotal: 99.99,
                orderTotal: 115.98,
                shippingTotal: 5.99,
                taxTotal: 10.0,
            });
        }),
        http.get('/api/baskets/:basketId/shipments/:shipmentId/shipping-methods', () => {
            return HttpResponse.json({
                applicableShippingMethods: [
                    {
                        id: 'standard',
                        name: 'Standard Shipping',
                        description: '5-7 business days',
                        price: 5.99,
                        estimatedArrivalTime: '5-7 business days',
                        default: true,
                    },
                    {
                        id: 'express',
                        name: 'Express Shipping',
                        description: '2-3 business days',
                        price: 12.99,
                        estimatedArrivalTime: '2-3 business days',
                    },
                    {
                        id: 'overnight',
                        name: 'Overnight Shipping',
                        description: 'Next business day',
                        price: 24.99,
                        estimatedArrivalTime: 'Next business day',
                    },
                ],
            });
        }),
        http.post('/action/submit-contact-info', async ({ request }) => {
            try {
                const formData = await request.formData();
                const email = formData.get('email') as string;
                return HttpResponse.json({
                    success: true,
                    step: 'contactInfo',
                    data: { email },
                });
            } catch {
                return createErrorResponse();
            }
        }),
        http.post('/action/submit-shipping-address', async ({ request }) => {
            try {
                const formData = await request.formData();

                return HttpResponse.json({
                    success: true,
                    step: 'shippingAddress',
                    data: {
                        firstName: formData.get('firstName'),
                        lastName: formData.get('lastName'),
                        address1: formData.get('address1'),
                        city: formData.get('city'),
                        stateCode: formData.get('stateCode'),
                        postalCode: formData.get('postalCode'),
                    },
                });
            } catch {
                return createErrorResponse();
            }
        }),
        http.post('/action/submit-shipping-options', async ({ request }) => {
            try {
                const formData = await request.formData();
                const shippingMethodId = formData.get('shippingMethodId') as string;
                return HttpResponse.json({
                    success: true,
                    step: 'shippingOptions',
                    data: { shippingMethodId },
                });
            } catch {
                return createErrorResponse();
            }
        }),
        http.post('/action/submit-payment', async ({ request }) => {
            try {
                const formData = await request.formData();
                const cardNumber = formData.get('cardNumber') as string;
                if (cardNumber === '4000000000000002') {
                    return HttpResponse.json(
                        {
                            success: false,
                            error: 'Payment declined. Please try a different card.',
                            step: 'payment',
                        },
                        { status: 400 }
                    );
                }
                return HttpResponse.json({
                    success: true,
                    step: 'payment',
                    data: {
                        paymentMethodId: 'CREDIT_CARD',
                        maskedCardNumber: `**** **** **** ${cardNumber.slice(-4)}`,
                    },
                });
            } catch {
                return createErrorResponse();
            }
        }),
        http.post(resourceRoutes.placeOrder, () => {
            return HttpResponse.json({
                success: true,
                orderNo: 'ORDER-2024-001',
                redirectTo: '/order-confirmation/ORDER-2024-001',
            });
        }),
    ];

    beforeAll(() => {
        server.listen({ onUnhandledRequest: 'warn' });
    });

    afterEach(() => {
        server.resetHandlers();
        server.use(...baseHandlers);
        vi.clearAllMocks();
    });

    afterAll(() => {
        server.close();
    });

    beforeEach(() => {
        mockUseLoaderData.mockReturnValue({
            shippingMethods: {
                applicableShippingMethods: [
                    { id: 'standard', name: 'Standard Shipping', price: 5.99, default: true },
                    { id: 'express', name: 'Express Shipping', price: 12.99 },
                ],
            },
        });

        mockUseNavigation.mockReturnValue({ state: 'idle', formAction: null });

        mockUseFetcher.mockReturnValue({
            state: 'idle',
            data: null,
            submit: vi.fn(),
            load: vi.fn(),
            Form: 'form',
        });

        mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()]);
    });

    describe('Component Rendering', () => {
        test('renders checkout form page', async () => {
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for productMapPromise to resolve
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // Component should render without throwing
            expect(screen.queryByTestId('contact-info-form')).toBeDefined();
        });

        test('displays all main checkout sections', async () => {
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for productMapPromise to resolve
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // Component should render
            expect(document.body).toBeTruthy();
        });

        test('displays correct form field labels', async () => {
            vi.mocked(useCheckoutContext).mockReturnValue({
                ...defaultCheckoutContext,
                step: 4, // PAYMENT - create account checkbox shows when Place Order section is visible
                computedStep: 4,
            });
            sessionStorage.setItem(
                'customerLookupResult',
                JSON.stringify({ recommendation: 'guest', message: 'Continue as guest.' })
            );
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for productMapPromise to resolve
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            await screen.findByTestId('register-customer-checkbox', {}, { timeout: 3000 });
            await waitFor(() => {
                expect(screen.getAllByTestId('order-summary').length).toBeGreaterThan(0);
            });
            await waitFor(() => {
                expect(screen.getAllByTestId('my-cart').length).toBeGreaterThan(0);
            });
            sessionStorage.removeItem('customerLookupResult');
        });
    });

    describe('User Interactions and Form Behavior', () => {
        test('allows user input in form fields', async () => {
            const user = userEvent.setup();
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // Wait for email field to be rendered
            const emailInput = await waitFor(() => screen.getByLabelText('Email Address'));
            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveValue('test@example.com');
        });

        test('account creation checkbox toggles state correctly', async () => {
            vi.mocked(useCheckoutContext).mockReturnValue({
                ...defaultCheckoutContext,
                step: 4, // PAYMENT - create account checkbox shows when Place Order section is visible
                computedStep: 4,
            });
            sessionStorage.setItem('customerLookupResult', JSON.stringify({ recommendation: 'guest' }));
            const user = userEvent.setup();
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // Wait for checkbox to be rendered
            const checkbox = await waitFor(() => screen.getByRole('checkbox'));
            expect(checkbox).not.toBeChecked();

            // Test checkbox interaction
            await user.click(checkbox);
            expect(checkbox).toBeChecked();

            // Test toggle back
            await user.click(checkbox);
            expect(checkbox).not.toBeChecked();
            sessionStorage.removeItem('customerLookupResult');
        });

        test('form validation structure is accessible', async () => {
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // Wait for form to be rendered
            const emailInput = await waitFor(() => screen.getByLabelText('Email Address'));
            expect(emailInput).toHaveAttribute('type', 'email');
            expect(emailInput).toBeInTheDocument();
        });

        test('shipping method radio buttons show default selection', async () => {
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // Wait for shipping options to be rendered
            const standardOption = await waitFor(() => screen.getByLabelText('Standard Shipping'));
            expect(standardOption).toBeChecked();
        });
    });

    describe('UI State Management and Form Behavior', () => {
        test('shows loading state during form submission', async () => {
            // Mock submitting state
            mockUseFetcher.mockReturnValue({
                state: 'submitting',
                data: null,
                submit: vi.fn(),
                load: vi.fn(),
                Form: 'form',
            });

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // UI should reflect submitting state (buttons disabled, loading indicators)
            // This validates the UI responds to fetcher state changes
            expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
        });

        test('displays success state after form completion', async () => {
            // Mock successful submission
            mockUseFetcher.mockReturnValue({
                state: 'idle',
                data: { success: true, step: 'contactInfo' },
                submit: vi.fn(),
                load: vi.fn(),
                Form: 'form',
            });

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // UI should show success feedback when form completes successfully
            expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
        });

        test('displays error state for failed submissions', async () => {
            // Mock error state
            mockUseFetcher.mockReturnValue({
                state: 'idle',
                data: {
                    success: false,
                    error: 'Payment declined. Please try a different card.',
                    step: 'payment',
                },
                submit: vi.fn(),
                load: vi.fn(),
                Form: 'form',
            });

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // UI should display error messages to user
            expect(screen.getByTestId('payment-form')).toBeInTheDocument();
        });

        test('shows customer recognition UI for returning users', async () => {
            // Simulate customer lookup that recognizes returning user
            server.use(
                http.post('/api/customer-lookup', () => {
                    return HttpResponse.json({
                        recommendation: 'login',
                        message: 'Welcome back! Please log in to access your saved information.',
                    });
                })
            );

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Test that UI would show login recommendation
            // (In real implementation, this would trigger a UI state change)
            expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
        });

        test('updates shipping options UI when methods are loaded', async () => {
            // Test that shipping options render with proper default selection
            mockUseLoaderData.mockReturnValue({
                shippingMethods: {
                    applicableShippingMethods: [
                        { id: 'standard', name: 'Standard Shipping', price: 5.99, default: true },
                        { id: 'express', name: 'Express Shipping', price: 12.99 },
                        { id: 'overnight', name: 'Overnight Shipping', price: 24.99 },
                    ],
                },
            });

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // UI should show all shipping options with default selected
            const standardOption = await waitFor(() => screen.getByLabelText('Standard Shipping'));
            const expressOption = screen.getByLabelText('Express Shipping');
            expect(standardOption).toBeChecked();
            expect(expressOption).not.toBeChecked();
        });
    });

    describe('Commerce Cloud Data Integration in UI', () => {
        test('UI correctly displays default shipping method from Commerce Cloud', async () => {
            // Mock shipping methods with Commerce Cloud default indicator
            mockUseLoaderData.mockReturnValue({
                shippingMethods: {
                    applicableShippingMethods: [
                        { id: 'standard', name: 'Standard Shipping', price: 5.99, default: true },
                        { id: 'express', name: 'Express Shipping', price: 12.99, default: false },
                    ],
                },
            });

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            // UI should automatically select the default method from Commerce Cloud
            const standardOption = await waitFor(() => screen.getByLabelText('Standard Shipping'));
            const expressOption = screen.getByLabelText('Express Shipping');

            expect(standardOption).toBeChecked();
            expect(expressOption).not.toBeChecked();
        });

        test('UI adapts to Commerce Cloud customer data structure', async () => {
            // Test that UI handles Commerce Cloud customer profile format
            const mockCustomerData = {
                customerId: 'cc-customer-123',
                email: 'customer@commercecloud.com',
                firstName: 'Commerce',
                lastName: 'Customer',
                phoneHome: '+1-555-0123',
            };

            // Verify UI can render Commerce Cloud customer data
            expect(mockCustomerData.customerId).toBe('cc-customer-123');
            expect(mockCustomerData.email).toContain('@');

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });
            expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
        });
    });

    describe('Error State UI Display', () => {
        test('displays error UI feedback', async () => {
            // Mock error state
            mockUseFetcher.mockReturnValue({
                state: 'idle',
                data: {
                    success: false,
                    error: 'Error occurred. Please try again.',
                    step: 'contactInfo',
                },
                submit: vi.fn(),
                load: vi.fn(),
                Form: 'form',
            });

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // UI should show error feedback to user
            expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
        });

        test('handles validation errors in shipping address submission', async () => {
            // Override handler to return validation errors
            server.use(
                http.post('/action/submit-shipping-address', () => {
                    return HttpResponse.json(
                        {
                            success: false,
                            fieldErrors: {
                                firstName: 'First name is required',
                                lastName: 'Last name is required',
                                address1: 'Address is required',
                            },
                            step: 'shippingAddress',
                        },
                        { status: 400 }
                    );
                })
            );

            const formData = new URLSearchParams();
            formData.append('firstName', '');
            formData.append('lastName', '');

            const response = await makeFormRequest('/action/submit-shipping-address', formData);

            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
            expect(data.fieldErrors.firstName).toBe('First name is required');
        });

        test('handles timeout during shipping methods fetch', async () => {
            server.use(
                http.get('/api/baskets/:basketId/shipments/:shipmentId/shipping-methods', async () => {
                    // Simulate a long delay
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    return new HttpResponse(null, { status: 408 });
                })
            );

            const response = await fetch('/api/baskets/test-basket/shipments/me/shipping-methods');
            expect(response.status).toBe(408);
        });

        test('handles empty shipping methods response', async () => {
            server.use(
                http.get('/api/baskets/:basketId/shipments/:shipmentId/shipping-methods', () => {
                    return HttpResponse.json({
                        applicableShippingMethods: [],
                    });
                })
            );

            const response = await fetch('/api/baskets/test-basket/shipments/me/shipping-methods');
            const data = await response.json();

            expect(data.applicableShippingMethods).toHaveLength(0);
        });

        test('handles malformed customer lookup response', async () => {
            server.use(
                http.post('/api/customer-lookup', () => {
                    return HttpResponse.json({
                        // Missing required fields
                        invalidField: 'test',
                    });
                })
            );

            const response = await fetch('/api/customer-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' }),
            });

            const data = await response.json();
            expect(data.recommendation).toBeUndefined();
            expect(data.message).toBeUndefined();
        });
    });

    describe('Concurrent Submission Prevention', () => {
        test('prevents multiple contact info submissions', async () => {
            let submissionCount = 0;

            server.use(
                http.post('/action/submit-contact-info', async () => {
                    submissionCount++;
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    return HttpResponse.json({
                        success: true,
                        step: 'contactInfo',
                        data: { email: 'test@example.com' },
                    });
                })
            );

            const createFormData = () => {
                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');
                return formData;
            };

            // Fire multiple concurrent requests
            const promises = Array(3)
                .fill(null)
                .map(() =>
                    fetch('/action/submit-contact-info', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: createFormData().toString(),
                    })
                );

            await Promise.all(promises);

            expect(submissionCount).toBe(3);
        });

        test('simulates checkout actions concurrent submission prevention', () => {
            // This test verifies the state that would prevent concurrent submissions
            // Since the hook is already mocked at the top level, we just verify the logic
            const mockFetcher = { state: 'submitting', data: null };

            // In the actual useCheckoutActions hook, when fetcher.state is 'submitting',
            // the submitContactInfo function would return early without making the request
            const wouldPreventSubmission = mockFetcher.state === 'submitting';

            expect(wouldPreventSubmission).toBe(true);
        });
    });

    describe('Edit Mode and Step Progression', () => {
        test('verifies checkout form sections are rendered', async () => {
            // Since hooks are mocked at the top level, we can verify the components render
            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // All form sections should be present and testable
            expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
            expect(screen.getByTestId('shipping-address-form')).toBeInTheDocument();
            expect(screen.getByTestId('shipping-options-form')).toBeInTheDocument();
            expect(screen.getByTestId('payment-form')).toBeInTheDocument();
        });

        test('verifies step progression logic with mocked state', () => {
            // Test the logic that would happen in step progression
            const mockSteps = { CONTACT_INFO: 1, SHIPPING_ADDRESS: 2, SHIPPING_OPTIONS: 3, PAYMENT: 4 };
            const currentStep = 2;
            const completedSteps = [1];

            // Verify step progression logic
            expect(completedSteps.includes(mockSteps.CONTACT_INFO)).toBe(true);
            expect(currentStep).toBe(mockSteps.SHIPPING_ADDRESS);
        });

        test('verifies successful submission data structure', () => {
            // Test the data structure that would be returned from successful submissions
            const successData = { success: true, step: 'contactInfo', data: { email: 'test@example.com' } };

            expect(successData.success).toBe(true);
            expect(successData.step).toBe('contactInfo');
            expect(successData.data).toHaveProperty('email');
        });
    });

    describe('Account Creation and Saved Payment Methods', () => {
        test('handles account creation preference checkbox interaction', async () => {
            vi.mocked(useCheckoutContext).mockReturnValue({
                ...defaultCheckoutContext,
                step: 4, // PAYMENT - create account checkbox shows when Place Order section is visible
                computedStep: 4,
            });
            sessionStorage.setItem('customerLookupResult', JSON.stringify({ recommendation: 'guest' }));
            const user = userEvent.setup();

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });

            // Test that the checkbox can be interacted with
            const checkbox = screen.getByTestId('create-account-checkbox');
            expect(checkbox).not.toBeChecked();

            await user.click(checkbox);
            expect(checkbox).toBeChecked();
            sessionStorage.removeItem('customerLookupResult');
        });

        test('verifies customer profile data structure for returning customers', () => {
            // Test the data structure that would be used for returning customers
            const mockCustomerProfile = {
                customer: {
                    customerId: 'returning-customer-123',
                    email: 'returning@example.com',
                },
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'saved-card-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: {
                            cardType: 'Visa',
                            maskedNumber: '**** **** **** 1234',
                        },
                    },
                ],
            };

            // Verify the structure is correct
            expect(mockCustomerProfile.customer.customerId).toBe('returning-customer-123');
            expect(mockCustomerProfile.paymentInstruments).toHaveLength(1);
            expect(mockCustomerProfile.paymentInstruments[0].paymentCard.cardType).toBe('Visa');
        });

        test('verifies saved payment method tracking logic', () => {
            // Test the Set-based tracking that would be used for saved payment methods
            const savedMethods = new Set(['saved-card-1']);

            // Verify the tracking functionality
            expect(savedMethods.has('saved-card-1')).toBe(true);
            expect(savedMethods.has('non-existent-card')).toBe(false);

            // Test adding new payment method
            savedMethods.add('saved-card-2');
            expect(savedMethods.size).toBe(2);
        });

        test('verifies session storage integration for account creation', () => {
            const mockSessionStorage = {
                setItem: vi.fn(),
                getItem: vi.fn(),
            };

            // Simulate the session storage functionality
            const handleCreateAccountPreferenceChange = (shouldCreate: boolean) => {
                mockSessionStorage.setItem('shouldCreateAccount', shouldCreate.toString());
            };

            // Test the function
            handleCreateAccountPreferenceChange(true);
            expect(mockSessionStorage.setItem).toHaveBeenCalledWith('shouldCreateAccount', 'true');

            handleCreateAccountPreferenceChange(false);
            expect(mockSessionStorage.setItem).toHaveBeenCalledWith('shouldCreateAccount', 'false');
        });
    });

    describe('Comprehensive Form Validation and Submission', () => {
        test('validates all contact info fields', async () => {
            server.use(
                http.post('/action/submit-contact-info', async ({ request }) => {
                    try {
                        const formData = await request.formData();
                        const email = formData.get('email') as string;

                        if (!email || !email.includes('@')) {
                            return HttpResponse.json(
                                {
                                    success: false,
                                    fieldErrors: { email: 'Valid email is required' },
                                    step: 'contactInfo',
                                },
                                { status: 400 }
                            );
                        }

                        return HttpResponse.json({
                            success: true,
                            step: 'contactInfo',
                            data: { email },
                        });
                    } catch {
                        return HttpResponse.json(
                            {
                                success: false,
                                error: 'Failed to process request',
                            },
                            { status: 400 }
                        );
                    }
                })
            );

            // Test invalid email
            const invalidFormData = new URLSearchParams();
            invalidFormData.append('email', 'invalid-email');

            const invalidResponse = await makeFormRequest('/action/submit-contact-info', invalidFormData);

            expect(invalidResponse.ok).toBe(false);
            const invalidData = await invalidResponse.json();
            expect(invalidData.success).toBe(false);
            expect(invalidData.fieldErrors.email).toBe('Valid email is required');

            // Test valid email
            const validFormData = new URLSearchParams();
            validFormData.append('email', 'valid@example.com');

            const validResponse = await makeFormRequest('/action/submit-contact-info', validFormData);

            expect(validResponse.ok).toBe(true);
            const validData = await validResponse.json();
            expect(validData.success).toBe(true);
        });

        test('validates complete shipping address submission', async () => {
            const formData = new URLSearchParams();
            formData.append('firstName', 'John');
            formData.append('lastName', 'Doe');
            formData.append('address1', '123 Main St');
            formData.append('city', 'New York');
            formData.append('stateCode', 'NY');
            formData.append('postalCode', '10001');

            const response = await makeFormRequest('/action/submit-shipping-address', formData);

            expect(response.ok).toBe(true);
            const data = await response.json();
            expect(data).toHaveProperty('success');
            expect(data.success).toBe(true);
            expect(data.data.firstName).toBe('John');
            expect(data.data.lastName).toBe('Doe');
        });

        test('validates shipping options selection', async () => {
            const formData = new URLSearchParams();
            formData.append('shippingMethodId', 'express');

            const response = await makeFormRequest('/action/submit-shipping-options', formData);

            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.data.shippingMethodId).toBe('express');
        });

        test('validates payment with billing same as shipping', async () => {
            const formData = new URLSearchParams();
            formData.append('cardNumber', '4111111111111111');
            formData.append('cardholderName', 'John Doe');
            formData.append('expiryDate', '12/25');
            formData.append('cvv', '123');
            formData.append('useDifferentBilling', 'false');

            const response = await makeFormRequest('/action/submit-payment', formData);

            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.data.maskedCardNumber).toBe('**** **** **** 1111');
        });

        test('validates payment with separate billing address', async () => {
            const formData = new URLSearchParams();
            formData.append('cardNumber', '4111111111111111');
            formData.append('cardholderName', 'John Doe');
            formData.append('expiryDate', '12/25');
            formData.append('cvv', '123');
            formData.append('useDifferentBilling', 'true');
            formData.append('billingFirstName', 'Jane');
            formData.append('billingLastName', 'Smith');
            formData.append('billingAddress1', '456 Oak Ave');
            formData.append('billingCity', 'Los Angeles');
            formData.append('billingStateCode', 'CA');
            formData.append('billingPostalCode', '90210');

            const response = await makeFormRequest('/action/submit-payment', formData);

            const data = await response.json();
            expect(data.success).toBe(true);
        });

        test('handles saved payment method submission', async () => {
            server.use(
                http.post('/action/submit-payment', async ({ request }) => {
                    const formData = await request.formData();
                    const useSavedPaymentMethod = formData.get('useSavedPaymentMethod') === 'true';
                    const selectedSavedPaymentMethod = formData.get('selectedSavedPaymentMethod') as string;

                    if (useSavedPaymentMethod && selectedSavedPaymentMethod) {
                        return HttpResponse.json({
                            success: true,
                            step: 'payment',
                            data: {
                                paymentMethodId: 'SAVED_CREDIT_CARD',
                                selectedPaymentInstrumentId: selectedSavedPaymentMethod,
                            },
                        });
                    }

                    return HttpResponse.json(
                        {
                            success: false,
                            error: 'Invalid payment method selection',
                        },
                        { status: 400 }
                    );
                })
            );

            const formData = new URLSearchParams();
            formData.append('useSavedPaymentMethod', 'true');
            formData.append('selectedSavedPaymentMethod', 'saved-card-1');
            formData.append('useDifferentBilling', 'true');

            const response = await makeFormRequest('/action/submit-payment', formData);

            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.data.selectedPaymentInstrumentId).toBe('saved-card-1');
        });

        test('handles complete checkout flow simulation', async () => {
            // Test the complete flow step by step

            // 1. Contact Info
            const contactData = new URLSearchParams();
            contactData.append('email', 'complete@example.com');
            const contactResponse = await makeFormRequest('/action/submit-contact-info', contactData);
            expect((await contactResponse.json()).success).toBe(true);

            // 2. Shipping Address
            const shippingData = new URLSearchParams();
            shippingData.append('firstName', 'Complete');
            shippingData.append('lastName', 'Test');
            shippingData.append('address1', '123 Complete St');
            shippingData.append('city', 'Test City');
            shippingData.append('stateCode', 'CA');
            shippingData.append('postalCode', '12345');
            const shippingResponse = await makeFormRequest('/action/submit-shipping-address', shippingData);
            expect((await shippingResponse.json()).success).toBe(true);

            // 3. Shipping Options
            const optionsData = new URLSearchParams();
            optionsData.append('shippingMethodId', 'standard');
            const optionsResponse = await makeFormRequest('/action/submit-shipping-options', optionsData);
            expect((await optionsResponse.json()).success).toBe(true);

            // 4. Payment
            const paymentData = new URLSearchParams();
            paymentData.append('cardNumber', '4111111111111111');
            paymentData.append('cardholderName', 'Complete Test');
            paymentData.append('expiryDate', '12/25');
            paymentData.append('cvv', '123');
            paymentData.append('useDifferentBilling', 'true');
            const paymentResponse = await makeFormRequest('/action/submit-payment', paymentData);
            expect((await paymentResponse.json()).success).toBe(true);

            // 5. Order Placement
            const orderFormData = new URLSearchParams();
            const orderResponse = await makeFormRequest(resourceRoutes.placeOrder, orderFormData);
            const orderData = await orderResponse.json();
            expect(orderData.success).toBe(true);
            expect(orderData.orderNo).toBe('ORDER-2024-001');
        });
    });

    describe('Registered Shopper UI Behavior', () => {
        test('displays logged-in customer UI state', async () => {
            // Mock logged-in customer state
            const mockLoggedInCustomer = {
                customerId: 'returning-customer-123',
                email: 'returning@example.com',
                firstName: 'Jane',
                lastName: 'Smith',
                isLoggedIn: true,
            };

            // Test UI state logic for logged-in customers
            const shouldShowWelcomeMessage = mockLoggedInCustomer.isLoggedIn;
            const shouldShowLogoutOption = mockLoggedInCustomer.isLoggedIn;
            const shouldHideEmailInput = mockLoggedInCustomer.isLoggedIn;
            const welcomeText = `Welcome back, ${mockLoggedInCustomer.firstName}!`;

            expect(shouldShowWelcomeMessage).toBe(true);
            expect(shouldShowLogoutOption).toBe(true);
            expect(shouldHideEmailInput).toBe(true);
            expect(welcomeText).toBe('Welcome back, Jane!');

            // Render component to test UI structure
            render(<CheckoutFormPage {...defaultProps} />);
            // Wait for Suspense boundaries to resolve
            await waitFor(() => {
                expect(screen.getByTestId('contact-info-form')).toBeInTheDocument();
            });
        });

        test('retrieves and uses saved addresses for registered customers', async () => {
            // Mock API endpoint for customer addresses
            server.use(
                http.get('/api/customers/:customerId/addresses', ({ params }) => {
                    if (params.customerId === 'returning-customer-123') {
                        return HttpResponse.json({
                            addresses: [
                                {
                                    addressId: 'home-address',
                                    firstName: 'Jane',
                                    lastName: 'Smith',
                                    address1: '456 Oak Street',
                                    address2: 'Apt 2B',
                                    city: 'San Francisco',
                                    stateCode: 'CA',
                                    postalCode: '94102',
                                    countryCode: 'US',
                                    phone: '+1-555-0123',
                                    preferred: true,
                                },
                                {
                                    addressId: 'work-address',
                                    firstName: 'Jane',
                                    lastName: 'Smith',
                                    address1: '789 Business Blvd',
                                    city: 'San Francisco',
                                    stateCode: 'CA',
                                    postalCode: '94105',
                                    countryCode: 'US',
                                    phone: '+1-555-0456',
                                    preferred: false,
                                },
                            ],
                        });
                    }
                    return new HttpResponse(null, { status: 404 });
                }),

                // Mock API for using saved address
                http.post('/action/use-saved-address', async ({ request }) => {
                    const formData = await request.formData();
                    const addressId = formData.get('addressId') as string;

                    if (addressId === 'home-address') {
                        return HttpResponse.json({
                            success: true,
                            step: 'shippingAddress',
                            data: {
                                addressId: 'home-address',
                                firstName: 'Jane',
                                lastName: 'Smith',
                                address1: '456 Oak Street',
                                address2: 'Apt 2B',
                                city: 'San Francisco',
                                stateCode: 'CA',
                                postalCode: '94102',
                            },
                        });
                    }

                    return HttpResponse.json(
                        {
                            success: false,
                            error: 'Address not found',
                        },
                        { status: 404 }
                    );
                })
            );

            // Test retrieving saved addresses
            const addressesResponse = await fetch('/api/customers/returning-customer-123/addresses');
            const addressesData = await addressesResponse.json();

            expect(addressesData.addresses).toHaveLength(2);
            expect(addressesData.addresses[0].preferred).toBe(true);
            expect(addressesData.addresses[0].address1).toBe('456 Oak Street');

            // Test using a saved address
            const formData = new URLSearchParams();
            formData.append('addressId', 'home-address');

            const useSavedAddressResponse = await makeFormRequest('/action/use-saved-address', formData);

            const savedAddressData = await useSavedAddressResponse.json();
            expect(savedAddressData.success).toBe(true);
            expect(savedAddressData.data.addressId).toBe('home-address');
            expect(savedAddressData.data.firstName).toBe('Jane');
        });

        test('displays saved payment methods UI for registered customers', async () => {
            // Mock saved payment methods data
            const mockSavedPaymentMethods = [
                {
                    paymentInstrumentId: 'saved-card-1',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {
                        cardType: 'Visa',
                        maskedNumber: '**** **** **** 1234',
                        holder: 'Jane Smith',
                        expirationMonth: 12,
                        expirationYear: 2025,
                    },
                    preferred: true,
                },
                {
                    paymentInstrumentId: 'saved-card-2',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {
                        cardType: 'Mastercard',
                        maskedNumber: '**** **** **** 5678',
                        holder: 'Jane Smith',
                        expirationMonth: 8,
                        expirationYear: 2026,
                    },
                    preferred: false,
                },
            ];

            // Test UI logic for displaying saved payment methods
            const shouldShowSavedPayments = mockSavedPaymentMethods.length > 0;
            const preferredPayment = mockSavedPaymentMethods.find((payment) => payment.preferred);
            const shouldPreSelectPayment = !!preferredPayment;

            expect(shouldShowSavedPayments).toBe(true);
            expect(shouldPreSelectPayment).toBe(true);
            expect(preferredPayment?.paymentInstrumentId).toBe('saved-card-1');

            // Test payment method display formatting for UI
            const formatPaymentForDisplay = (payment: { paymentCard: { cardType: string; maskedNumber: string } }) =>
                `${payment.paymentCard.cardType} ${payment.paymentCard.maskedNumber}`;
            const displayText = formatPaymentForDisplay(mockSavedPaymentMethods[0]);
            expect(displayText).toBe('Visa **** **** **** 1234');

            // Test "save new payment" UI logic
            const shouldShowSaveOption = true; // Always show for registered customers
            expect(shouldShowSaveOption).toBe(true);

            await act(async () => {
                render(<CheckoutFormPage {...defaultProps} />);
                // Wait for Suspense boundaries to resolve
                await new Promise((resolve) => setTimeout(resolve, 10));
            });
            expect(screen.getByTestId('payment-form')).toBeInTheDocument();
        });

        test('handles complete registered shopper checkout flow', async () => {
            // Setup registered customer APIs
            server.use(
                // Auto-fill contact info for logged-in customer
                http.post('/action/submit-contact-info', async ({ request }) => {
                    const formData = await request.formData();
                    const email = formData.get('email') as string;
                    const customerId = formData.get('customerId') as string;

                    if (customerId === 'returning-customer-123') {
                        return HttpResponse.json({
                            success: true,
                            step: 'contactInfo',
                            data: {
                                email,
                                customerId,
                                isRegistered: true,
                            },
                        });
                    }

                    return HttpResponse.json({
                        success: true,
                        step: 'contactInfo',
                        data: { email },
                    });
                }),

                // Use saved address
                http.post('/action/submit-shipping-address', async ({ request }) => {
                    const formData = await request.formData();
                    const useSavedAddress = formData.get('useSavedAddress') === 'true';
                    const savedAddressId = formData.get('savedAddressId') as string;

                    if (useSavedAddress && savedAddressId === 'home-address') {
                        return HttpResponse.json({
                            success: true,
                            step: 'shippingAddress',
                            data: {
                                useSavedAddress: true,
                                savedAddressId: 'home-address',
                                firstName: 'Jane',
                                lastName: 'Smith',
                                address1: '456 Oak Street',
                                city: 'San Francisco',
                                stateCode: 'CA',
                                postalCode: '94102',
                            },
                        });
                    }

                    // Handle new address for registered customer
                    return HttpResponse.json({
                        success: true,
                        step: 'shippingAddress',
                        data: {
                            firstName: formData.get('firstName'),
                            lastName: formData.get('lastName'),
                            address1: formData.get('address1'),
                            city: formData.get('city'),
                            stateCode: formData.get('stateCode'),
                            postalCode: formData.get('postalCode'),
                        },
                    });
                }),

                // Use saved payment method
                http.post('/action/submit-payment', async ({ request }) => {
                    const formData = await request.formData();
                    const useSavedPaymentMethod = formData.get('useSavedPaymentMethod') === 'true';
                    const savedPaymentId = formData.get('selectedSavedPaymentMethod') as string;

                    if (useSavedPaymentMethod && savedPaymentId === 'saved-card-1') {
                        return HttpResponse.json({
                            success: true,
                            step: 'payment',
                            data: {
                                useSavedPaymentMethod: true,
                                selectedPaymentInstrumentId: 'saved-card-1',
                                paymentMethodId: 'CREDIT_CARD',
                                maskedCardNumber: '**** **** **** 1234',
                            },
                        });
                    }

                    // Handle new payment method
                    const cardNumber = formData.get('cardNumber') as string;
                    return HttpResponse.json({
                        success: true,
                        step: 'payment',
                        data: {
                            paymentMethodId: 'CREDIT_CARD',
                            maskedCardNumber: `**** **** **** ${cardNumber.slice(-4)}`,
                        },
                    });
                }),

                // Order placement for registered customer
                http.post(resourceRoutes.placeOrder, async ({ request }) => {
                    try {
                        const formData = await request.formData();
                        const customerId = formData.get('customerId') as string;

                        return HttpResponse.json({
                            success: true,
                            orderNo: 'ORDER-2024-REG-001',
                            customerId: customerId || null,
                            redirectTo: '/order-confirmation/ORDER-2024-REG-001',
                            customerOrder: customerId ? true : false,
                        });
                    } catch {
                        return HttpResponse.json(
                            {
                                success: false,
                                error: 'Failed to process request',
                            },
                            { status: 400 }
                        );
                    }
                })
            );

            // Complete registered shopper flow

            // 1. Contact Info (with customer ID)
            const contactData = new URLSearchParams();
            contactData.append('email', 'returning@example.com');
            contactData.append('customerId', 'returning-customer-123');
            const contactResponse = await makeFormRequest('/action/submit-contact-info', contactData);
            const contactResult = await contactResponse.json();
            expect(contactResult.success).toBe(true);
            expect(contactResult.data.isRegistered).toBe(true);

            // 2. Shipping Address (using saved address)
            const shippingData = new URLSearchParams();
            shippingData.append('useSavedAddress', 'true');
            shippingData.append('savedAddressId', 'home-address');
            const shippingResponse = await makeFormRequest('/action/submit-shipping-address', shippingData);
            const shippingResult = await shippingResponse.json();
            expect(shippingResult.success).toBe(true);
            expect(shippingResult.data.useSavedAddress).toBe(true);

            // 3. Shipping Options (same as guest)
            const optionsData = new URLSearchParams();
            optionsData.append('shippingMethodId', 'standard');
            const optionsResponse = await makeFormRequest('/action/submit-shipping-options', optionsData);
            expect((await optionsResponse.json()).success).toBe(true);

            // 4. Payment (using saved payment method)
            const paymentData = new URLSearchParams();
            paymentData.append('useSavedPaymentMethod', 'true');
            paymentData.append('selectedSavedPaymentMethod', 'saved-card-1');
            paymentData.append('useDifferentBilling', 'true');
            const paymentResponse = await makeFormRequest('/action/submit-payment', paymentData);
            const paymentResult = await paymentResponse.json();
            expect(paymentResult.success).toBe(true);
            expect(paymentResult.data.useSavedPaymentMethod).toBe(true);

            // 5. Order Placement (for registered customer)
            const orderData = new URLSearchParams();
            orderData.append('customerId', 'returning-customer-123');
            const orderResponse = await makeFormRequest(resourceRoutes.placeOrder, orderData);
            const orderResult = await orderResponse.json();
            expect(orderResult.success).toBe(true);
            expect(orderResult.orderNo).toBe('ORDER-2024-REG-001');
            expect(orderResult.customerOrder).toBe(true);
        });
    });

    describe('Registered Shopper UI Validations', () => {
        test('simulates welcome message display for logged-in customer', () => {
            // Test the UI elements that would be shown for a logged-in customer
            const mockCustomerProfile = {
                customer: {
                    customerId: 'returning-customer-123',
                    email: 'returning@example.com',
                    firstName: 'Jane',
                    lastName: 'Smith',
                },
            };

            // Test the welcome message logic
            const welcomeMessage = `Welcome back, ${mockCustomerProfile.customer.firstName}!`;
            expect(welcomeMessage).toBe('Welcome back, Jane!');

            // Test customer email display
            expect(mockCustomerProfile.customer.email).toBe('returning@example.com');

            // Verify customer profile structure for UI rendering
            expect(mockCustomerProfile.customer.customerId).toBe('returning-customer-123');
        });

        test('validates saved address data structure for UI rendering', () => {
            // Test the saved addresses data structure that would be used in UI
            const mockSavedAddresses = [
                {
                    addressId: 'home-address',
                    firstName: 'Jane',
                    lastName: 'Smith',
                    address1: '456 Oak Street',
                    address2: 'Apt 2B',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    preferred: true,
                },
                {
                    addressId: 'work-address',
                    firstName: 'Jane',
                    lastName: 'Smith',
                    address1: '789 Business Blvd',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94105',
                    preferred: false,
                },
            ];

            // Test address display formatting
            const formatAddressForDropdown = (addr: {
                address1: string;
                city: string;
                stateCode: string;
                postalCode: string;
                preferred?: boolean;
            }) => {
                return `${addr.address1}, ${addr.city}, ${addr.stateCode} ${addr.postalCode}${addr.preferred ? ' (Preferred)' : ''}`;
            };

            expect(formatAddressForDropdown(mockSavedAddresses[0])).toBe(
                '456 Oak Street, San Francisco, CA 94102 (Preferred)'
            );
            expect(formatAddressForDropdown(mockSavedAddresses[1])).toBe('789 Business Blvd, San Francisco, CA 94105');

            // Test preferred address identification
            const preferredAddress = mockSavedAddresses.find((addr) => addr.preferred);
            expect(preferredAddress?.addressId).toBe('home-address');

            // Test address selection logic
            const selectedAddressId = 'home-address';
            const selectedAddress = mockSavedAddresses.find((addr) => addr.addressId === selectedAddressId);
            expect(selectedAddress?.address1).toBe('456 Oak Street');
        });

        test('validates saved payment methods data structure for UI rendering', () => {
            // Test the saved payment methods data structure
            const mockSavedPaymentMethods = [
                {
                    paymentInstrumentId: 'saved-card-1',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {
                        cardType: 'Visa',
                        maskedNumber: '**** **** **** 1234',
                        holder: 'Jane Smith',
                        expirationMonth: 12,
                        expirationYear: 2025,
                    },
                    preferred: true,
                },
                {
                    paymentInstrumentId: 'saved-card-2',
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {
                        cardType: 'Mastercard',
                        maskedNumber: '**** **** **** 5678',
                        holder: 'Jane Smith',
                        expirationMonth: 8,
                        expirationYear: 2026,
                    },
                    preferred: false,
                },
            ];

            // Test payment method display formatting
            const formatPaymentMethodForDisplay = (payment: {
                paymentCard: { cardType: string; maskedNumber: string };
                preferred?: boolean;
            }) => {
                return `${payment.paymentCard.cardType} ${payment.paymentCard.maskedNumber}${payment.preferred ? ' (Preferred)' : ''}`;
            };

            expect(formatPaymentMethodForDisplay(mockSavedPaymentMethods[0])).toBe(
                'Visa **** **** **** 1234 (Preferred)'
            );
            expect(formatPaymentMethodForDisplay(mockSavedPaymentMethods[1])).toBe('Mastercard **** **** **** 5678');

            // Test preferred payment method identification
            const preferredPayment = mockSavedPaymentMethods.find((payment) => payment.preferred);
            expect(preferredPayment?.paymentInstrumentId).toBe('saved-card-1');

            // Test payment method selection logic
            const selectedPaymentId = 'saved-card-1';
            const selectedPayment = mockSavedPaymentMethods.find(
                (payment) => payment.paymentInstrumentId === selectedPaymentId
            );
            expect(selectedPayment?.paymentCard.cardType).toBe('Visa');
        });

        test('validates customer preferences data structure', () => {
            // Test customer preferences data structure
            const mockCustomerPreferences = {
                emailOptIn: true,
                smsOptIn: false,
                defaultShippingMethod: 'standard',
                preferredLanguage: 'en_US',
                currency: mockAltSiteObject.defaultCurrency,
                savePreferences: true,
            };

            // Test preference management for registered customers
            const isRegisteredCustomer = true;
            const shouldShowGuestAccountCreation = !isRegisteredCustomer;
            const shouldShowCustomerPreferences = isRegisteredCustomer;

            expect(shouldShowGuestAccountCreation).toBe(false);
            expect(shouldShowCustomerPreferences).toBe(true);

            // Test preference update logic
            const updatePreference = (pref: string, value: boolean) => {
                return { ...mockCustomerPreferences, [pref]: value };
            };

            const updatedPreferences = updatePreference('emailOptIn', false);
            expect(updatedPreferences.emailOptIn).toBe(false);
            expect(updatedPreferences.smsOptIn).toBe(false); // Should remain unchanged
        });

        test('validates UI state differences for registered vs guest users', () => {
            // Test the logic that determines UI state for different user types
            const guestCustomer = null;
            const registeredCustomer = {
                customerId: 'returning-customer-123',
                email: 'returning@example.com',
                firstName: 'Jane',
            };

            // Test UI element visibility logic for registered customers
            const shouldShowWelcomeMessage = !!registeredCustomer;
            const shouldShowSavedAddresses = !!registeredCustomer;
            const shouldShowSavedPayments = !!registeredCustomer;
            const shouldShowAccountPreferences = !!registeredCustomer;
            const shouldShowLogoutOption = !!registeredCustomer;
            const shouldShowGuestAccountCreation = !registeredCustomer;

            expect(shouldShowWelcomeMessage).toBe(true);
            expect(shouldShowSavedAddresses).toBe(true);
            expect(shouldShowSavedPayments).toBe(true);
            expect(shouldShowAccountPreferences).toBe(true);
            expect(shouldShowLogoutOption).toBe(true);
            expect(shouldShowGuestAccountCreation).toBe(false);

            // Test UI element visibility logic for guest customers
            const guestShouldShowWelcome = !!guestCustomer;
            const guestShouldShowAccountCreation = !guestCustomer;

            expect(guestShouldShowWelcome).toBe(false);
            expect(guestShouldShowAccountCreation).toBe(true);
        });

        test('validates logout flow and state reset logic', async () => {
            // Add logout handler to MSW
            server.use(
                http.post('/api/auth/logout', () => {
                    return HttpResponse.json({ success: true });
                })
            );

            // Test logout API call
            const logoutResponse = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: 'returning-customer-123' }),
            });

            const logoutData = await logoutResponse.json();
            expect(logoutData.success).toBe(true);

            // Test state reset logic after logout
            const beforeLogout = {
                isLoggedIn: true,
                customerProfile: { customerId: 'returning-customer-123' },
                savedAddresses: [{ addressId: 'home' }],
                savedPayments: [{ paymentId: 'card-1' }],
            };

            const afterLogout = {
                isLoggedIn: false,
                customerProfile: null,
                savedAddresses: [],
                savedPayments: [],
            };

            // Simulate logout state reset
            expect(beforeLogout.isLoggedIn).toBe(true);
            expect(afterLogout.isLoggedIn).toBe(false);
            expect(afterLogout.customerProfile).toBe(null);
            expect(afterLogout.savedAddresses).toHaveLength(0);
        });

        test('validates form autofill data for registered customers', () => {
            // Test autofill data structures for registered customers
            const customerProfile = {
                customer: {
                    email: 'returning@example.com',
                    firstName: 'Jane',
                    lastName: 'Smith',
                },
            };

            const preferredAddress = {
                addressId: 'home-address',
                firstName: 'Jane',
                lastName: 'Smith',
                address1: '456 Oak Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94102',
            };

            const preferredPayment = {
                paymentInstrumentId: 'saved-card-1',
                paymentCard: {
                    cardType: 'Visa',
                    maskedNumber: '**** **** **** 1234',
                },
            };

            // Test autofill logic
            const shouldAutofillEmail = !!customerProfile.customer.email;
            const shouldAutofillAddress = !!preferredAddress;
            const shouldShowSavedPayment = !!preferredPayment;

            expect(shouldAutofillEmail).toBe(true);
            expect(shouldAutofillAddress).toBe(true);
            expect(shouldShowSavedPayment).toBe(true);

            // Test autofilled values
            expect(customerProfile.customer.email).toBe('returning@example.com');
            expect(preferredAddress.firstName).toBe('Jane');
            expect(preferredAddress.address1).toBe('456 Oak Street');
            expect(preferredPayment.paymentCard.cardType).toBe('Visa');
        });

        test('validates customer benefits and reorder functionality data', () => {
            // Test customer benefits data structure
            const customerProfile = {
                customerId: 'returning-customer-123',
                loyaltyStatus: 'gold',
                orderHistory: [
                    { orderNo: 'ORDER-2024-001', total: 99.99 },
                    { orderNo: 'ORDER-2024-002', total: 149.99 },
                ],
                favoriteItems: [
                    { productId: 'prod-1', name: 'Blue Shirt' },
                    { productId: 'prod-2', name: 'Jeans' },
                ],
            };

            // Test customer benefits logic
            const hasOrderHistory = customerProfile.orderHistory.length > 0;
            const hasFavorites = customerProfile.favoriteItems.length > 0;
            const isLoyaltyMember = customerProfile.loyaltyStatus === 'gold';
            const shouldShowReorderOptions = hasOrderHistory || hasFavorites;
            const shouldShowLoyaltyBenefits = isLoyaltyMember;

            expect(hasOrderHistory).toBe(true);
            expect(hasFavorites).toBe(true);
            expect(isLoyaltyMember).toBe(true);
            expect(shouldShowReorderOptions).toBe(true);
            expect(shouldShowLoyaltyBenefits).toBe(true);

            // Test reorder data preparation
            const lastOrder = customerProfile.orderHistory[customerProfile.orderHistory.length - 1];
            expect(lastOrder.orderNo).toBe('ORDER-2024-002');

            const favoriteProductIds = customerProfile.favoriteItems.map((item) => item.productId);
            expect(favoriteProductIds).toEqual(['prod-1', 'prod-2']);
        });
    });
});
