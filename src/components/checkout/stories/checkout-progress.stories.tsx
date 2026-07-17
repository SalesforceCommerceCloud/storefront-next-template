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
import type { ReactNode } from 'react';
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { CheckoutProgress } from '../checkout-progress';
import { CHECKOUT_STEPS } from '../utils/checkout-context-types';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

function Wrapper({ children }: { children: ReactNode }) {
    return <div className="w-full max-w-4xl mx-auto p-6">{children}</div>;
}

// Asserts visible state by counting style markers in the rendered DOM. The component renders
// each step twice (mobile + desktop layouts), so completed/current/pending counts double.
async function assertStepStateCounts(
    canvasElement: HTMLElement,
    { completed, current, pending }: { completed: number; current: number; pending: number }
) {
    const root = canvasElement;
    // Completed circles render <svg class="lucide-check">
    const completedCircles = root.querySelectorAll('svg.lucide-check');
    // Current circle has the animate-pulse class on the circle itself
    const currentCircles = root.querySelectorAll('.animate-pulse');
    // Pending circles use the muted class set
    const pendingCircles = root.querySelectorAll('.bg-muted.text-muted-foreground');

    await expect(completedCircles).toHaveLength(completed * 2);
    await expect(currentCircles).toHaveLength(current * 2);
    await expect(pendingCircles).toHaveLength(pending * 2);
}

const meta: Meta<typeof CheckoutProgress> = {
    title: 'Checkout/Progress',
    component: CheckoutProgress,
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
### CheckoutProgress Component

This component renders a visual timeline of the six checkout steps so the shopper can see where they are in the flow. It is purely presentational — it accepts \`currentStep\` and \`completedSteps\` as props and renders them; it does not subscribe to \`CheckoutContext\` or any other source, so it can be exercised in stories with any combination of step states.

**Key Features:**
- **Three visual states per step**: \`completed\` (primary-color circle with a check icon), \`current\` (primary-color circle with an animated pulse and the step number), and \`pending\` (muted circle with the step number)
- **Six fixed steps**: Contact Info, Pickup, Shipping, Delivery (shipping options), Payment, Place Order — order and labels are defined inline; the component does not adapt the step list based on basket contents
- **Responsive layout**: horizontal layout on mobile (truncated titles only); vertical layout from the \`md\` breakpoint with full title and description per step
- **Connector lines**: each step is joined to the next; connectors before completed steps render in the primary color, otherwise in the muted border color
- **Stateless**: caller is responsible for computing \`currentStep\` and \`completedSteps\` — typically derived from \`CheckoutContext\` (e.g., from \`step\` and a list of finished steps)

**Dependencies:**
- \`./utils/checkout-context-types\`: \`CHECKOUT_STEPS\` constants and the \`CheckoutStep\` type
- \`@/lib/utils\`: \`cn\` class-name merger
- \`lucide-react\`: \`CheckIcon\` for completed-step circles
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
        currentStep: {
            description:
                'The step the shopper is currently on. Rendered with the `current` style (animated pulse). One of `CHECKOUT_STEPS.CONTACT_INFO` (0) through `CHECKOUT_STEPS.PLACE_ORDER` (5).',
            table: { type: { summary: 'CheckoutStep' } },
        },
        completedSteps: {
            description:
                'Steps the shopper has finished. Each is rendered with a check icon and primary-color connector to the next step. Defaults to `[]`.',
            table: { type: { summary: 'CheckoutStep[]' }, defaultValue: { summary: '[]' } },
        },
        className: {
            description: 'Additional class names merged onto the outer container.',
            table: { type: { summary: 'string' } },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CheckoutProgress>;

export const ContactInfo: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress currentStep={CHECKOUT_STEPS.CONTACT_INFO} completedSteps={[]} />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'First step. Contact Info is current; all five remaining steps are pending. No checkmarks.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 0, current: 1, pending: 5 });
    },
};

export const Pickup: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress currentStep={CHECKOUT_STEPS.PICKUP} completedSteps={[CHECKOUT_STEPS.CONTACT_INFO]} />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Pickup is current; Contact Info shows a checkmark. Four steps remain pending.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 1, current: 1, pending: 4 });
    },
};

export const ShippingAddress: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress
                currentStep={CHECKOUT_STEPS.SHIPPING_ADDRESS}
                completedSteps={[CHECKOUT_STEPS.CONTACT_INFO, CHECKOUT_STEPS.PICKUP]}
            />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Shipping Address is current; Contact Info and Pickup are completed. Three steps pending.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 2, current: 1, pending: 3 });
    },
};

export const ShippingOptions: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress
                currentStep={CHECKOUT_STEPS.SHIPPING_OPTIONS}
                completedSteps={[CHECKOUT_STEPS.CONTACT_INFO, CHECKOUT_STEPS.PICKUP, CHECKOUT_STEPS.SHIPPING_ADDRESS]}
            />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Delivery (shipping options) is current; first three steps are completed. Two steps pending.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 3, current: 1, pending: 2 });
    },
};

export const Payment: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress
                currentStep={CHECKOUT_STEPS.PAYMENT}
                completedSteps={[
                    CHECKOUT_STEPS.CONTACT_INFO,
                    CHECKOUT_STEPS.PICKUP,
                    CHECKOUT_STEPS.SHIPPING_ADDRESS,
                    CHECKOUT_STEPS.SHIPPING_OPTIONS,
                ]}
            />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Payment is current; first four steps are completed. Place Order is pending.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 4, current: 1, pending: 1 });
    },
};

export const PlaceOrder: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress
                currentStep={CHECKOUT_STEPS.PLACE_ORDER}
                completedSteps={[
                    CHECKOUT_STEPS.CONTACT_INFO,
                    CHECKOUT_STEPS.PICKUP,
                    CHECKOUT_STEPS.SHIPPING_ADDRESS,
                    CHECKOUT_STEPS.SHIPPING_OPTIONS,
                    CHECKOUT_STEPS.PAYMENT,
                ]}
            />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Final step. Place Order is current; all five previous steps show checkmarks.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 5, current: 1, pending: 0 });
    },
};

export const AllCompleted: Story = {
    render: () => (
        <Wrapper>
            <CheckoutProgress
                currentStep={CHECKOUT_STEPS.PLACE_ORDER}
                completedSteps={[
                    CHECKOUT_STEPS.CONTACT_INFO,
                    CHECKOUT_STEPS.PICKUP,
                    CHECKOUT_STEPS.SHIPPING_ADDRESS,
                    CHECKOUT_STEPS.SHIPPING_OPTIONS,
                    CHECKOUT_STEPS.PAYMENT,
                    CHECKOUT_STEPS.PLACE_ORDER,
                ]}
            />
        </Wrapper>
    ),
    parameters: {
        docs: {
            description: {
                story: 'All six steps marked completed (e.g., immediately after place-order succeeds). No step is in the `current` state — every circle shows a checkmark and every connector is in the completed style.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await assertStepStateCounts(canvasElement, { completed: 6, current: 0, pending: 0 });
    },
};
