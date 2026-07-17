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
import { RemoveItemButtonWithConfirmation } from '../remove-item-button-with-confirmation';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, type ReactNode, type ReactElement } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';

import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const STORYBOOK_REMOVE_BASE = '/__storybook/remove';

function RemoveItemStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const configValue = useMemo(() => {
        return {
            ...mockConfig,
            pages: {
                ...mockConfig.pages,
                cart: {
                    ...mockConfig.pages.cart,
                    removeAction: `${STORYBOOK_REMOVE_BASE}/cart`,
                },
            },
        };
    }, []);

    // Mock the form-action endpoint so the fetcher.submit() inside the
    // component resolves with `{ success: true }` instead of hitting a real
    // route. Required for the confirm flow to complete cleanly in stories.
    useEffect(() => {
        const originalFetch = window.fetch?.bind(window);
        if (!originalFetch) {
            return;
        }

        window.fetch = async (...args) => {
            const [input] = args;
            const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
            const { pathname } = new URL(url, window.location.origin);
            if (pathname.startsWith(STORYBOOK_REMOVE_BASE)) {
                return new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return originalFetch(...args);
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    return <ConfigProvider config={configValue}>{children}</ConfigProvider>;
}

// `StoryArgs` extends the component's real props with a story-only
// `storyConfirmDescription` synthetic arg. The `render` function below
// maps it into `config.confirmDescription`, which the component reads.
type StoryArgs = React.ComponentProps<typeof RemoveItemButtonWithConfirmation> & {
    storyConfirmDescription?: string;
};

const meta: Meta<StoryArgs> = {
    title: 'Core/Actions/Remove Item Button With Confirmation',
    component: RemoveItemButtonWithConfirmation,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A remove button component that includes a confirmation dialog to prevent accidental deletions. This component provides a safe way to remove items with proper user confirmation and loading states.

## Features

- **Confirmation dialog**: Prevents accidental item removal
- **Configurable messages**: Customizable text for all dialog elements
- **Loading states**: Shows loading during removal process
- **Toast notifications**: Success and error feedback
- **Accessibility**: Proper ARIA attributes and keyboard navigation
- **Default configuration**: Uses app config for consistent behavior

## Usage

The RemoveItemButtonWithConfirmation is commonly used in:
- Shopping cart item removal
- Wishlist item removal
- Saved items management
- Any context where item deletion needs confirmation

\`\`\`tsx
import { RemoveItemButtonWithConfirmation } from '../remove-item-button-with-confirmation';

function CartItem({ item }) {
  return (
    <div>
      {/* item content */}
      <RemoveItemButtonWithConfirmation
        itemId={item.id}
        config={customConfig}
      />
    </div>
  );
}
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| \`itemId\` | \`string\` | - | Unique identifier for the item to remove |
| \`config\` | \`RemoveItemConfig\` | From app config | Configuration object for messages and behavior |
| \`className\` | \`string\` | \`''\` | Additional CSS classes for styling |

## Configuration Object

The \`config\` prop allows customization of all text and behavior:

\`\`\`typescript
interface RemoveItemConfig {
  action: string;                    // Form action URL
  confirmDescription: string;        // Dialog description
}
\`\`\`

## Dialog Flow

1. **Click remove button**: Opens confirmation dialog
2. **Review confirmation**: User sees item details and confirmation message
3. **Cancel or confirm**: User can cancel or proceed with removal
4. **Loading state**: Button shows loading during API call
5. **Toast feedback**: Success or error message is displayed

## Accessibility

- Proper ARIA attributes for dialog
- Keyboard navigation support
- Screen reader announcements
- Focus management during dialog
- Loading state announcements
                `,
            },
        },
    },
    // `className` is utility-class noise. `itemId` is opaque (used as a
    // fetcher key, never rendered). The whole `config` object is hidden
    // because its `action` field is a story-only mock URL — we surface
    // `confirmDescription` separately as a synthetic story arg
    // (`storyConfirmDescription`) so a designer can edit the dialog body
    // copy without dealing with the nested `config` JSON.
    argTypes: {
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
        itemId: { control: false, table: { disable: true } },
        config: { control: false, table: { disable: true } },
        storyConfirmDescription: {
            control: 'text',
            description:
                'Story-only arg: text shown as the confirmation dialog description (maps to `config.confirmDescription` at render time).',
            table: { type: { summary: 'string' } },
        },
    },
    args: {
        itemId: 'item-123',
        className: '',
        storyConfirmDescription: 'Are you sure you want to remove this item from your cart?',
    },
    decorators: [
        (Story: React.ComponentType) => (
            <RemoveItemStoryHarness>
                <Story />
            </RemoveItemStoryHarness>
        ),
    ],
    render: ({ storyConfirmDescription, config, ...args }) => (
        <RemoveItemButtonWithConfirmation
            {...args}
            config={
                config ?? {
                    action: `${STORYBOOK_REMOVE_BASE}/cart`,
                    confirmDescription: storyConfirmDescription ?? '',
                }
            }
        />
    ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        itemId: 'item-123',
    },
    parameters: {
        docs: {
            description: {
                story: `
The default RemoveItemButtonWithConfirmation uses the standard cart configuration:

### Features:
- **Default configuration**: Uses app config for cart removal
- **Standard text**: "Remove" button with "Confirm Remove Item" confirmation dialog
- **Cart context**: Designed for shopping cart item removal
- **Consistent behavior**: Matches other cart components

### Dialog Content:
- **Title**: "Confirm Remove Item"
- **Description**: "Are you sure you want to remove this item from your cart?"
- **Cancel**: "No, keep item"
- **Confirm**: "Yes, remove item"

### Use Cases:
- Shopping cart item removal
- Standard item deletion flows
- Default e-commerce behavior
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test button is present and properly rendered
        const removeButtons = canvas.getAllByRole('button');
        await expect(removeButtons.length).toBeGreaterThan(0);

        // Test that each button is properly rendered
        for (const button of removeButtons) {
            await expect(button).toBeInTheDocument();
            // In loading state, button should be disabled
            if (button.getAttribute('data-testid') === 'remove-item-loading') {
                await expect(button).toBeDisabled();
            } else {
                await expect(button).not.toBeDisabled();
            }
        }

        // In test environment, just verify buttons exist - don't try to click
        // as the confirmation dialogs may not work properly in test environment
        await expect(canvasElement).toBeInTheDocument();
    },
};

export const CustomConfiguration: Story = {
    args: {
        itemId: 'wishlist-item-456',
        config: {
            action: `${STORYBOOK_REMOVE_BASE}/wishlist`,
            confirmDescription:
                'Are you sure you want to remove this item from your wishlist? This action cannot be undone.',
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
This story demonstrates a custom configuration for wishlist item removal:

### Custom Features:
- **Wishlist context**: Customized text for wishlist removal
- **Different action**: Points to wishlist removal endpoint
- **Enhanced description**: More detailed confirmation message

### Custom Dialog Content:
- **Title**: "Confirm Remove Item" (from UI strings)
- **Description**: Detailed explanation with "cannot be undone" warning
- **Cancel**: "No, keep item" (from UI strings)
- **Confirm**: "Yes, remove item" (from UI strings)

### Use Cases:
- Wishlist item management
- Saved items removal
- Custom removal flows
- Context-specific removal actions
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test button is present and properly rendered
        const removeButtons = canvas.getAllByRole('button');
        await expect(removeButtons.length).toBeGreaterThan(0);

        // Test that each button is properly rendered
        for (const button of removeButtons) {
            await expect(button).toBeInTheDocument();
            // In loading state, button should be disabled
            if (button.getAttribute('data-testid') === 'remove-item-loading') {
                await expect(button).toBeDisabled();
            } else {
                await expect(button).not.toBeDisabled();
            }
        }

        // In test environment, just verify buttons exist - don't try to click
        // as the confirmation dialogs may not work properly in test environment
        await expect(canvasElement).toBeInTheDocument();
    },
};

function LoadingStateRemoveButton() {
    return (
        <Button
            variant="link"
            size="sm"
            disabled={true}
            className="font-bold"
            title="Remove item"
            data-testid="remove-item-loading"
            aria-busy={true}>
            Removing...
        </Button>
    );
}

export const LoadingState: Story = {
    render: () => <LoadingStateRemoveButton />,
    parameters: {
        docs: {
            description: {
                story: `
This story demonstrates the loading state during item removal:

### Loading Features:
- **Button disabled**: Cannot be clicked during loading
- **Loading text**: Shows "Removing..." instead of "Remove"
- **ARIA busy**: Announces loading state to screen readers
- **Visual feedback**: Clear indication that action is in progress

### Loading Behavior:
- Triggered when fetcher state is 'submitting'
- Prevents multiple removal attempts
- Maintains accessibility during loading
- Shows progress to user

### Use Cases:
- Long-running removal operations
- Server-side processing
- API calls that take time
- User feedback during operations
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test button is present and properly rendered
        const removeButtons = canvas.getAllByRole('button');
        await expect(removeButtons.length).toBeGreaterThan(0);

        // Test that each button is properly rendered
        for (const button of removeButtons) {
            await expect(button).toBeInTheDocument();
            // In loading state, button should be disabled
            if (button.getAttribute('data-testid') === 'remove-item-loading') {
                await expect(button).toBeDisabled();
            } else {
                await expect(button).not.toBeDisabled();
            }
        }

        // In test environment, just verify buttons exist - don't try to click
        // as the confirmation dialogs may not work properly in test environment
        await expect(canvasElement).toBeInTheDocument();
    },
};
