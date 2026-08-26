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
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import 'reflect-metadata';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import ResponsiveNavigationMenu, {
    MEGA_MENU_REGION_IDS,
    MegaMenuMetadata,
    regionHasContent,
    resolveMegaMenuRegionId,
} from './index';
import type { ComponentWithComponentData } from '@/lib/page-designer/component-loader.server';
import { getRegionDefinitions } from '@/lib/decorators/region-definition';
import type { ShopperProducts } from '@/scapi';

const mockCategories: ShopperProducts.schemas['Category'] = {
    id: 'root',
    name: 'Root Category',
    categories: [
        {
            id: 'cat-1',
            name: 'Category 1',
            c_showInMenu: true,
            onlineSubCategoriesCount: 2,
            categories: [
                {
                    id: 'cat-1-1',
                    name: 'Subcategory 1.1',
                    c_showInMenu: true,
                    onlineSubCategoriesCount: 1,
                    categories: [{ id: 'cat-1-1-1', name: 'Nested Subcategory 1.1.1', c_showInMenu: true }],
                },
                { id: 'cat-1-2', name: 'Subcategory 1.2', c_showInMenu: true },
            ],
        },
        {
            id: 'cat-2',
            name: 'Category 2',
            c_showInMenu: true,
            onlineSubCategoriesCount: 1,
            categories: [{ id: 'cat-2-1', name: 'Subcategory 2.1', c_showInMenu: true }],
        },
        {
            id: 'cat-3',
            name: 'Category 3 (Leaf)',
            c_showInMenu: true,
            onlineSubCategoriesCount: 0,
        },
    ],
};

