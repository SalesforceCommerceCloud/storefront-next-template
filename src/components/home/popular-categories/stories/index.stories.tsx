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
import PopularCategories from '../index';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { mockPopularCategories, mockCategoriesNoImages, mockManyCategoriesCategories } from '../__mocks__/categories';

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

const meta: Meta<typeof PopularCategories> = {
    title: 'Home/Popular Categories',
    component: PopularCategories,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Popular Categories component that displays a grid of category cards.

### Features:
- Responsive grid layout (2 columns on mobile, 4 on desktop)
- Category cards with images, titles, and descriptions
- Shop Now buttons for each category
- Suspense and loading states
- Supports multiple data sources (promise, direct data, or component loader)

### Usage Modes:
1. **With categoriesPromise**: Receives pre-fetched categories from route loader
2. **With data prop**: Receives categories from Page Designer component loader
3. **With parentId**: Triggers component loader to fetch categories (used in Page Designer)
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ActionLogger>
                <div className="bg-background min-h-screen">
                    <Story />
                </div>
            </ActionLogger>
        ),
    ],
    argTypes: {
        categoriesPromise: {
            description: 'Promise that resolves to an array of categories',
            control: false,
        },
        data: {
            description: 'Direct category data (bypasses promise)',
            control: 'object',
        },
        parentId: {
            description: 'Parent category ID for component loader',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof PopularCategories>;

/**
 * Default story with promise-based data loading
 */
export const Default: Story = {
    render: () => <PopularCategories categoriesPromise={Promise.resolve(mockPopularCategories)} />,
    parameters: {
        docs: {
            description: {
                story: 'Standard popular categories component displaying 4 category cards with full data including images and descriptions.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for categories to load (Suspense/Await)
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify title is rendered
        const title = await canvas.findByText('Style for Real Life', {}, { timeout: 3000 });
        await expect(title).toBeInTheDocument();

        // Check for category cards (they should be rendered by ContentCard)
        const shopNowButtons = await canvas.findAllByText(/shop now/i, {}, { timeout: 5000 });
        await expect(shopNowButtons.length).toBe(4);

        // Verify category names are displayed
        await expect(canvas.getByText('Jewelry')).toBeInTheDocument();
        await expect(canvas.getByText('Clothing')).toBeInTheDocument();
        await expect(canvas.getByText('Electronics')).toBeInTheDocument();
        await expect(canvas.getByText('Home & Living')).toBeInTheDocument();
    },
};

/**
 * Loading state story
 */
export const Loading: Story = {
    args: {
        categoriesPromise: new Promise(() => {
            // Never resolves to show loading state
        }),
    },
    parameters: {
        docs: {
            description: {
                story: 'Popular categories in loading state, displaying skeleton placeholders.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for skeleton to appear (Suspense fallback)
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Check for skeleton elements - Skeleton component uses animate-pulse class
        const skeletons = canvasElement.querySelectorAll('[class*="animate-pulse"]');

        // If animate-pulse not found, check for Skeleton component's bg-muted class
        if (skeletons.length === 0) {
            const skeletonElements = canvasElement.querySelectorAll('[class*="bg-muted"]');
            await expect(skeletonElements.length).toBeGreaterThan(0);
        } else {
            await expect(skeletons.length).toBeGreaterThan(0);
        }
    },
};

/**
 * Direct data (no promise) - as would be used in Page Designer
 */
export const WithDirectData: Story = {
    args: {
        data: mockPopularCategories,
    },
    parameters: {
        docs: {
            description: {
                story: 'Categories provided directly via data prop (no promise) - typical for Page Designer component loader usage.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Should render immediately without loading state
        await expect(canvas.getByText('Style for Real Life')).toBeInTheDocument();
        await expect(canvas.getByText('Jewelry')).toBeInTheDocument();
    },
};

/**
 * Categories without images (fallback to default hero image)
 */
export const WithoutImages: Story = {
    args: {
        data: mockCategoriesNoImages,
    },
    parameters: {
        docs: {
            description: {
                story: 'Categories without image URLs - will use fallback hero image.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Should still render all categories
        const categoryCards = canvas.getAllByText(/shop now/i);
        await expect(categoryCards.length).toBe(4);
    },
};

/**
 * More than 4 categories (component renders all provided categories)
 */
export const MoreThanFourCategories: Story = {
    args: {
        data: mockManyCategoriesCategories,
    },
    parameters: {
        docs: {
            description: {
                story: 'Component with 6 categories provided - renders all categories in a scrollable container.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Should display all 6 categories
        const shopNowButtons = canvas.getAllByText(/shop now/i);
        await expect(shopNowButtons.length).toBe(6);

        // Verify all categories are displayed
        await expect(canvas.getByText('Jewelry')).toBeInTheDocument();
        await expect(canvas.getByText('Clothing')).toBeInTheDocument();
        await expect(canvas.getByText('Electronics')).toBeInTheDocument();
        await expect(canvas.getByText('Home & Living')).toBeInTheDocument();
        await expect(canvas.getByText('Sports & Outdoors')).toBeInTheDocument();
        await expect(canvas.getByText('Beauty & Health')).toBeInTheDocument();
    },
};

/**
 * Custom subtitle only (title falls back to i18n default)
 */
export const WithCustomSubtitle: Story = {
    args: {
        data: mockPopularCategories,
        subtitle: 'Discover pieces that match your style',
    },
    parameters: {
        docs: {
            description: {
                story: 'Popular categories with a custom subtitle while the title falls back to the i18n default.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Style for Real Life')).toBeInTheDocument();
        await expect(canvas.getByText('Discover pieces that match your style')).toBeInTheDocument();
    },
};

/**
 * Custom title and subtitle
 */
export const CustomTitle: Story = {
    args: {
        data: mockPopularCategories,
        title: 'Shop by Category',
        subtitle: 'Discover our curated collections designed for your lifestyle',
    },
    parameters: {
        docs: {
            description: {
                story: 'Popular categories with custom title and subtitle configured via Page Designer attributes.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify custom title is rendered
        await expect(canvas.getByText('Shop by Category')).toBeInTheDocument();

        // Verify custom subtitle is rendered
        await expect(
            canvas.getByText('Discover our curated collections designed for your lifestyle')
        ).toBeInTheDocument();

        // Verify categories still render correctly
        const shopNowButtons = await canvas.findAllByText(/shop now/i, {}, { timeout: 5000 });
        await expect(shopNowButtons.length).toBe(4);
    },
};

/**
 * Empty categories array
 */
export const Empty: Story = {
    args: {
        data: [],
    },
    parameters: {
        docs: {
            description: {
                story: 'Component with empty categories array - renders the section wrapper but no content.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // No title or category cards should render when data is empty
        await expect(canvas.queryByText('Style for Real Life')).not.toBeInTheDocument();
        const shopNowButtons = canvas.queryAllByText(/shop now/i);
        await expect(shopNowButtons.length).toBe(0);
    },
};

/**
 * No props state
 */
export const SkeletonState: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story: 'Component with no props - renders the section wrapper but no content (use Loading story for skeleton state).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // With no props, the component renders the section wrapper but no content
        const section = canvasElement.querySelector('section');
        await expect(section).toBeInTheDocument();

        // No title or categories should be rendered
        const canvas = within(canvasElement);
        await expect(canvas.queryByText('Style for Real Life')).not.toBeInTheDocument();
        const shopNowButtons = canvas.queryAllByText(/shop now/i);
        await expect(shopNowButtons.length).toBe(0);
    },
};

/**
 * Interactive test - testing user interactions with category cards
 */
export const InteractionTest: Story = {
    args: {
        data: mockPopularCategories,
    },
    parameters: {
        docs: {
            description: {
                story: 'Interactive test story for verifying user interactions with category cards.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for component to render
        const title = await canvas.findByText('Style for Real Life', {}, { timeout: 3000 });
        await expect(title).toBeInTheDocument();

        // Find all "Shop Now" buttons/links - these are the category links
        const shopNowButtons = await canvas.findAllByText(/shop now/i, {}, { timeout: 5000 });
        await expect(shopNowButtons.length).toBe(4);

        // Verify category cards are present (each category card is a link)
        const categoryItems = await canvas.findAllByRole('link', {}, { timeout: 5000 });
        await expect(categoryItems.length).toBeGreaterThan(0);

        // Test clicking the first category's shop button
        const firstShopButton = shopNowButtons[0];
        await userEvent.click(firstShopButton);

        // Test hovering over a category card
        const firstCategoryCard = categoryItems[0];
        await userEvent.hover(firstCategoryCard);

        // Click on a specific category name
        const jewelryCategory = canvas.getByText('Jewelry');
        await userEvent.click(jewelryCategory);

        // Descriptions are hidden by default (showDescription defaults to false)
        await expect(canvas.queryByText(/elegant jewelry pieces/i)).not.toBeInTheDocument();
        await expect(canvas.queryByText(/stylish and comfortable/i)).not.toBeInTheDocument();
    },
};
