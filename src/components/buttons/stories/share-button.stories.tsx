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
import { ShareButton } from '../share-button';
import { useMemo, type ReactNode, type ReactElement } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { standardProd } from '@/components/__mocks__/standard-product-2';

function ShareStoryHarness({ children, providers }: { children: ReactNode; providers?: string[] }): ReactElement {
    const configValue = useMemo(() => {
        return {
            ...mockConfig,
            features: {
                ...mockConfig.features,
                socialShare: {
                    enabled: true,
                    providers: providers ?? ['Twitter', 'Facebook', 'LinkedIn', 'Email'],
                },
            },
        } as typeof mockConfig;
    }, [providers]);

    return <ConfigProvider config={configValue}>{children}</ConfigProvider>;
}

const meta: Meta<typeof ShareButton> = {
    title: 'Core/Actions/Share Button',
    component: ShareButton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        a11y: {
            config: {
                rules: [
                    // Radix UI intentionally sets aria-hidden="true" on #storybook-root when dropdown opens
                    // This is correct accessibility behavior for modal focus trapping
                    { id: 'aria-hidden-focus', enabled: false },
                ],
            },
        },
        docs: {
            description: {
                component: `
A share button component that provides a dropdown menu with various sharing options for products. This component supports multiple social media platforms and native sharing capabilities.

## Features

- **Dropdown menu**: Custom dropdown with share options
- **Multiple providers**: Supports Twitter, Facebook, LinkedIn, and Email
- **Native sharing**: Uses Web Share API when available
- **Copy link**: Quick copy-to-clipboard functionality
- **Configurable**: Share providers configured via config.features.socialShare config
- **Accessibility**: Proper ARIA attributes and keyboard navigation

## Usage

The ShareButton is commonly used in:
- Product detail pages
- Product cards
- Product listings
- Any context where product sharing is needed

\`\`\`tsx
import { ShareButton } from '../share-button';

function ProductDetail({ product }) {
  return (
    <div>
      {/* product content */}
      <ShareButton product={product} />
    </div>
  );
}
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| \`product\` | \`ShopperProducts.schemas['Product']\` | - | The product data to share |
| \`className\` | \`string\` | \`undefined\` | Optional additional CSS classes |

## Share Options

- **Native Share**: Uses device's native share dialog (when available)
- **Copy Link**: Copies product URL to clipboard
- **Twitter/X**: Opens Twitter share dialog
- **Facebook**: Opens Facebook share dialog
- **LinkedIn**: Opens LinkedIn share dialog
- **Email**: Opens email client with pre-filled message

## Configuration

Share providers are configured via \`config.features.socialShare\`:

\`\`\`typescript
{
  site: {
    features: {
      socialShare: {
        enabled: true,
        providers: ['Twitter', 'Facebook', 'LinkedIn', 'Email']
      }
    }
  }
}
\`\`\`

## Accessibility

- Proper ARIA attributes for dropdown menu
- Keyboard navigation support
- Screen reader announcements
- Focus management during dropdown interaction
                `,
            },
        },
    },
    // `product` is hidden from the controls panel because the icon button
    // doesn't render any product data — the product is only consumed when
    // the dropdown menu items build share URLs after a click. `size` and
    // `className` are the only props with an immediate visible effect on
    // the canvas, so those are the controls we expose.
    argTypes: {
        // NOTE: `lg` renders only marginally larger than `md` because the
        // outer button in share-icon.tsx is fixed at `w-9 h-9` with `p-2`
        // padding (~20×20 inner space).
        size: {
            control: { type: 'radio' },
            options: ['sm', 'md', 'lg'],
            description: 'Icon size — drives the inner SVG width/height classes',
            table: {
                type: { summary: "'sm' | 'md' | 'lg'" },
                defaultValue: { summary: "'md'" },
            },
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
        product: { control: false, table: { disable: true } },
        // tabIndex is a focus-management hook for the consumer; not relevant
        // to user-facing visual demonstration in the canvas.
        tabIndex: { control: false, table: { disable: true } },
    },
    args: {
        product: standardProd,
        size: 'md',
        className: undefined,
    },
    decorators: [
        (Story: React.ComponentType, context) => (
            <ShareStoryHarness providers={context.parameters?.shareProviders}>
                <Story {...(context.args as Record<string, unknown>)} />
            </ShareStoryHarness>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        product: standardProd,
    },
    parameters: {
        shareProviders: ['Twitter', 'Facebook', 'LinkedIn', 'Email'],
        docs: {
            description: {
                story: `
The default ShareButton shows all available share options:

### Features:
- **Share button**: Main button with "Share" text
- **Dropdown menu**: Opens to reveal share options
- **All providers**: Twitter, Facebook, LinkedIn, and Email
- **Native share**: Available when Web Share API is supported
- **Copy link**: Quick copy functionality

### Use Cases:
- Product detail pages
- Standard sharing functionality
- Most common sharing scenarios
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test share button is present
        const shareButton = canvas.getByRole('button', { name: /share/i });
        await expect(shareButton).toBeInTheDocument();
        await expect(shareButton).not.toBeDisabled();

        // Test dropdown opens on click
        await userEvent.click(shareButton);

        // Wait for dropdown menu to be visible and find the copy link option
        // Note: Dropdown content may be in a portal, so we query from document
        const documentBody = within(document.body);
        const copyLinkOption = await documentBody.findByRole('menuitem', { name: /copy link/i });
        await expect(copyLinkOption).toBeInTheDocument();
    },
};