describe('ResponsiveNavigationMenu Component', () => {
    // No useNavigate mock: the WCAG 3.2.2 guard below asserts against the real
    // memory-router location, so activating the trigger has to actually move the
    // router (or not). A stubbed navigate would swallow the call and let that
    // assertion pass even against the regression it is meant to catch.
    const renderComponent = (props: Partial<React.ComponentProps<typeof ResponsiveNavigationMenu>> = {}) => {
        const router = createMemoryRouter(
            [
                {
                    path: '*',
                    element: (
                        <AllProvidersWrapper>
                            <ResponsiveNavigationMenu
                                resolve={Promise.resolve(mockCategories)}
                                defer={Promise.resolve([])}
                                {...props}
                            />
                        </AllProvidersWrapper>
                    ),
                },
                {
                    path: '/category/:id',
                    element: <div>Category Page</div>,
                },
            ],
            { initialEntries: ['/'] }
        );
        return { ...render(<RouterProvider router={router} />), router };
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Basic Rendering', () => {
        it('should render component without errors', () => {
            const { container } = renderComponent();
            expect(container).toBeInTheDocument();
        });

        it('should render mobile hamburger button', async () => {
            const { getByRole } = renderComponent();

            await waitFor(() => {
                expect(getByRole('button', { name: /open menu/i })).toBeInTheDocument();
            });
        });

        it('should handle empty categories array', async () => {
            const { container } = renderComponent({
                resolve: Promise.resolve({ id: 'root', name: 'Root', categories: [] }),
            });

            await waitFor(() => {
                // Component should handle empty categories gracefully
                expect(container).toBeInTheDocument();
            });
        });
    });

    describe('Mobile Menu', () => {
        it('should render mobile menu structure', async () => {
            const { getByRole, container } = renderComponent();

            await waitFor(() => {
                expect(getByRole('button', { name: /open menu/i })).toBeInTheDocument();
            });

            const hamburgerButton = getByRole('button', { name: /open menu/i });

            // Open menu
            act(() => {
                fireEvent.click(hamburgerButton);
            });

            // Mobile navigation should be present
            await waitFor(() => {
                const mobileNav = container.querySelector('[aria-label="Mobile navigation menu"]');
                expect(mobileNav).toBeInTheDocument();
            });
        });

        it('should show all nested mobile menu descendants after expanding a root category', async () => {
            const rootWithDeferredChildren: ShopperProducts.schemas['Category'] = {
                id: 'root',
                name: 'Root Category',
                categories: [
                    {
                        id: 'cat-1',
                        name: 'Category 1',
                        c_showInMenu: true,
                        onlineSubCategoriesCount: 2,
                    },
                ],
            };
            const enrichedCategory: ShopperProducts.schemas['Category'] = mockCategories.categories?.[0] ?? {
                id: 'cat-1',
                name: 'Category 1',
                c_showInMenu: true,
                onlineSubCategoriesCount: 0,
            };
            const { getByRole } = renderComponent({
                resolve: Promise.resolve(rootWithDeferredChildren),
                defer: Promise.resolve([enrichedCategory]),
            });

            await waitFor(() => {
                expect(getByRole('button', { name: /open menu/i })).toBeInTheDocument();
            });

            act(() => {
                fireEvent.click(getByRole('button', { name: /open menu/i }));
            });

            await waitFor(() => {
                expect(getByRole('button', { name: /expand category 1/i })).toBeInTheDocument();
            });

            act(() => {
                fireEvent.click(getByRole('button', { name: /expand category 1/i }));
            });

            await waitFor(() => {
                expect(getByRole('link', { name: /^subcategory 1\.1$/i })).toBeInTheDocument();
            });

            await waitFor(() => {
                expect(getByRole('link', { name: /^nested subcategory 1\.1\.1$/i })).toBeInTheDocument();
            });

            expect(() => getByRole('button', { name: /expand subcategory 1\.1/i })).toThrow();
        });
    });

    describe('Hydration', () => {
        it('does not mount the subscribing category subtree while the menu is closed', async () => {
            const { getByRole, queryByRole, container } = renderComponent();

            await waitFor(() => {
                expect(getByRole('button', { name: /open menu/i })).toBeInTheDocument();
            });

            // While closed, the mobile category list must not be mounted. Each MobileMenuCategory subscribes to the
            // sub-category store via useSubCategory (useSyncExternalStore). If it stays mounted while hidden, the
            // post-hydration store update re-renders the header and cascades into a whole-page flicker. Mounting it
            // only on open keeps the subscribers out of the SSR/hydration tree.
            expect(container.querySelector('[aria-label="Mobile navigation menu"]')).not.toBeInTheDocument();
            expect(queryByRole('link', { name: /^category 1$/i })).not.toBeInTheDocument();

            // Opening the menu mounts the subscribing subtree on demand.
            act(() => {
                fireEvent.click(getByRole('button', { name: /open menu/i }));
            });

            await waitFor(() => {
                expect(container.querySelector('[aria-label="Mobile navigation menu"]')).toBeInTheDocument();
            });
            expect(getByRole('link', { name: /^category 1$/i })).toBeInTheDocument();
        });
    });

    describe('Context changes on input (WCAG 3.2.2)', () => {
        // A top-level category that has a submenu renders as a disclosure trigger
        // (a button announced with aria-expanded). Activating it must only open the
        // submenu, never navigate. A control announced as "expandable" that also
        // changes context on activation fails WCAG 3.2.2. The regression removed here
        // was a mouse-only onPointerDown handler that navigated, so the guard fires a
        // real mouse pointer sequence and asserts the router never left the entry URL.
        it('opens the submenu on mouse activation without changing context', async () => {
            const { container, router } = renderComponent();

            // Top-level branch categories resolve asynchronously and render as
            // Radix triggers tagged data-has-submenu.
            let trigger: HTMLElement | null = null;
            await waitFor(() => {
                trigger = container.querySelector<HTMLElement>('button[data-has-submenu="true"]');
                expect(trigger).not.toBeNull();
            });

            expect(trigger).toHaveAttribute('aria-expanded', 'false');
            expect(router.state.location.pathname).toBe('/');

            // Drive the same mouse pointer sequence the removed handler responded to
            // (pointerdown with pointerType "mouse"), then the click that opens the
            // Radix disclosure.
            act(() => {
                fireEvent.pointerDown(trigger as unknown as HTMLElement, { pointerType: 'mouse', button: 0 });
                fireEvent.pointerUp(trigger as unknown as HTMLElement, { pointerType: 'mouse', button: 0 });
                fireEvent.click(trigger as unknown as HTMLElement);
            });

            await waitFor(() => {
                expect(trigger).toHaveAttribute('aria-expanded', 'true');
            });
            // The disclosure opened; the router must not have navigated to the
            // category landing page. Reaching it stays a job for the panel's links.
            expect(router.state.location.pathname).toBe('/');
        });
    });

    describe('Promise Handling', () => {
        it('preserves responsive header-row height while root categories are pending', () => {
            const { container } = renderComponent({
                resolve: new Promise<ShopperProducts.schemas['Category']>(() => undefined),
            });

            expect(container.querySelector('[aria-hidden="true"][class~="size-9"]')).toBeInTheDocument();
            const desktopFallback = container.querySelector('[aria-hidden="true"][class~="lg:block"]');
            expect(desktopFallback).toHaveClass('h-full', 'w-full');
        });

        it('should handle rejected resolve promise gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            renderComponent({
                resolve: Promise.reject(new Error('Failed to load categories')),
            });

            // Component should not crash
            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalled();
            });

            consoleSpy.mockRestore();
        });
    });

    describe('resolveMegaMenuRegionId', () => {
        it('maps a declared category id to its region', () => {
            expect(resolveMegaMenuRegionId('women', true)).toBe('region_women');
            expect(resolveMegaMenuRegionId('men', true)).toBe('region_men');
            expect(resolveMegaMenuRegionId('kids', true)).toBe('region_kids');
        });

        it('returns undefined for a category with no declared region', () => {
            expect(resolveMegaMenuRegionId('sale', true)).toBeUndefined();
        });

        it('returns undefined when there is no embedded component', () => {
            expect(resolveMegaMenuRegionId('women', false)).toBeUndefined();
        });

        it('returns undefined for an undefined category id', () => {
            expect(resolveMegaMenuRegionId(undefined, true)).toBeUndefined();
        });

        it('does not double-prefix a category id that already starts with region_', () => {
            // A category literally named `region_men` derives `region_region_men`, which is not declared.
            expect(resolveMegaMenuRegionId('region_men', true)).toBeUndefined();
        });

        it('derives the region id from the live MEGA_MENU_REGION_IDS set (guards the region_ prefix)', () => {
            // Every declared region must be reachable from its category id via the region_<id> convention.
            // If the prefix or derivation ever drifts from the declared ids, this fails.
            for (const regionId of MEGA_MENU_REGION_IDS) {
                const categoryId = regionId.replace(/^region_/, '');
                expect(resolveMegaMenuRegionId(categoryId, true)).toBe(regionId);
            }
        });
    });
});

