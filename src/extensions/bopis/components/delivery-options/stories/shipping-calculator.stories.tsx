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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import ShippingCalculator from '../shipping-calculator';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');
        const logInput = action('input-change');

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const button = target.closest('button, [role="button"]');
            if (button) {
                const label =
                    button.textContent?.trim() || button.getAttribute('aria-label') || button.tagName.toLowerCase();
                logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
            }
        };

        const handleInput = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const input = target.closest('input');
            if (input instanceof HTMLInputElement) {
                logInput({ value: input.value, id: input.id });
            }
        };

        root.addEventListener('click', handleClick, true);
        root.addEventListener('input', handleInput, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
            root.removeEventListener('input', handleInput, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof ShippingCalculator> = {
    title: 'Extensions/BOPIS/Shipping Calculator',
    component: ShippingCalculator,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        mockRoutes: [
            {
                path: '/resource/shipping-estimate',
                loader: ({ request }: { request: Request }) => {
                    const url = new URL(request.url);
                    const zipcode = url.searchParams.get('zipcode') ?? '';
                    const seed = parseInt(zipcode.slice(-2)) || 1;
                    const days = (seed % 3) + 3;
                    const date = new Date();
                    date.setDate(date.getDate() + days);
                    const lastDigit = parseInt(zipcode.slice(-1)) || 0;
                    const cost = lastDigit % 2 === 0 ? 0 : 5.99;
                    return {
                        success: true,
                        zipcode,
                        estimate: { delivery_date: date.toISOString().split('T')[0], cost, days },
                    };
                },
            },
        ],
        docs: {
            description: {
                component: `
The ShippingCalculator component allows users to calculate estimated delivery times by entering their ZIP code.

## Features

- **ZIP Code Input**: Validates US postal codes (5 digits or 5+4 format)
- **Calculate Button**: Always enabled - validation happens on button click
- **Delivery Estimate**: Shows estimated delivery days and shipping cost
- **Accessibility**: Proper ARIA labels and live regions for screen readers

## Usage

This component is used within DeliveryOptions when the delivery option is selected. It helps users estimate when their order will arrive.
                `,
            },
        },
    },
    argTypes: {
        productId: {
            description: 'Product ID for shipping calculation',
            control: 'text',
        },
        onCalculate: {
            description: 'Callback function called when calculation is performed',
            action: 'onCalculate',
        },
    },
    decorators: [
        (Story: ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        productId: 'test-product-123',
        onCalculate: action('calculate'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Default shipping calculator showing:
- Empty ZIP code input field
- Enabled calculate button
- Instruction message

This is the initial state before user enters a ZIP code.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const input = await canvas.findByLabelText(/zip code/i, {}, { timeout: 5000 });
        await expect(input).toBeInTheDocument();

        const calculateButton = await canvas.findByRole('button', { name: /calculate/i }, { timeout: 5000 });
        await expect(calculateButton).toBeInTheDocument();
        await expect(calculateButton).not.toBeDisabled();

        const instruction = canvasElement.querySelector('#delivery-message');
        await expect(instruction).toBeInTheDocument();
    },
};

export const WithValidZip: Story = {
    args: {
        productId: 'test-product-123',
        onCalculate: action('calculate'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Shipping calculator with valid ZIP code entered. Shows:
- ZIP code in input field
- Enabled calculate button
- Ready to calculate delivery estimate

This state appears when user enters a valid 5-digit ZIP code.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const input = await canvas.findByLabelText(/zip code/i, {}, { timeout: 5000 });
        await expect(input).toBeInTheDocument();

        await userEvent.type(input, '94102');

        const calculateButton = await canvas.findByRole('button', { name: /calculate/i }, { timeout: 5000 });
        await expect(calculateButton).not.toBeDisabled();
    },
};

export const WithResult: Story = {
    args: {
        productId: 'test-product-123',
        onCalculate: action('calculate'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Shipping calculator after calculation is performed. Shows:
- ZIP code in input field
- Success message with estimated delivery days
- Shipping cost information

This state appears after user clicks calculate with a valid ZIP code.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const input = await canvas.findByLabelText(/zip code/i, {}, { timeout: 5000 });
        await expect(input).toBeInTheDocument();

        await userEvent.type(input, '94102');
        const calculateButton = await canvas.findByRole('button', { name: /calculate/i }, { timeout: 5000 });
        await userEvent.click(calculateButton);

        const result = await canvas.findByRole('status', {}, { timeout: 5000 });
        await expect(result).toBeInTheDocument();

        const deliveryText = await canvas.findByText(/estimated delivery/i, {}, { timeout: 5000 });
        await expect(deliveryText).toBeInTheDocument();
    },
};

export const InvalidZip: Story = {
    args: {
        productId: 'test-product-123',
        onCalculate: action('calculate'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Shipping calculator with invalid ZIP code entered. Shows:
- Partial ZIP code in input field
- Enabled calculate button (validation happens on click)
- Error message after clicking calculate
- Input marked as invalid after validation

This state appears when user enters less than 5 digits and clicks calculate.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const input = await canvas.findByLabelText(/zip code/i, {}, { timeout: 5000 });
        await expect(input).toBeInTheDocument();

        await userEvent.type(input, '941');

        const calculateButton = await canvas.findByRole('button', { name: /calculate/i }, { timeout: 5000 });
        await expect(calculateButton).not.toBeDisabled();

        await userEvent.click(calculateButton);

        const validationError = await canvas.findByRole('alert', {}, { timeout: 5000 });
        await expect(validationError).toBeInTheDocument();

        await expect(input).toHaveAttribute('aria-invalid', 'true');
    },
};

export const MobileLayout: Story = {
    args: {
        productId: 'test-product-123',
        onCalculate: action('calculate'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Shipping calculator optimized for mobile devices. Shows:
- Touch-friendly input field
- Mobile-optimized button layout
- Responsive spacing

The component automatically adapts for mobile screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const input = await canvas.findByLabelText(/zip code/i, {}, { timeout: 5000 });
        await expect(input).toBeInTheDocument();

        const calculateButton = await canvas.findByRole('button', { name: /calculate/i }, { timeout: 5000 });
        await expect(calculateButton).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        productId: 'test-product-123',
        onCalculate: action('calculate'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Shipping calculator for desktop devices. Shows:
- Proper spacing and layout
- All elements clearly displayed
- Desktop-optimized interaction

The component provides a clean layout for desktop screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const input = await canvas.findByLabelText(/zip code/i, {}, { timeout: 5000 });
        await expect(input).toBeInTheDocument();

        const calculateButton = await canvas.findByRole('button', { name: /calculate/i }, { timeout: 5000 });
        await expect(calculateButton).toBeInTheDocument();
    },
};
