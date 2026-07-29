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
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import CategoryNavigationMenu from '../index';
import { mockMegaMenuRootCategory } from '@/components/navigation-menu-mega/stories/mock-menu-data';

const rootCategories = mockMegaMenuRootCategory.categories || [];

const meta: Meta<typeof CategoryNavigationMenu> = {
    title: 'Layout/Navigation/Navigation Menu',
    component: CategoryNavigationMenu,
    tags: ['autodocs', 'interaction', 'chromatic-core'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: [
                    'Generic, headless category-tree renderer built on the shadcn/ui `NavigationMenu` primitives. Knows nothing about header layout, banners, or mobile — it just walks a SCAPI `Category` tree and exposes slots / prop generators (`renderElement`, `propsList`, `propsContent`, etc.) so callers can shape the output.',
                    '',
                    'The header mega menu (`<CategoryNavigationMenuMega>`) is the primary consumer — production code uses the mega menu, not this directly.',
                    '',
                    'The package also exports `WithCategoryNavigationMenu`, a loader-bridging HOC that consumes a `resolve` Promise (root + first-level subcategories, suspends via `Await`) and a `defer` Promise (deeper subcategories, drained into the `SubCategoryContext` store after mount so deeper levels hydrate without suspending). Filtering (default `c_showInMenu`) is applied before children render. Behavior is covered by `index.test.tsx`; not exercised here as it has no visible Storybook output.',
                ].join('\n'),
            },
        },
    },
    args: {
        categories: rootCategories,
        maxDepth: 2,
    },
    argTypes: {
        maxDepth: {
            control: { type: 'number', min: 1, max: 4 },
            description: 'Maximum nesting depth (1 = top-level only, unlimited by default).',
        },
        categories: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof CategoryNavigationMenu>;

/**
 * Default top-level + first sub-level. Hovering a trigger opens the dropdown
 * with first-level subcategories.
 */
export const Default: Story = {
    args: {
        maxDepth: 2,
    },

    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const menu = canvas.getByRole('navigation');
        await expect(menu).toBeInTheDocument();

        const triggers = canvasElement.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-trigger"]');
        expect(triggers.length).toBeGreaterThan(0);

        await userEvent.hover(triggers[0]);
        await waitFor(() => {
            const viewport = canvasElement.querySelector('[data-slot="navigation-menu-viewport"]');
            expect(viewport?.getAttribute('data-state')).toBe('open');
        });
    },
};
