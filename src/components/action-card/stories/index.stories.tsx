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
import { expect, within, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import { useEffect, useRef } from 'react';

import ActionCard from '../index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const logEditClick = () => action('edit clicked');
const logRemoveClick = () => action('remove clicked');

const createEditHandler = (label: string, userHandler?: () => void) => {
    const log = logEditClick();
    return () => {
        log({ label });
        userHandler?.();
    };
};

const createRemoveHandler = (label: string, userHandler?: () => void | Promise<unknown>) => {
    const log = logRemoveClick();
    return async () => {
        log({ label });
        return await userHandler?.();
    };
};

const meta: Meta<typeof ActionCard> = {
    title: 'Core/Actions/Action Card',
    component: ActionCard,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A card-style container with optional Edit/Remove actions. This component provides a consistent interface for displaying content with action buttons, including loading states and accessibility features.

## Features

- **Card container**: Uses shadcn/ui Card component for consistent styling
- **Optional actions**: Edit and/or Remove buttons can be enabled
- **Loading overlay**: Shows loading spinner when onRemove returns a promise
- **Accessibility**: Proper ARIA labels and button refs for focus management
- **Customizable labels**: Edit and remove button labels can be customized
- **Responsive design**: Works seamlessly across all device sizes

## Usage

The ActionCard is commonly used for:
- Address cards in checkout/settings
- Payment method cards
- Saved items or favorites
- User profile sections
- Any content that needs edit/remove functionality

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| \`children\` | \`ReactNode\` | \`undefined\` | Content to display inside the card |
| \`onEdit\` | \`() => void\` | \`undefined\` | Function called when edit button is clicked |
| \`onRemove\` | \`() => void | Promise<unknown>\` | \`undefined\` | Function called when remove button is clicked |
| \`editBtnRef\` | \`Ref<HTMLButtonElement>\` | \`undefined\` | Ref for the edit button for accessibility |
| \`editBtnLabel\` | \`string\` | \`undefined\` | Custom label for edit button |
| \`removeBtnRef\` | \`Ref<HTMLButtonElement>\` | \`undefined\` | Ref for the remove button for accessibility |
| \`removeBtnLabel\` | \`string\` | \`undefined\` | Custom label for remove button |

## Loading States

When \`onRemove\` returns a promise, the component automatically:
- Shows a loading overlay with spinner
- Disables interaction with the card content
- Maintains accessibility during loading

## Accessibility

- Proper ARIA labels for action buttons
- Button refs for programmatic focus management
- Loading states are announced to screen readers
- Keyboard navigation support
- High contrast loading overlay
                `,
            },
        },
    },
    argTypes: {
        onEdit: {
            control: false,
            description: 'Function called when edit button is clicked',
        },
        onRemove: {
            control: false,
            description: 'Function called when remove button is clicked',
        },
        // `editBtnLabel` / `removeBtnLabel` only override the buttons'
        // `aria-label`; the visible text is always the translated `Edit` /
        // `Remove`. No canvas-driving value, so hide from Controls.
        editBtnLabel: { control: false, table: { disable: true } },
        removeBtnLabel: { control: false, table: { disable: true } },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {},
    render: (args) => {
        const { t } = getTranslation();
        const { onEdit: userOnEdit, onRemove: userOnRemove, editBtnLabel, removeBtnLabel, ...rest } = args;
        const editLabel = editBtnLabel ?? t('actionCard:edit');
        const removeLabel = removeBtnLabel ?? t('actionCard:remove');

        return (
            <ActionCard
                {...rest}
                onEdit={createEditHandler(editLabel, userOnEdit)}
                onRemove={createRemoveHandler(removeLabel, userOnRemove)}
                editBtnLabel={editBtnLabel}
                removeBtnLabel={removeBtnLabel}>
                <div className="space-y-2">
                    <h3 className="font-semibold text-sm">John Doe</h3>
                    <p className="text-sm text-muted-foreground">john.doe@example.com</p>
                    <p className="text-sm">123 Main Street, Apt 4B</p>
                    <p className="text-sm">New York, NY 10001</p>
                </div>
            </ActionCard>
        );
    },
    parameters: {
        docs: {
            description: {
                story: `
The default ActionCard includes both edit and remove functionality:

### Features:
- **Content area**: Displays user information (name, email, address)
- **Edit button**: Link-style button for editing the content
- **Remove button**: Link-style button with destructive styling for removal
- **Action handlers**: Both buttons have click handlers (shown in Actions panel)

### Use Cases:
- Address cards in checkout flow
- Payment method management
- User profile sections
- Saved items or favorites
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Test card content is displayed
        const nameElement = canvas.getByText('John Doe');
        await expect(nameElement).toBeInTheDocument();

        // Test edit button is present and enabled
        const editButton = canvas.getByRole('button', { name: /edit|change/i });
        await expect(editButton).toBeInTheDocument();
        await expect(editButton).not.toBeDisabled();

        // Test remove button is present and enabled
        const removeButton = canvas.getByRole('button', { name: /remove|delete/i });
        await expect(removeButton).toBeInTheDocument();
        await expect(removeButton).not.toBeDisabled();
    },
};

/**
 * Exercises the loading overlay path: a mount-triggered harness clicks the
 * remove button on first render, which mounts the spinner overlay until the
 * promise resolves. Wired this way (rather than via play-only interaction) so
 * snapshot tests capture the overlay state instead of the idle card.
 */
function MountTriggeredRemoveCard() {
    const { t } = getTranslation();
    const editLabel = t('actionCard:edit');
    const removeLabel = t('actionCard:remove');
    const cardRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Click the remove button as soon as the card mounts so the loading
        // overlay is visible during snapshot capture.
        const root = cardRef.current;
        if (!root) return;
        const button = root.querySelector<HTMLButtonElement>(`button[aria-label="${removeLabel}"]`);
        button?.click();
    }, [removeLabel]);

    // Promise that never resolves keeps the overlay visible — required for the
    // snapshot to capture the loading state and for the play function to assert
    // against a stable DOM.
    const onRemove = () => new Promise<void>(() => undefined);

    return (
        <div ref={cardRef}>
            <ActionCard onEdit={createEditHandler(editLabel)} onRemove={createRemoveHandler(removeLabel, onRemove)}>
                <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Pending Removal</h3>
                    <p className="text-sm">Loading overlay is mounted while removal is in flight.</p>
                </div>
            </ActionCard>
        </div>
    );
}

export const RemoveLoadingOverlay: Story = {
    render: () => <MountTriggeredRemoveCard />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // The mount effect clicks remove for us; wait for the overlay to mount.
        await waitFor(
            () => {
                expect(canvas.getByTestId('loading-spinner')).toBeInTheDocument();
            },
            { timeout: 2000 }
        );
    },
};