describe('regionHasContent', () => {
    const componentWith = (components: unknown[]): ComponentWithComponentData =>
        ({
            id: 'mega-menu',
            typeId: 'commerce_layouts.mega-menu',
            regions: [{ id: 'region_women', components }],
        }) as unknown as ComponentWithComponentData;

    it('is true when the region holds at least one authored component', () => {
        expect(regionHasContent(componentWith([{ id: 'c1' }]), 'region_women')).toBe(true);
    });

    it('is false for a declared-but-empty region (so the panel falls through to the banner)', () => {
        // This is the starter default: regions are declared for authoring but ship empty.
        expect(regionHasContent(componentWith([]), 'region_women')).toBe(false);
    });

    it('is false when the region is not present on the resolved component', () => {
        expect(regionHasContent(componentWith([{ id: 'c1' }]), 'region_men')).toBe(false);
    });

    it('is false when the component resolved to null', () => {
        expect(regionHasContent(null, 'region_women')).toBe(false);
    });
});

describe('MegaMenuMetadata', () => {
    it('declares one named region per starter category', () => {
        const definitions = getRegionDefinitions(MegaMenuMetadata);
        expect(definitions.map((def) => def.id)).toEqual(['region_women', 'region_men', 'region_kids']);
    });

    it('exposes the declared region ids as MEGA_MENU_REGION_IDS', () => {
        expect([...MEGA_MENU_REGION_IDS].sort()).toEqual(['region_kids', 'region_men', 'region_women']);
    });
});
