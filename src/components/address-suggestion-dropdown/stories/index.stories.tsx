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
import type { ComponentType } from 'react';
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect, fn, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import AddressSuggestionDropdown, { type AddressSuggestion } from '../index';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

// ---------------------------------------------------------------------------
// AddressSuggestionDropdown renders Google Places suggestions in a dropdown.
// Visible variations come from:
//   - the number of suggestions
//   - whether each suggestion has `description` (fast path) or only
//     `structured_formatting` (fallback path)
//   - isLoading (spinner + text instead of suggestion list)
//   - isVisible (null branch — renders nothing)
//   - position ('absolute' / 'relative' / 'fixed')
// The component returns null when isVisible is false or suggestions is empty,
// so the "empty" state is invisible by design (verified via the isVisible
// toggle in Playground).
// ---------------------------------------------------------------------------

const SAMPLE_SUGGESTIONS: AddressSuggestion[] = [
    {
        description: '123 Main Street, New York, NY 10001, USA',
        place_id: 'ChIJd8BlQ2BZwokRNTq_mLNULnw',
        structured_formatting: {
            main_text: '123 Main Street',
            secondary_text: 'New York, NY 10001, USA',
        },
    },
    {
        description: '456 Oak Avenue, Los Angeles, CA 90001, USA',
        place_id: 'ChIJE9on3F3HwoAR9AhGJW_fL-I',
        structured_formatting: {
            main_text: '456 Oak Avenue',
            secondary_text: 'Los Angeles, CA 90001, USA',
        },
    },
    {
        description: '789 Pine Road, Chicago, IL 60601, USA',
        place_id: 'ChIJr4aB_FZDD4gRzC4kp_ECXRI',
        structured_formatting: {
            main_text: '789 Pine Road',
            secondary_text: 'Chicago, IL 60601, USA',
        },
    },
    {
        description: '101 California Street, San Francisco, CA 94111, USA',
        place_id: 'ChIJU5RwT_iAhYAR1LTVQ9XmJgU',
        structured_formatting: {
            main_text: '101 California Street',
            secondary_text: 'San Francisco, CA 94111, USA',
        },
    },
    {
        description: '500 5th Avenue, New York, NY 10110, USA',
        place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        structured_formatting: {
            main_text: '500 5th Avenue',
            secondary_text: 'New York, NY 10110, USA',
        },
    },
];

type Position = 'absolute' | 'relative' | 'fixed';

type SyntheticArgs = {
    count: 1 | 2 | 3 | 5;
    withDescription: boolean;
    isVisible: boolean;
    isLoading: boolean;
    position: Position;
};

const PLAYGROUND_DEFAULTS: SyntheticArgs = {
    count: 3,
    withDescription: true,
    isVisible: true,
    isLoading: false,
    position: 'absolute',
};

function buildSuggestions({
    count,
    withDescription,
}: Pick<SyntheticArgs, 'count' | 'withDescription'>): AddressSuggestion[] {
    return SAMPLE_SUGGESTIONS.slice(0, count).map((s) => ({
        ...s,
        description: withDescription ? s.description : undefined,
    }));
}

function renderDropdown(args: Partial<SyntheticArgs>) {
    const merged: SyntheticArgs = { ...PLAYGROUND_DEFAULTS, ...args };
    return (
        <AddressSuggestionDropdown
            suggestions={buildSuggestions(merged)}
            isVisible={merged.isVisible}
            isLoading={merged.isLoading}
            position={merged.position}
            onClose={action('onClose')}
            onSelectSuggestion={action('onSelectSuggestion')}
        />
    );
}

