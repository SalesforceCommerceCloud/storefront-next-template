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
import PopularCategory from '../index';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';
import type { ShopperProducts } from '@/scapi';
import { mockCategories, mockCategory as mockCategoryTies } from '@/components/__mocks__/mock-data';

/**
 * ActionLogger wrapper component to capture user interactions
 */
function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logNavigate = action('navigate');
        const logClick = action('click');
        const logCategorySelect = action('category-select');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const link = target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const text = link.textContent?.trim() || '';
                event.preventDefault();

                // Log specific category selection if it's a category link
                if (href.startsWith('/category/')) {
                    const categoryId = href.replace('/category/', '');
                    logCategorySelect({ categoryId, categoryName: text, href });
                }

                logNavigate({ href, text });
                logClick({ type: 'link', href, text });
                return;
            }

            const button = target.closest('button');
            if (button) {
                const label = button.textContent?.trim() || button.getAttribute('aria-label') || '';
                logClick({ type: 'button', label });
            }
        };

        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

// Use mock data from __mocks__
const mockCategory = mockCategories.root.categories[0];
const mockCategoryWomens = mockCategoryTies;
const mockCategoryNoImage: ShopperProducts.schemas['Category'] = {
    ...mockCategory,
    image: undefined,
    c_slotBannerImage: undefined,
};

const meta: Meta<typeof PopularCategory> = {
    title: 'Home/Popular Category',
    component: PopularCategory,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Popular Category component that displays a single category card.

### Features:
- Category card with image, title, description, and shop now button
- Supports data from loader (Page Designer) or direct category prop (programmatic)
- Automatic image fallback handling
- Responsive design

### Usage Modes:
1. **With data prop**: Receives full category object from component loader (Page Designer mode)
2. **With category prop**: Accepts full category object directly (programmatic use)
3. **Fallback**: Shows empty card if no data provided
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ActionLogger>
                <div className="bg-background min-h-screen p-8">
                    <div className="max-w-md mx-auto">
                        <Story />
                    </div>
                </div>
            </ActionLogger>
        ),
    ],
    argTypes: {
        data: {
            description: 'Full category object from loader (Page Designer mode)',
            control: 'object',
        },
        category: {
            description: 'Full category object for programmatic use',
            control: 'object',
        },
    },
};

export default meta;
type Story = StoryObj<typeof PopularCategory>;

/**
 * Default story with category data from loader
 */
export const Default: Story = {
    args: {
        data: mockCategory,
    },
    parameters: {
        docs: {
            description: {
                story: 'Standard popular category card with full category data from loader (Page Designer mode).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const title = await canvas.findByText('Mens', {}, { timeout: 3000 });
        await expect(title).toBeInTheDocument();

        // Description is hidden by default
        await expect(canvas.queryByText(/men's range/i)).not.toBeInTheDocument();

        const shopNowButton = await canvas.findByText(/shop now/i, {}, { timeout: 3000 });
        await expect(shopNowButton).toBeInTheDocument();

        const link = canvas.getByRole('link', { name: /mens/i });
        await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/category/mens`);
    },
};

/**
 * Category with programmatic category prop
 */
export const WithCategoryProp: Story = {
    args: {
        category: mockCategoryWomens,
    },
    parameters: {
        docs: {
            description: {
                story: 'Category card using category prop (programmatic use, not from loader).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Ties')).toBeInTheDocument();
        // Description hidden by default
        await expect(canvas.queryByText(/shop mens's ties/i)).not.toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: /ties/i })).toHaveAttribute(
            'href',
            `${SITE_PREFIX}/category/mens-accessories-ties`
        );
    },
};

/**
 * Category without image (fallback to hero image)
 */
export const WithoutImage: Story = {
    args: {
        data: mockCategoryNoImage,
    },
    parameters: {
        docs: {
            description: {
                story: 'Category card without image - uses fallback hero image.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Mens')).toBeInTheDocument();
        // Image should still be present (fallback)
        const image = canvas.getByRole('img');
        await expect(image).toBeInTheDocument();
    },
};

/**
 * Fallback state (no data)
 */
export const Fallback: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story: 'Category card in fallback state when no data is provided — renders nothing.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Component returns null when no data is provided
        await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    },
};

/**
 * Interactive test - testing user interactions
 */
export const InteractionTest: Story = {
    args: {
        data: mockCategory,
    },
    parameters: {
        docs: {
            description: {
                story: 'Interactive test story for verifying user interactions with category card.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render
        const title = await canvas.findByText('Mens', {}, { timeout: 3000 });
        await expect(title).toBeInTheDocument();

        // Find the category card link
        const card = canvas.getByRole('link', { name: /mens/i });
        await expect(card).toBeInTheDocument();

        // Hover over the card without following the link (navigation would break Storybook)
        await userEvent.hover(card);

        await expect(canvas.getByText('Mens')).toBeInTheDocument();
        await expect(canvas.getByRole('img')).toBeInTheDocument();
    },
};
