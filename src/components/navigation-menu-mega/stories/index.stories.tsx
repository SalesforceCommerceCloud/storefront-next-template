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
import type { ShopperProducts } from '@/scapi';
import CategoryNavigationMenuMega from '../index';
import { mockMegaMenuRootCategory, mockMegaMenuSubCategories } from './mock-menu-data';

// Desktop viewport — the mega menu is gated by `lg:flex` (≥1024px).
// Below that, only the hamburger button renders (mobile drawer).
const desktopViewport = {
    name: 'Desktop',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
};

const mobileViewport = {
    name: 'iPhone',
    styles: { width: '375px', height: '844px' },
    type: 'mobile' as const,
};

const subCategoriesList = mockMegaMenuSubCategories;

// Strips banner-related fields from every L1 category so the menu renders the
// no-banner branch (single column, no `<CategoryBanner>`).
function stripBanners(root: ShopperProducts.schemas['Category']): ShopperProducts.schemas['Category'] {
    return {
        ...root,
        categories: (root.categories || []).map((cat) => {
            const stripped: ShopperProducts.schemas['Category'] = { ...cat };
            delete stripped.c_headerMenuBanner;
            delete stripped.c_headerMenuOrientation;
            return stripped;
        }),
    };
}

interface MegaStoryArgs {
    showBanners: boolean;
}

const meta: Meta<MegaStoryArgs> = {
    title: 'Layout/Navigation/Navigation Menu Mega',
    tags: ['autodocs', 'interaction', 'chromatic-core'],
    parameters: {
        layout: 'fullscreen',
        viewport: {
            options: { desktop: desktopViewport },
            value: 'desktop',
            isRotated: false,
        },
        docs: {
            description: {
                component: `
Header navigation product: the responsive mega menu the storefront actually ships. Consumes the generic \`CategoryNavigationMenu\` engine (see *LAYOUT/Navigation Menu*) and configures it for the header — banner layout (vertical/horizontal driven by \`c_headerMenuOrientation\` + \`c_headerMenuBanner\`), pointer-vs-keyboard behavior on top-level triggers, and DIS image transformation on the banner HTML. Also owns the mobile experience the engine doesn't provide: hamburger button, \`MobileMenuContext\`, and \`MobileMenuDropdown\` with expandable subcategories.

Responsive breakpoints:
- **Desktop (≥1024px)**: Full-width mega menu with banners + nested categories.
- **Mobile (<1024px)**: Hamburger button + drawer. Expanding a root category shows all descendant links at once.

Pinned to a desktop viewport so the mega menu is visible. Toggle **Show banners** in the controls panel to switch between the banner branch (\`hasBanner\` true → 2-column grid + \`<CategoryBanner>\`) and the no-banner branch (single column).
                `,
            },
        },
    },
    argTypes: {
        showBanners: {
            control: 'boolean',
            description:
                'Drives `c_headerMenuBanner` / `c_headerMenuOrientation` on the L1 categories. Off → no-banner branch; On → mock banners (Women horizontal, Men vertical).',
        },
    },
    args: {
        showBanners: true,
    },
    decorators: [
        (Story) => {
            // Keep the root navigation inside the mock header, matching production:
            // <Header> sets --header-height and the fixed panel starts below it.
            return (
                <div style={{ ['--header-height' as never]: '72px' }}>
                    <div className="relative z-50 flex h-[72px] items-center bg-header-background px-8 text-header-foreground shadow-sm">
                        <Story />
                    </div>
                    <div className="min-h-[520px] bg-background" aria-hidden />
                </div>
            );
        },
    ],
    render: ({ showBanners }) => {
        const root = showBanners ? mockMegaMenuRootCategory : stripBanners(mockMegaMenuRootCategory);
        return (
            <CategoryNavigationMenuMega resolve={Promise.resolve(root)} defer={Promise.resolve(subCategoriesList)} />
        );
    },
};

export default meta;
type Story = StoryObj<MegaStoryArgs>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Wait for Suspense to flush — `WithCategoryNavigationMenu` awaits the resolve promise.
        await waitFor(() => {
            const triggers = canvasElement.querySelectorAll('[data-slot="navigation-menu-trigger"]');
            expect(triggers.length).toBeGreaterThan(0);
        });

        const menu = canvas.getByRole('navigation');
        await expect(menu).toBeInTheDocument();

        // Hover the first trigger to open the panel.
        const triggers = canvasElement.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-trigger"]');
        await userEvent.hover(triggers[0]);
        await waitFor(() => {
            const viewport = canvasElement.querySelector('[data-slot="navigation-menu-viewport"]');
            expect(viewport?.getAttribute('data-state')).toBe('open');
        });

        // Banner branch: assert the L1 banner image renders inside the open panel.
        // No-banner branch: assert the panel rendered subcategories without a banner.
        const content = canvasElement.querySelector('[data-slot="navigation-menu-content"]');
        if (args.showBanners) {
            const banner = content?.querySelector('img[alt^="Women"], img[alt^="Men"]');
            await expect(banner).toBeInTheDocument();
        } else {
            const banner = content?.querySelector('img');
            await expect(banner).toBeNull();
        }
    },
};

// Mobile (<1024px): the desktop mega menu is hidden via `lg:flex`. What renders
// instead is the hamburger button + `MobileMenuDropdown` drawer.
// `showBanners` has no effect on this branch — the mobile drawer doesn't render
// banners.
export const MobileView: Story = {
    globals: {
        viewport: { value: 'iphone', isRotated: false },
    },
    parameters: {
        viewport: {
            options: { iphone: mobileViewport },
            value: 'iphone',
            isRotated: false,
        },
        docs: {
            description: {
                story: 'Mobile breakpoint (<1024px): root categories expand to reveal all descendant category links at once.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Wait for the hamburger to render (also gated by Suspense via `WithCategoryNavigationMenu`).
        const hamburger = await waitFor(() => {
            const btn = canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Open menu"]');
            if (!btn) throw new Error('hamburger not yet rendered');
            return btn;
        });
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(hamburger);
        await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

        const drawer = canvasElement.querySelector('[aria-label="Mobile navigation menu"]');
        await expect(drawer).toBeInTheDocument();
        await expect(drawer).not.toHaveAttribute('aria-hidden', 'true');

        // Drawer surfaces the top-level Women link. Subcategory expansion is
        // gated on the `useSubCategory` store populating from the deferred promise,
        // which races with this play function in the test runner — covered by
        // unit tests in `navigation-menu-mega/index.test.tsx` instead.
        const womenLink = (drawer as HTMLElement).querySelector('a[href$="/category/womens"]');
        await expect(womenLink).toBeInTheDocument();
    },
};