const meta: Meta<typeof AddressSuggestionDropdown> = {
    title: 'Components/AddressSuggestionDropdown',
    component: AddressSuggestionDropdown,
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
Displays Google Places API address suggestions in a dropdown anchored below an address
input. Purely presentational — receives suggestions as props and fires callbacks on
selection or close. Used by AddressFormFields for shipping and billing autocomplete.

The Playground story drives the visible-state toggles (count of suggestions, description-vs-structured-formatting display path, isLoading, isVisible, position). The component
returns null when isVisible is false or suggestions is empty, so toggling \`isVisible\`
off renders nothing — that's the "empty/hidden" state by design. The Loading story
remains dedicated because it's the most distinct branch (spinner + text, no
suggestion list at all) and its play function locks in the regression catch that the
loading state never accidentally renders the suggestion items.
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
    decorators: [
        (Story) => (
            <CheckoutActionLogger name="address-suggestion-dropdown">
                <Story />
            </CheckoutActionLogger>
        ),
        (Story) => (
            <div className="max-w-md relative min-h-[400px]">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Enter an address..."
                        className="w-full px-4 py-2 border border-border rounded-none"
                        readOnly
                        aria-label="Address input"
                    />
                    <Story />
                </div>
            </div>
        ),
    ],
    argTypes: {
        suggestions: { table: { disable: true } },
        onClose: { table: { disable: true } },
        onSelectSuggestion: { table: { disable: true } },
        className: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;
type SyntheticStory = StoryObj<ComponentType<Partial<SyntheticArgs>>>;

/**
 * Playground: 3 suggestions with full descriptions, dropdown visible, no
 * spinner, absolute-positioned. Toggle `count` to surface 1- and 5-result
 * lists, flip `withDescription` off to exercise the structured-formatting
 * fallback path, flip `isVisible` off to hit the null branch.
 */
export const Playground: SyntheticStory = {
    args: PLAYGROUND_DEFAULTS,
    argTypes: {
        count: {
            description: 'Number of suggestions to render.',
            control: 'select',
            options: [1, 2, 3, 5],
            table: { category: 'Synthetic (data shape)' },
        },
        withDescription: {
            description:
                "Use each suggestion's `description`. When off, suggestions are stripped of `description` so the component falls back to `structured_formatting.main_text + secondary_text`.",
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        isVisible: {
            description:
                'When false, the component returns null. Use this to verify the hide branch (the user sees nothing).',
            control: 'boolean',
        },
        isLoading: {
            description: 'When true, shows a spinner + "Loading suggestions..." instead of the suggestion list.',
            control: 'boolean',
        },
        position: {
            description: 'CSS positioning of the dropdown card.',
            control: 'radio',
            options: ['absolute', 'relative', 'fixed'] satisfies Position[],
        },
    },
    render: renderDropdown,
};

/**
 * Loading state: spinner + "Loading suggestions..." with no suggestion items.
 * Locks in that the loading branch never accidentally renders the list.
 */
export const Loading: Story = {
    render: () => renderDropdown({ isLoading: true }),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Loading suggestions...')).toBeInTheDocument();
        await expect(canvas.queryByText('123 Main Street, New York, NY 10001, USA')).not.toBeInTheDocument();
        await expect(canvas.queryByTestId('address-suggestion-dropdown')).not.toBeInTheDocument();
    },
};

/**
 * Selection archetype (dropdown / suggestion list). Clicking a suggestion row
 * fires `onSelectSuggestion` with that exact suggestion; clicking the header X
 * fires `onClose`. Both are pure callbacks — the dropdown is presentational, so
 * this drives no network, navigation, or route action. The callbacks are spies
 * passed via `args` (not `action()`) so the play function can assert the
 * payloads directly.
 */
export const SelectSuggestion: Story = {
    args: {
        suggestions: SAMPLE_SUGGESTIONS.slice(0, 3),
        isVisible: true,
        onSelectSuggestion: fn(),
        onClose: fn(),
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Clicking a suggestion row fires onSelectSuggestion with that suggestion.
        const secondSuggestion = canvas.getByText('456 Oak Avenue, Los Angeles, CA 90001, USA');
        await userEvent.click(secondSuggestion);
        await expect(args.onSelectSuggestion).toHaveBeenCalledTimes(1);
        await expect(args.onSelectSuggestion).toHaveBeenCalledWith(
            expect.objectContaining({ place_id: 'ChIJE9on3F3HwoAR9AhGJW_fL-I' })
        );

        // Clicking the header close button fires onClose (and not another selection).
        await userEvent.click(canvas.getByRole('button', { name: /close/i }));
        await expect(args.onClose).toHaveBeenCalledTimes(1);
        await expect(args.onSelectSuggestion).toHaveBeenCalledTimes(1);
    },
};
