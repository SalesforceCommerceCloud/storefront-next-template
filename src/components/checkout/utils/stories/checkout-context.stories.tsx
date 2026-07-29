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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import CheckoutProvider from '../checkout-context';
import { action } from 'storybook/actions';
import { useEffect, useMemo, useRef, useContext, type ReactNode, type ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { CheckoutContext, type CustomerProfile } from '../checkout-context-types';
import { Button } from '@/components/ui/button';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';
import BasketProvider from '@/providers/basket';

// Consumer component that displays context state and navigation controls
function CheckoutContextConsumer({
    showPinControls = false,
    hideNavControls = false,
}: {
    showPinControls?: boolean;
    hideNavControls?: boolean;
}) {
    const context = useContext(CheckoutContext);

    if (!context) {
        return <div>No checkout context available</div>;
    }

    const {
        step,
        computedStep,
        editingStep,
        STEPS,
        shipmentDistribution,
        goToNextStep,
        goToStep,
        exitEditMode,
        pinToStep,
    } = context;

    const stepNames = {
        [STEPS.CONTACT_INFO]: 'Contact Info',
        [STEPS.PICKUP]: 'Pickup',
        [STEPS.SHIPPING_ADDRESS]: 'Shipping Address',
        [STEPS.SHIPPING_OPTIONS]: 'Shipping Method',
        [STEPS.PAYMENT]: 'Payment',
        [STEPS.PLACE_ORDER]: 'Place Order',
    };

    return (
        <div className="space-y-4 p-6 border rounded">
            <div>
                <h3 className="text-sm font-semibold mb-2">Checkout Context State</h3>
                <div className="space-y-2 text-sm">
                    <div data-testid="active-step">
                        <strong>Active Step:</strong>{' '}
                        {stepNames[editingStep !== null && editingStep !== undefined ? editingStep : step]} (
                        {editingStep !== null && editingStep !== undefined ? editingStep : step})
                        <span className="ml-2 text-muted-foreground text-xs">
                            (editingStep ?? step — what&apos;s visible to the shopper)
                        </span>
                    </div>
                    <div data-testid="current-step">
                        <strong>Basket Step (step):</strong> {stepNames[step]} ({step})
                        <span className="ml-2 text-muted-foreground text-xs">
                            (basket-derived, frozen while editing)
                        </span>
                    </div>
                    <div data-testid="computed-step">
                        <strong>Computed Step:</strong> {stepNames[computedStep]} ({computedStep})
                        <span className="ml-2 text-muted-foreground text-xs">(furthest step with basket data)</span>
                    </div>
                    <div data-testid="editing-step">
                        <strong>Editing Step:</strong>{' '}
                        {editingStep !== null && editingStep !== undefined ? stepNames[editingStep] : 'None'} (
                        {editingStep !== null && editingStep !== undefined ? editingStep : 'null'})
                    </div>
                    <div data-testid="has-delivery-items">
                        <strong>Has Delivery Items:</strong> {String(shipmentDistribution.hasDeliveryItems)}
                    </div>
                </div>
            </div>
            <div className="flex gap-2 flex-wrap">
                {!hideNavControls && (
                    <>
                        <Button onClick={goToNextStep} size="sm">
                            Go to Next Step
                        </Button>
                        <Button onClick={() => goToStep(STEPS.CONTACT_INFO)} size="sm" variant="outline">
                            Go to Contact Info
                        </Button>
                        {!shipmentDistribution.hasDeliveryItems && (
                            <Button onClick={() => goToStep(STEPS.PICKUP)} size="sm" variant="outline">
                                Go to Pickup
                            </Button>
                        )}
                        {shipmentDistribution.hasDeliveryItems && (
                            <>
                                <Button onClick={() => goToStep(STEPS.SHIPPING_ADDRESS)} size="sm" variant="outline">
                                    Go to Shipping Address
                                </Button>
                                <Button onClick={() => goToStep(STEPS.SHIPPING_OPTIONS)} size="sm" variant="outline">
                                    Go to Shipping Method
                                </Button>
                            </>
                        )}
                        <Button onClick={() => goToStep(STEPS.PAYMENT)} size="sm" variant="outline">
                            Go to Payment
                        </Button>
                        <Button onClick={() => goToStep(STEPS.PLACE_ORDER)} size="sm" variant="outline">
                            Go to Place Order
                        </Button>
                        <Button onClick={exitEditMode} size="sm" variant="outline">
                            Exit Edit Mode
                        </Button>
                    </>
                )}
                {showPinControls && pinToStep && (
                    <>
                        <Button onClick={() => pinToStep(STEPS.CONTACT_INFO)} size="sm" variant="secondary">
                            Pin to Contact Info
                        </Button>
                        <Button onClick={() => pinToStep(STEPS.PICKUP)} size="sm" variant="secondary">
                            Pin to Pickup
                        </Button>
                        <Button onClick={() => pinToStep(STEPS.SHIPPING_ADDRESS)} size="sm" variant="secondary">
                            Pin to Shipping Address
                        </Button>
                        <Button onClick={() => pinToStep(STEPS.SHIPPING_OPTIONS)} size="sm" variant="secondary">
                            Pin to Shipping Method
                        </Button>
                        <Button onClick={() => pinToStep(STEPS.PAYMENT)} size="sm" variant="secondary">
                            Pin to Payment
                        </Button>
                        <Button onClick={() => pinToStep(STEPS.PLACE_ORDER)} size="sm" variant="secondary">
                            Pin to Place Order
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

const CHECKOUT_CONTEXT_HARNESS_ATTR = 'data-checkout-context-harness';

function CheckoutContextStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const logNextStep = useMemo(() => action('checkout-next-step'), []);
    const logGoToStep = useMemo(() => action('checkout-go-to-step'), []);
    const logExitEdit = useMemo(() => action('checkout-exit-edit'), []);

    useEffect(() => {
        const isInsideHarness = (element: Element | null) =>
            Boolean(element?.closest(`[${CHECKOUT_CONTEXT_HARNESS_ATTR}]`));

        const handleClick = (event: MouseEvent) => {
            if (!event.isTrusted) return;
            const button = (event.target as HTMLElement | null)?.closest('button');
            if (!button || !(button instanceof HTMLButtonElement) || !isInsideHarness(button)) return;

            const buttonText = button.textContent?.trim() || '';
            if (buttonText.includes('Next Step')) {
                logNextStep({ buttonText });
            } else if (buttonText.includes('Go to')) {
                logGoToStep({ buttonText });
            } else if (buttonText.includes('Exit Edit')) {
                logExitEdit({ buttonText });
            }
        };

        document.addEventListener('click', handleClick, true);
        return () => {
            document.removeEventListener('click', handleClick, true);
        };
    }, [logNextStep, logGoToStep, logExitEdit]);

    return (
        <div
            ref={containerRef}
            {...{ [CHECKOUT_CONTEXT_HARNESS_ATTR]: 'true' }}
            className="w-full max-w-4xl mx-auto p-6">
            {children}
        </div>
    );
}

const meta: Meta<typeof CheckoutProvider> = {
    title: 'Checkout/Context',
    component: CheckoutProvider,
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
\`CheckoutProvider\` is a React context provider that manages the entire checkout flow state. It tracks the current and computed step, which step is being edited, and exposes navigation functions consumed by each checkout step component via \`useCheckoutContext()\`.

## Step order

**Pickup-only basket:** Contact Info → Pickup → Payment → Place Order

**With delivery items (and pickup):** Contact Info → Pickup → Shipping Address → Shipping Method → Payment → Place Order

## Key concepts

- **Active Step** — \`editingStep ?? step\` — what the shopper actually sees. This is the value checkout step components consume to decide whether to render their edit or summary view. It is not a context field; it is derived at the point of use.
- **\`step\`** — basket-derived current step. Frozen while \`editingStep\` is non-null.
- **\`computedStep\`** — the furthest step the basket data supports advancing to.
- **\`editingStep\`** — non-null when the shopper has manually jumped to a step to edit it. Overrides \`step\` to produce the Active Step. Set by \`goToStep\` and \`pinToStep\`; cleared by \`exitEditMode\`.
- **Guest vs. returning customer** — for guest users, once \`isActiveCheckoutFlow\` is true the provider uses sequential progression instead of basket-derived auto-advance; returning customers always benefit from auto-population

## Navigation functions

| Function | Description |
|----------|-------------|
| \`goToNextStep()\` | Advance to the next step in order. **In Storybook**, the basket is static so \`currentStep\` stays frozen at Contact Info (0) — clicking this button will only ever advance to Pickup (1). Use \`goToStep()\` to jump to any step directly. |
| \`goToStep(step)\` | Jump to a specific step |
| \`exitEditMode()\` | Leave edit mode and advance to the best next step. **In Storybook**, the basket is static so \`computedStep\` is always Contact Info (0) — Exit Edit Mode will set Editing Step to Contact Info rather than null. In a real checkout with basket data, it advances to the furthest completed step. |
| \`pinToStep(step)\` | Force the shopper to a specific step, overriding basket-driven auto-advance |
                `,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    argTypes: {
        children: { table: { disable: true } },
        shippingDefaultSet: {
            description: 'Promise that resolves when the default shipping method has been set server-side',
            table: { type: { summary: 'Promise<undefined>' } },
        },
        customerProfile: {
            description:
                'Optional returning customer profile — when provided, step computation considers saved addresses and payment instruments for auto-population',
            table: { type: { summary: 'CustomerProfile | undefined' } },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CheckoutProvider>;

export const GuestCheckoutWithPickup: Story = {
    render: () => (
        <CheckoutContextStoryHarness>
            <CheckoutProvider shippingDefaultSet={Promise.resolve(undefined)}>
                <CheckoutContextConsumer />
            </CheckoutProvider>
        </CheckoutContextStoryHarness>
    ),
    parameters: {
        docs: {
            description: {
                story: `Guest checkout — pickup-only basket (no delivery shipments). Step order is the 4-step flow: Contact Info → Pickup → Payment → Place Order. Shipping Address and Shipping Method steps are skipped entirely. Sequential step progression activates once the user begins navigating.`,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Initial state: Contact Info, no editing step, pickup-only basket
        await expect(canvas.getByTestId('current-step')).toHaveTextContent('Contact Info (0)');
        await expect(canvas.getByTestId('computed-step')).toHaveTextContent('Contact Info (0)');
        await expect(canvas.getByTestId('editing-step')).toHaveTextContent('None (null)');
        await expect(canvas.getByTestId('has-delivery-items')).toHaveTextContent('false');

        // Shipping Address and Shipping Method are hidden — not part of the pickup-only step order
        await expect(canvas.queryByRole('button', { name: /go to shipping address/i })).not.toBeInTheDocument();
        await expect(canvas.queryByRole('button', { name: /go to shipping method/i })).not.toBeInTheDocument();

        // Pickup-only step order: Contact Info → Pickup → Payment → Place Order
        await expect(canvas.getByRole('button', { name: /go to next step/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to contact info/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to pickup/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to payment/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to place order/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /exit edit mode/i })).toBeInTheDocument();
    },
};

// A minimal basket with one delivery shipment (no c_fromStoreId) triggers hasDeliveryItems=true,
// which switches the step order to the full 6-step delivery flow.
const deliveryBasket = {
    productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 1, shipmentId: 'shipment-1' }],
    shipments: [{ shipmentId: 'shipment-1' }],
} as const;

export const GuestCheckoutWithDelivery: Story = {
    decorators: [
        (Story) => (
            <BasketProvider basket={deliveryBasket as never}>
                <Story />
            </BasketProvider>
        ),
    ],
    render: () => (
        <CheckoutContextStoryHarness>
            <CheckoutProvider shippingDefaultSet={Promise.resolve(undefined)}>
                <CheckoutContextConsumer />
            </CheckoutProvider>
        </CheckoutContextStoryHarness>
    ),
    parameters: {
        docs: {
            description: {
                story: `Guest checkout — basket with a delivery shipment. Step order is the full 6-step flow: Contact Info → Pickup → Shipping Address → Shipping Method → Payment → Place Order. The "Has Delivery Items" flag is \`true\` because the basket contains a delivery shipment (no \`c_fromStoreId\`).`,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Delivery basket — hasDeliveryItems should be true, confirming the 6-step flow is active
        await expect(canvas.getByTestId('has-delivery-items')).toHaveTextContent('true');

        // Delivery flow: Contact Info, Shipping Address, Shipping Method, Payment, Place Order
        await expect(canvas.getByRole('button', { name: /go to contact info/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to shipping address/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to shipping method/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to payment/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /go to place order/i })).toBeInTheDocument();

        // Go to Pickup is hidden in the delivery flow
        await expect(canvas.queryByRole('button', { name: /go to pickup/i })).not.toBeInTheDocument();
    },
};

// A basket with customerInfo.email allows computeFinalStepForReturningCustomer to run.
// With a saved address and saved payment, it auto-advances to Place Order.
const returningCustomerBasket = { customerInfo: { email: 'john.doe@example.com' } } as const;

const savedCustomerProfile = {
    customer: {
        customerId: 'test-customer-id',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        login: 'john.doe@example.com',
    } as CustomerProfile['customer'],
    addresses: [
        {
            addressId: 'addr-1',
            firstName: 'John',
            lastName: 'Doe',
            address1: '5 Wall St',
            city: 'Burlington',
            stateCode: 'MA',
            postalCode: '01803',
            countryCode: 'US',
            preferred: true,
        },
    ],
    paymentInstruments: [
        {
            paymentInstrumentId: 'pi-1',
            paymentMethodId: 'CREDIT_CARD',
            paymentCard: {
                cardType: 'Visa',
                expirationMonth: 12,
                expirationYear: 2028,
                maskedNumber: '************1234',
            },
        },
    ],
};

export const CustomerProfileCheckoutWithPickup: Story = {
    decorators: [
        (Story) => (
            <BasketProvider basket={returningCustomerBasket as never}>
                <Story />
            </BasketProvider>
        ),
    ],
    render: () => (
        <CheckoutContextStoryHarness>
            <CheckoutProvider shippingDefaultSet={Promise.resolve(undefined)} customerProfile={savedCustomerProfile}>
                <CheckoutContextConsumer />
            </CheckoutProvider>
        </CheckoutContextStoryHarness>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Returning customer with a saved address and saved payment instrument — the general case after registration. `computeFinalStepForReturningCustomer` sees both `hasCustomerAddresses` and `hasCustomerPaymentMethods`, so it auto-advances directly to Place Order (5). Unlike guest users, returning customers always follow basket-derived step advancement even during active checkout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Returning customer with saved address + saved payment — verify context renders
        await expect(canvas.getByTestId('current-step')).toBeInTheDocument();
        await expect(canvas.getByTestId('active-step')).toBeInTheDocument();
        await expect(canvas.getByTestId('editing-step')).toHaveTextContent('None (null)');
    },
};

// Combines delivery shipment with customerInfo.email so both hasDeliveryItems=true
// and computeFinalStepForReturningCustomer run — auto-advances to Payment.
const returningCustomerDeliveryBasket = {
    customerInfo: { email: 'john.doe@example.com' },
    productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 1, shipmentId: 'shipment-1' }],
    shipments: [{ shipmentId: 'shipment-1' }],
} as const;

export const CustomerProfileCheckoutWithDelivery: Story = {
    decorators: [
        (Story) => (
            <BasketProvider basket={returningCustomerDeliveryBasket as never}>
                <Story />
            </BasketProvider>
        ),
    ],
    render: () => (
        <CheckoutContextStoryHarness>
            <CheckoutProvider shippingDefaultSet={Promise.resolve(undefined)} customerProfile={savedCustomerProfile}>
                <CheckoutContextConsumer />
            </CheckoutProvider>
        </CheckoutContextStoryHarness>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Returning customer with a delivery basket, saved address, and saved payment instrument — the general case after registration. The 6-step delivery flow is active (`Has Delivery Items: true`) and `computeFinalStepForReturningCustomer` auto-advances to Place Order (5) — skipping all earlier steps. Shipping Address and Shipping Method buttons are visible because the basket has delivery items.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Delivery basket — 6-step flow active
        await expect(canvas.getByTestId('has-delivery-items')).toHaveTextContent('true');

        // Returning customer with saved address + saved payment — verify context renders
        await expect(canvas.getByTestId('current-step')).toBeInTheDocument();
        await expect(canvas.getByTestId('active-step')).toBeInTheDocument();
        await expect(canvas.getByTestId('editing-step')).toHaveTextContent('None (null)');
    },
};

export const WithPinToStep: Story = {
    render: () => (
        <CheckoutContextStoryHarness>
            <CheckoutProvider shippingDefaultSet={Promise.resolve(undefined)}>
                <CheckoutContextConsumer showPinControls hideNavControls />
            </CheckoutProvider>
        </CheckoutContextStoryHarness>
    ),
    parameters: {
        docs: {
            description: {
                story: `Demonstrates \`pinToStep(step)\` — which sets **both** \`editingStep\` AND \`currentStep\` (Basket Step), unlike \`goToStep()\` which only sets \`editingStep\`.

This distinction matters when the shopper should be locked to a step regardless of what the basket would compute. For example, after a server error the checkout can pin the shopper back to the step that failed, and the basket state change that normally triggers auto-advance will not override it.

**In this story:** clicking any "Pin to …" button sets both Active Step and Basket Step simultaneously. Compare with "Go to Payment" (via \`goToStep\`) — that only changes Active Step, leaving Basket Step unchanged.`,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Initial state: starts at Contact Info
        await expect(canvas.getByTestId('current-step')).toHaveTextContent('Contact Info (0)');

        // Pin controls are visible
        await expect(canvas.getByRole('button', { name: /pin to payment/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /pin to contact info/i })).toBeInTheDocument();
    },
};
