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
import { allModes } from '../../../../.storybook/modes';
import CategoryBreadcrumbs from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperProducts } from '@/scapi';

// ---------------------------------------------------------------------------
// CategoryBreadcrumbs receives a SCAPI Category and renders one link per item
// in `parentCategoryTree` (plus a Home link). The visible variations are:
//   - the depth of the tree (1 link, a few links, deep enough to wrap)
//   - the text of the leaf category
// Both fold into Controls — `depth` selects how many levels render,
// `leafCategoryName` overrides the final breadcrumb's label so QA can verify
// long-name wrapping without hand-editing fixtures.
// ---------------------------------------------------------------------------

type SyntheticArgs = {
    depth: number;
    leafCategoryName: string;
};

const PATH = ['Mens', 'Clothing', 'Tops', 'Shirts', 'Casual Shirts', 'Long Sleeve'];

function buildCategory({ depth, leafCategoryName }: SyntheticArgs): ShopperProducts.schemas['Category'] {
    const clamped = Math.max(1, Math.min(depth, PATH.length));
    const tree = PATH.slice(0, clamped).map((name, idx) => ({
        id: `cat-${idx}-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
    }));
    if (leafCategoryName) {
        tree[tree.length - 1] = { ...tree[tree.length - 1], name: leafCategoryName };
    }
    const leaf = tree[tree.length - 1];
    return {
        id: leaf.id,
        name: leaf.name,
        parentCategoryTree: tree,
    };
}

const meta: Meta<typeof CategoryBreadcrumbs> = {
    title: 'Category/Category Breadcrumbs',
    component: CategoryBreadcrumbs,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'padded',
        docs: {
            description: {
                component: `
Hierarchical breadcrumb navigation. Renders a Home link followed by one link per
entry in \`category.parentCategoryTree\`, separated by chevron icons.

Use the Controls panel to adjust the breadcrumb depth and the leaf's label —
both visible variations are toggleable from one place.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="p-4">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;
type StoryWithSynthetic = StoryObj<React.ComponentType<Partial<SyntheticArgs>>>;

/**
 * Rich-but-realistic baseline: a 3-level mens-clothing breadcrumb. Increase
 * `depth` to see deeper hierarchies wrap on smaller viewports; set it to 1 to
 * see the single-category case. Use `leafCategoryName` to verify long-name
 * wrapping at the leaf.
 */
export const FullyFeatured: StoryWithSynthetic = {
    args: {
        depth: 3,
        leafCategoryName: '',
    },
    argTypes: {
        depth: {
            description: 'Synthetic: number of levels in the breadcrumb tree (1–6)',
            control: { type: 'number', min: 1, max: 6, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        leafCategoryName: {
            description: 'Synthetic: override the leaf breadcrumb label (empty = use the path default)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            depth: args.depth ?? 3,
            leafCategoryName: args.leafCategoryName ?? '',
        };
        return <CategoryBreadcrumbs category={buildCategory(synthetic)} />;
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const nav = canvas.getByRole('navigation', { name: /breadcrumb/i });
        await expect(nav).toBeInTheDocument();
        const links = canvas.getAllByRole('link');
        const expectedDepth = args.depth ?? 3;
        // Home link + one link per tree node
        await expect(links).toHaveLength(1 + Math.max(1, Math.min(expectedDepth, PATH.length)));
    },
};

/**
 * Single category — no parent tree. Renders Home + one link only, no chevron
 * separators between siblings. Distinct enough from the FullyFeatured layout
 * to be worth a bookmarkable URL.
 */
export const SingleCategory: Story = {
    args: {
        category: {
            id: 'womens',
            name: 'Womens',
            parentCategoryTree: [{ id: 'womens', name: 'Womens' }],
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Top-level category with no parents. Renders Home + the leaf only.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const links = canvas.getAllByRole('link');
        await expect(links).toHaveLength(2);
        await expect(links[0]).toHaveTextContent('Home');
        await expect(links[1]).toHaveTextContent('Womens');
    },
};
