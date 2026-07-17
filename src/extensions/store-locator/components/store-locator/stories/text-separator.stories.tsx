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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { TextSeparator } from '../text-separator';

const meta: Meta<typeof TextSeparator> = {
    title: 'Extensions/Store Locator/Text Separator',
    component: TextSeparator,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The TextSeparator component visually separates content with a horizontal rule and a centered small text label.

## Features

- **Visual Separation**: Horizontal rule with centered text
- **Flexible Text**: Accepts any text label
- **Styling**: Uses muted foreground color for subtle appearance

## Usage

This component is used in the StoreLocatorForm to separate the form search from the "Use My Location" button.
                `,
            },
        },
    },
    argTypes: {
        text: {
            description: 'The label to render in the center of the separator',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        text: 'Or',
    },
    parameters: {
        docs: {
            description: {
                story: `
Default text separator showing:
- Horizontal rule
- Centered "Or" text
- Muted foreground color

This is the default state used in the store locator form.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify separator is rendered
        const separator = canvasElement.querySelector('[class*="relative"]');
        await expect(separator).toBeInTheDocument();

        // Verify text is present
        const text = canvasElement.textContent;
        await expect(text).toContain('Or');
    },
};

export const CustomText: Story = {
    args: {
        text: 'Alternatively',
    },
    parameters: {
        docs: {
            description: {
                story: `
Text separator with custom text. Shows:
- Horizontal rule
- Centered custom text
- Same styling as default

This demonstrates the flexibility of the component.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify separator is rendered
        const separator = canvasElement.querySelector('[class*="relative"]');
        await expect(separator).toBeInTheDocument();

        // Verify custom text is present
        const text = canvasElement.textContent;
        await expect(text).toContain('Alternatively');
    },
};

export const MobileLayout: Story = {
    args: {
        text: 'Or',
    },
    parameters: {
        docs: {
            description: {
                story: `
Text separator optimized for mobile devices. Shows:
- Same visual appearance
- Mobile-optimized spacing

The component maintains consistent appearance across screen sizes.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify separator is rendered
        const separator = canvasElement.querySelector('[class*="relative"]');
        await expect(separator).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    args: {
        text: 'Or',
    },
    parameters: {
        docs: {
            description: {
                story: `
Text separator for desktop devices. Shows:
- Same visual appearance
- Desktop-optimized spacing

The component maintains consistent appearance across screen sizes.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify separator is rendered
        const separator = canvasElement.querySelector('[class*="relative"]');
        await expect(separator).toBeInTheDocument();
    },
};
