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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import StoreLocatorForm from '../form';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');
        const logSubmit = action('form-submit');
        const logChange = action('form-change');

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            // Prevent navigation on links
            const link = target.closest('a');
            if (link) {
                event.preventDefault();
                const href = link.getAttribute('href');
                logClick({ type: 'click', element: 'link', href, label: link.textContent?.trim() });
                return;
            }

            // Log button clicks
            const button = target.closest('button, [role="button"]');
            if (button) {
                const label =
                    button.textContent?.trim() || button.getAttribute('aria-label') || button.tagName.toLowerCase();
                logClick({ type: 'click', element: button.tagName.toLowerCase(), label });
            }
        };

        const handleSubmit = (event: Event) => {
            const form = (event.target as HTMLElement)?.closest('form');
            if (form) {
                const formData = new FormData(form);
                logSubmit({
                    countryCode: formData.get('countryCode'),
                    postalCode: formData.get('postalCode'),
                });
            }
        };

        const handleChange = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const input = target.closest('input, select');
            if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
                logChange({ name: input.name, value: input.value });
            }
        };

        root.addEventListener('click', handleClick, true);
        root.addEventListener('submit', handleSubmit, true);
        root.addEventListener('change', handleChange, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
            root.removeEventListener('submit', handleSubmit, true);
            root.removeEventListener('change', handleChange, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof StoreLocatorForm> = {
    title: 'Extensions/Store Locator/Store Locator Form',
    component: StoreLocatorForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreLocatorForm component is a controlled form for searching stores either by country/postal code or by using the shopper's current device location.

## Features

- **Form Search**: Search by country and postal code
- **Geolocation**: Use device location to find nearby stores
- **State Management**: Backed by the store locator state store
- **Validation**: Form validation with error messages

## Usage

This component is used within the StoreLocator component to provide the search interface.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoreLocatorProvider>
                <ActionLogger>
                    <Story />
                </ActionLogger>
            </StoreLocatorProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Default store locator form showing:
- Country dropdown selector
- Postal code input field
- "Find Stores" button
- "Or" separator
- "Use My Location" button

This is the default state before any interaction.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify form is rendered
        const form = canvasElement.querySelector('form');
        await expect(form).toBeInTheDocument();

        // Verify postal code input is present
        const postalInput = await canvas.findByPlaceholderText(/postal code/i, {}, { timeout: 5000 });
        await expect(postalInput).toBeInTheDocument();

        // Verify find button is present
        const findButton = await canvas.findByRole('button', { name: /find/i }, { timeout: 5000 });
        await expect(findButton).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator form optimized for mobile devices. Shows:
- Stacked layout for better mobile viewing
- Touch-friendly inputs and buttons
- Mobile-optimized spacing

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

        // Verify form is rendered
        const form = canvasElement.querySelector('form');
        await expect(form).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator form for desktop devices. Shows:
- Proper spacing and layout
- All form fields clearly displayed
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

        // Verify form is rendered
        const form = canvasElement.querySelector('form');
        await expect(form).toBeInTheDocument();

        // Verify postal code input is present
        const postalInput = await canvas.findByPlaceholderText(/postal code/i, {}, { timeout: 5000 });
        await expect(postalInput).toBeInTheDocument();
    },
};
