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
import { RadioCard, RadioCardGroup } from '../index';
import { action } from 'storybook/actions';

interface RadioCardOption {
    value: string;
    title: string;
    description: string;
    disabled?: boolean;
}

interface StoryArgs {
    options: RadioCardOption[];
    defaultValue?: string;
    disabled?: boolean;
    orientation?: 'horizontal' | 'vertical';
}

// `Meta` is intentionally untyped against `RadioCardGroup`: the story uses a
// synthetic `options` arg (mapped to <RadioCard> children in `render`) so
// designers can edit cards via Controls. JSX `children` cannot be edited as
// args, so a 1:1 typed Meta against `RadioCardGroupProps` would be misleading.
const meta: Meta<StoryArgs> = {
    title: 'Core/Forms/Radio Card',
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A radio card component group that provides a card-based selection interface for radio buttons.

### Features:
- Card-based radio selection
- Visual check indicator
- Horizontal and vertical orientations
- Disabled state support
- Keyboard navigation
                `,
            },
        },
        a11y: {
            config: {
                rules: [
                    // In isolated Storybook context, heading hierarchy is incomplete
                    // Real page provides proper h1/h2 context from page layout
                    { id: 'heading-order', enabled: false },
                ],
            },
        },
    },
    // Args are bound to the group-level props so Storybook Controls drive
    // the canvas. `options` is a synthetic story arg that maps to <RadioCard>
    // children in `render` — JSX children can't be edited via Controls.
    argTypes: {
        defaultValue: {
            control: 'text',
            description: 'The value of the option that is selected on initial render',
            table: { type: { summary: 'string' } },
        },
        disabled: {
            control: 'boolean',
            description: 'Disables the entire group',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
        orientation: {
            control: 'radio',
            options: ['vertical', 'horizontal'],
            description: 'Layout direction of the radio cards',
            table: {
                type: { summary: "'vertical' | 'horizontal'" },
                defaultValue: { summary: "'vertical'" },
            },
        },
        options: {
            control: 'object',
            description: 'Story-only arg: list of cards to render. Each entry becomes a <RadioCard>.',
            table: { type: { summary: 'RadioCardOption[]' } },
        },
    },
    args: {
        defaultValue: 'option1',
        disabled: false,
        orientation: 'vertical',
        options: [
            { value: 'option1', title: 'Option 1', description: 'This is the first option' },
            { value: 'option2', title: 'Option 2', description: 'This is the second option' },
            { value: 'option3', title: 'Option 3', description: 'This is the third option' },
        ],
    },
    render: (args) => (
        <RadioCardGroup
            defaultValue={args.defaultValue}
            disabled={args.disabled}
            orientation={args.orientation}
            onValueChange={action('value-changed')}>
            {args.options.map((opt) => (
                <RadioCard key={opt.value} value={opt.value} disabled={opt.disabled}>
                    <div>
                        <h3 className="font-semibold">{opt.title}</h3>
                        {/* text-foreground/80 keeps contrast on the selected (blue) background */}
                        <p className="text-sm text-foreground/80">{opt.description}</p>
                    </div>
                </RadioCard>
            ))}
        </RadioCardGroup>
    ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
    parameters: {
        docs: {
            story: `
Standard radio card group with vertical orientation.

### Features:
- 3 options
- First option selected by default
- Vertical layout
            `,
        },
    },
};

export const WithDisabled: Story = {
    args: {
        options: [
            { value: 'option1', title: 'Option 1', description: 'Available' },
            { value: 'option2', title: 'Option 2', description: 'Unavailable', disabled: true },
            { value: 'option3', title: 'Option 3', description: 'Available' },
        ],
    },
    parameters: {
        docs: {
            story: `
Radio card group with a disabled option.

### Features:
- One option disabled
- Visual disabled state
            `,
        },
    },
};
