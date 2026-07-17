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
import SearchBar from '../search';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ComponentType, type ReactNode, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

// ---------------------------------------------------------------------------
// SearchBar is the header search input — combobox + suggestions popover. The
// component is parameter-less; visible state is driven entirely by what the
// user types (and what the search-suggestions hook returns). Story variation
// folds into a single synthetic arg `initialQuery` that pre-types text into
// the input via the play function.
// ---------------------------------------------------------------------------

function SearchStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logInput = action('header-search-input');
        const logSubmit = action('header-search-submit');
        const logFocus = action('header-search-focus');

        const handleInput = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;
            if (target instanceof HTMLInputElement && target.type === 'text') {
                logInput({ value: target.value });
            }
        };

        const handleSubmit = (event: SubmitEvent) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || !root.contains(form)) return;
            event.preventDefault();
            const input = form.querySelector<HTMLInputElement>('input[type="text"]');
            if (input) {
                logSubmit({ query: input.value });
            }
        };

        const handleFocus = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;
            if (target instanceof HTMLInputElement) {
                logFocus({});
            }
        };

        root.addEventListener('input', handleInput, true);
        root.addEventListener('submit', handleSubmit, true);
        root.addEventListener('focus', handleFocus, true);

        return () => {
            root.removeEventListener('input', handleInput, true);
            root.removeEventListener('submit', handleSubmit, true);
            root.removeEventListener('focus', handleFocus, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof SearchBar> = {
    title: 'Layout/Header/Search',
    component: SearchBar,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Header search input with suggestions popover. Combobox role + autocomplete; popover opens when the user focuses an empty input (showing recent searches) or types ≥3 characters (showing suggestion sections).',
            },
        },
    },
    decorators: [
        (Story: ComponentType) => (
            <SearchStoryHarness>
                <div className="p-8 w-full max-w-md">
                    <Story />
                </div>
            </SearchStoryHarness>
        ),
    ],
};

export default meta;

type SyntheticArgs = {
    initialQuery: string;
};

/**
 * Rich-but-realistic baseline — empty search input. Use the `initialQuery`
 * Control to pre-type text into the input via the play function (e.g.,
 * "dress" or "jacket" to trigger the suggestions popover after the
 * 3-character minimum).
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        initialQuery: '',
    },
    argTypes: {
        initialQuery: {
            description:
                'Synthetic: text typed into the input by the play function on mount. Empty = focused-but-empty state; ≥3 chars = triggers suggestions popover (mock data).',
            control: 'text',
            table: { category: 'Synthetic (initial state)' },
        },
    },
    render: () => <SearchBar />,
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const searchInput = await canvas.findByRole('combobox', {}, { timeout: 5000 });
        await expect(searchInput).toBeInTheDocument();
        await expect(searchInput).toHaveAttribute('type', 'text');
        const initialQuery = args.initialQuery ?? '';
        if (initialQuery) {
            await userEvent.type(searchInput, initialQuery);
            await expect(searchInput).toHaveValue(initialQuery);
        }
    },
};
