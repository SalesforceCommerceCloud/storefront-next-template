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
import { useState } from 'react';
import { ToggleCard, ToggleCardEdit, ToggleCardSummary } from '../index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof ToggleCard> = {
    title: 'Core/Forms/Toggle Card',
    component: ToggleCard,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'A toggleable card component that can switch between view and edit modes. Includes context providers for conditional rendering of edit and summary content.',
            },
        },
    },
    tags: ['autodocs'],
    argTypes: {
        id: {
            description: 'Unique identifier for the card',
            control: 'text',
        },
        title: {
            description: 'Card title',
            control: 'text',
        },
        description: {
            description: 'Card description',
            control: 'text',
        },
        editing: {
            description: 'Whether the card is in edit mode',
            control: 'boolean',
        },
        disabled: {
            description: 'Whether the card is disabled',
            control: 'boolean',
        },
        disableEdit: {
            description: 'Whether to disable edit functionality',
            control: 'boolean',
        },
        onEdit: {
            description: 'Callback when edit is triggered',
            action: 'onEdit',
        },
        editLabel: {
            description: 'Label for the edit button',
            control: 'text',
        },
        editAction: {
            description: 'Label for the edit action button',
            control: 'text',
        },
        onEditActionClick: {
            description: 'Callback when edit action is clicked',
            action: 'onEditActionClick',
        },
        isLoading: {
            description: 'Whether the card is in loading state',
            control: 'boolean',
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
    },
    decorators: [
        // Re-key on `editing` and `isLoading` so toggling those Controls
        // remounts the wrapper. Without this, ToggleCardWrapper snapshots
        // both args into useState on first render and ignores subsequent
        // arg changes — making the Controls panel for these two props dead.
        (Story, context) => <Story key={`${String(context.args.editing)}-${String(context.args.isLoading)}`} />,
    ],
};

export default meta;
type Story = StoryObj<typeof ToggleCard>;

// Wrapper component to handle state for stories
const ToggleCardWrapper = (args: React.ComponentProps<typeof ToggleCard>) => {
    const [editing, setEditing] = useState(args.editing || false);
    const [isLoading, setIsLoading] = useState(args.isLoading || false);
    const [formData, setFormData] = useState({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1 (555) 123-4567',
    });

    const handleEdit = () => {
        setEditing(true);
        args.onEdit?.();
    };

    const handleSave = () => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setIsLoading(false);
            setEditing(false);
            args.onEditActionClick?.();
        }, 1000);
    };

    const handleCancel = () => {
        setEditing(false);
    };

    return (
        <ToggleCard
            {...args}
            editing={editing}
            isLoading={isLoading}
            onEdit={handleEdit}
            onEditActionClick={handleSave}>
            <ToggleCardSummary>
                <div className="space-y-2">
                    <div>
                        <Label className="text-sm font-medium">Name</Label>
                        <p className="text-sm">{formData.name}</p>
                    </div>
                    <div>
                        <Label className="text-sm font-medium">Email</Label>
                        <p className="text-sm">{formData.email}</p>
                    </div>
                    <div>
                        <Label className="text-sm font-medium">Phone</Label>
                        <p className="text-sm">{formData.phone}</p>
                    </div>
                </div>
            </ToggleCardSummary>

            <ToggleCardEdit>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                            id="phone"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={isLoading}>
                            Save
                        </Button>
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </ToggleCardEdit>
        </ToggleCard>
    );
};

export const Default: Story = {
    render: (args) => <ToggleCardWrapper {...args} />,
    args: {
        title: 'Contact Information',
        description: 'Manage your contact details',
        editLabel: 'Edit',
        editAction: 'Save',
    },
};

export const Disabled: Story = {
    render: (args) => <ToggleCardWrapper {...args} />,
    args: {
        title: 'Account Settings',
        description: 'This section is currently disabled',
        disabled: true,
        editLabel: 'Edit',
    },
};

export const DisableEdit: Story = {
    render: (args) => <ToggleCardWrapper {...args} />,
    args: {
        title: 'Read-Only Information',
        description: 'This information cannot be edited',
        disableEdit: true,
        editLabel: 'Edit',
    },
};

export const Editing: Story = {
    render: (args) => <ToggleCardWrapper {...args} />,
    args: {
        title: 'Contact Information',
        description: 'Edit your contact details',
        editing: true,
        editLabel: 'Edit',
        editAction: 'Save',
    },
};

export const Loading: Story = {
    render: (args) => <ToggleCardWrapper {...args} />,
    args: {
        title: 'Processing',
        description: 'Saving your changes...',
        isLoading: true,
        editLabel: 'Edit',
        editAction: 'Save',
    },
};

export const StaticView: Story = {
    args: {
        title: 'Static Information',
        description: 'This card cannot be edited',
        disabled: true,
        children: (
            <div className="space-y-2">
                <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <p className="text-sm">Active</p>
                </div>
                <div>
                    <Label className="text-sm font-medium">Last Updated</Label>
                    <p className="text-sm">January 15, 2024</p>
                </div>
            </div>
        ),
    },
};
