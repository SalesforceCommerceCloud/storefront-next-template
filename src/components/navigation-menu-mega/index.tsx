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
import {
    createContext,
    useContext,
    useState,
    useCallback,
    Suspense,
    type ComponentPropsWithoutRef,
    type ReactElement,
    type ReactNode,
} from 'react';
import { Await } from 'react-router';
import { NavLink } from '@/components/link';
import { useNavigate } from '@/hooks/use-navigate';
import type { ShopperProducts } from '@/scapi';
import CategoryNavigationMenu, { WithCategoryNavigationMenu } from '@/components/navigation-menu';
import { Button } from '@/components/ui/button';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toImageUrl, transformHtmlImageUrls } from '@/lib/images/dynamic-image';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { NavigationMenuLink } from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';
import { useSubCategory } from '@/components/navigation-menu/context';
import { routes, routeHref } from '@/route-paths';
import { Component } from '@/lib/decorators/component';
import { RegionDefinition } from '@/lib/decorators';
import { getRegionIds } from '@/lib/decorators/region-definition';
import { EmbeddedComponentRegion } from '@/components/region/embedded-component-region';
import type { ComponentWithComponentData } from '@/lib/page-designer/component-loader.server';

@Component('megaMenu', {
    name: 'Mega Menu',
    group: 'Layout',
    description: 'Site-wide mega menu with per-category dropdown panel content slots',
    embedded: true,
    component_id: 'mega-menu',
})
@RegionDefinition([
    // One region per top-level category, keyed by category id via the `region_<id>` convention.
    // Edit this list to match your catalog's top-level category ids. Must stay an array literal —
    // the cartridge generator extracts regions via AST and only handles array-literal arguments.
    { id: 'region_women', name: 'Women' },
    { id: 'region_men', name: 'Men' },
    { id: 'region_kids', name: 'Kids' },
])
// oxlint-disable-next-line react-refresh/only-export-components
export class MegaMenuMetadata {}

/**
 * Declared mega-menu region ids, derived from the `@RegionDefinition` decorator above so the
 * decorator list is the single source of truth. A top-level category renders its region when
 * `region_${category.id}` is present in this set.
 */
export const MEGA_MENU_REGION_IDS: ReadonlySet<string> = new Set(getRegionIds(MegaMenuMetadata));

/**
 * Resolves the embedded-component region id for a top-level category, or `undefined` when the
 * category has no mapped region (no embedded component, no category id, or the derived
 * `region_${categoryId}` is not declared in {@link MEGA_MENU_REGION_IDS}). Pure and exported so the
 * per-category mapping can be unit-tested without mounting the lazily-rendered dropdown panel.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveMegaMenuRegionId(
    categoryId: string | undefined,
    hasEmbeddedComponent: boolean,
    regionIds: ReadonlySet<string> = MEGA_MENU_REGION_IDS
): string | undefined {
    if (!hasEmbeddedComponent || categoryId === undefined) return undefined;
    const regionId = `region_${categoryId}`;
    return regionIds.has(regionId) ? regionId : undefined;
}

interface MobileMenuContextType {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
    categories: ShopperProducts.schemas['Category'][];
}

const MobileMenuContext = createContext<MobileMenuContextType | null>(null);

// oxlint-disable-next-line react-refresh/only-export-components
export function useMobileMenu() {
    return useContext(MobileMenuContext);
}

function hasBanner(category?: ShopperProducts.schemas['Category']): category is ShopperProducts.schemas['Category'] {
    return typeof category?.c_headerMenuBanner === 'string' && category?.c_headerMenuBanner?.length > 0;
}

function isVertical(category?: ShopperProducts.schemas['Category']): category is ShopperProducts.schemas['Category'] {
    // Default to vertical if not set
    if (!category?.c_headerMenuOrientation) {
        return true;
    }
    // Only horizontal if explicitly set to "horizontal"
    return String(category.c_headerMenuOrientation).toLowerCase() !== 'horizontal';
}

function CategoryBanner({
    category,
    ...props
}: ComponentPropsWithoutRef<'a'> & { category: ShopperProducts.schemas['Category'] }) {
    const config = useConfig();
    const imageSrc = toImageUrl({ src: (category?.c_slotBannerImage as string) ?? '', config });

    // Transform any image URLs in the HTML banner to use DIS with WebP optimization
    const transformedBannerHtml = transformHtmlImageUrls((category.c_headerMenuBanner as string) || '', config);

    return (
        <NavigationMenuLink asChild>
            <NavLink {...props} to={routeHref(routes.category, { categoryId: category.id })}>
                {imageSrc ? (
                    <img
                        className="object-contain w-full max-w-full max-h-[512px]"
                        src={imageSrc}
                        alt={category.name}
                    />
                ) : (
                    // oxlint-disable-next-line react/no-danger
                    <div className="ml-auto" dangerouslySetInnerHTML={{ __html: transformedBannerHtml }} />
                )}
            </NavLink>
        </NavigationMenuLink>
    );
}

/**
 * True when the resolved embedded component actually holds authored content in `regionId`.
 * A declared-but-empty region returns false so the panel can fall through to the banner.
 * Pure and exported so the region-vs-banner precedence can be unit-tested without mounting
 * the lazily-rendered dropdown.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function regionHasContent(resolved: ComponentWithComponentData | null, regionId: string): boolean {
    return (resolved?.regions?.find((r) => r.id === regionId)?.components?.length ?? 0) > 0;
}

/**
 * Right-column "featured content" for a top-level category's dropdown panel.
 *
 * Precedence: a populated embedded region (`region_<category.id>`) wins; otherwise the
 * legacy `c_headerMenuBanner`; otherwise nothing.
 *
 * A *declared but empty* region must NOT win over the banner and must NOT emit a labelled
 * `<aside>` — a complementary landmark with no content is screen-reader noise (WCAG 1.3.1).
 * Because the embedded component is streamed from the loader, whether a region actually
 * holds authored content is only known once the promise resolves, so the populated check
 * (`regionHasContent`) happens inside Await. Design-mode authoring of these regions runs
 * through the mini-PD component-preview route (page mode), not this slot, so no design-mode
 * branch is needed here.
 */
function MegaMenuFeaturedSlot({
    category,
    regionId,
    embeddedComponent,
    label,
}: {
    category: ShopperProducts.schemas['Category'];
    regionId: string | undefined;
    embeddedComponent: EmbeddedMegaMenuComponent;
    label: string;
}): ReactNode {
    const bannerSlot = hasBanner(category) ? (
        <aside className="self-stretch" aria-label={label}>
            <CategoryBanner category={category} />
        </aside>
    ) : null;

    // No region mapped for this category (or no embedded component was fetched):
    // the banner is the only possible featured content.
    if (!regionId || embeddedComponent === undefined) {
        return bannerSlot;
    }

    const renderResolved = (resolved: ComponentWithComponentData | null): ReactNode => {
        if (!regionHasContent(resolved, regionId)) {
            return bannerSlot;
        }
        return (
            <aside className="self-stretch" aria-label={label}>
                <EmbeddedComponentRegion component={resolved} regionId={regionId} />
            </aside>
        );
    };

    if (embeddedComponent instanceof Promise) {
        // Below-the-fold panel; the promise is fetched at route load and is almost always
        // resolved before the dropdown opens, so `fallback={null}` avoids a banner→region flash.
        return (
            <Suspense fallback={null}>
                <Await resolve={embeddedComponent} errorElement={bannerSlot}>
                    {renderResolved}
                </Await>
            </Suspense>
        );
    }
    return renderResolved(embeddedComponent);
}

function hasSubcategories(category: ShopperProducts.schemas['Category']): boolean {
    return (
        typeof category.onlineSubCategoriesCount === 'number' &&
        category.onlineSubCategoriesCount > 0 &&
        Array.isArray(category.categories) &&
        category.categories.length > 0
    );
}

function MobileMenuCategory({
    category: rawCategory,
    expandedCategories,
    onToggle,
    onNavigate,
}: {
    category: ShopperProducts.schemas['Category'];
    expandedCategories: Set<string>;
    onToggle: (categoryId: string) => void;
    onNavigate: () => void;
}): ReactElement {
    const { t } = useTranslation('header');
    const enrichedCategory = useSubCategory(rawCategory.id);
    const category = enrichedCategory ?? rawCategory;
    const hasChildren = hasSubcategories(category);
    const isExpanded = expandedCategories.has(category.id);

    const renderSubcategoryLinks = (
        subcategories: ShopperProducts.schemas['Category'][] | undefined,
        level = 1
    ): ReactElement[] =>
        subcategories?.map((subcategory) => (
            <li key={subcategory.id}>
                <NavLink
                    to={routeHref(routes.category, { categoryId: subcategory.id })}
                    onClick={onNavigate}
                    className={cn(
                        'block py-2 text-sm font-medium hover:opacity-70 transition-opacity',
                        level > 1 && 'text-header-foreground/80'
                    )}>
                    {subcategory.name}
                </NavLink>
                {subcategory.categories?.length ? (
                    <ul className="pl-4 space-y-1">{renderSubcategoryLinks(subcategory.categories, level + 1)}</ul>
                ) : null}
            </li>
        )) ?? [];

    return (
        <li>
            <div className="flex items-center justify-between">
                <NavLink
                    to={routeHref(routes.category, { categoryId: category.id })}
                    onClick={onNavigate}
                    className="flex-1 py-3 text-base font-medium hover:opacity-70 transition-opacity">
                    {category.name}
                </NavLink>

                {hasChildren && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggle(category.id)}
                        className="ml-2 p-2 h-auto shrink-0 hover:bg-transparent hover:opacity-50 transition-opacity"
                        aria-label={
                            isExpanded
                                ? t('collapseCategory', {
                                      category: category.name,
                                      defaultValue: `Collapse ${category.name}`,
                                  })
                                : t('expandCategory', {
                                      category: category.name,
                                      defaultValue: `Expand ${category.name}`,
                                  })
                        }
                        aria-expanded={isExpanded}>
                        <ChevronDown
                            className={cn('size-5 transition-transform duration-200', {
                                'rotate-180': isExpanded,
                            })}
                        />
                    </Button>
                )}
            </div>

            {hasChildren && isExpanded && (
                <ul className="pl-4 pb-2 space-y-1 border-l border-header-foreground/10">
                    {renderSubcategoryLinks(category.categories)}
                </ul>
            )}
        </li>
    );
}

/**
 * MobileMenuDropdown - Renders the mobile menu dropdown content with expandable subcategories
 * Uses absolute positioning (relative to header) to automatically appear below the header
 * regardless of header height changes. No hardcoded values needed.
 */
export function MobileMenuDropdown(): ReactElement | null {
    const context = useMobileMenu();
    const { t } = useTranslation('header');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // Mount the category list only while the menu is open. Each MobileMenuCategory subscribes to the sub-category
    // store via useSubCategory (useSyncExternalStore). Keeping that subtree mounted while the menu is closed puts the
    // subscribers in the SSR/hydration tree, so the post-hydration store fill re-renders the header and cascades into
    // a whole-page flicker. Gating the mount on `isOpen` keeps the subscribers out of the initial render — matching
    // the desktop mega panel, whose subscribers live inside the lazily-mounted Radix content.
    if (!context || !context.isOpen) {
        return null;
    }

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    };

    return (
        <div className="lg:hidden absolute left-0 right-0 top-full bg-header-background text-header-foreground shadow-lg z-40 max-h-[70vh] overflow-y-auto">
            <nav className="px-4 py-4" aria-label={t('mobileNavigation', 'Mobile navigation menu')}>
                <ul className="space-y-1">
                    {context.categories.map((category) => (
                        <MobileMenuCategory
                            key={category.id}
                            category={category}
                            expandedCategories={expandedCategories}
                            onToggle={toggleCategory}
                            onNavigate={context.close}
                        />
                    ))}
                </ul>
            </nav>
        </div>
    );
}

type EmbeddedMegaMenuComponent = ComponentWithComponentData | Promise<ComponentWithComponentData | null> | undefined;

interface ResponsiveNavigationMenuProps extends ComponentPropsWithoutRef<typeof WithCategoryNavigationMenu> {
    /**
     * Embedded mega-menu Page Designer component fetched by the route loader via
     * `fetchComponentWithComponentData({ componentId: 'mega-menu' })`. A top-level category whose
     * id matches a declared region (`region_${category.id}`, e.g. `region_womens`) renders that
     * region in its dropdown panel; merchants place content blocks (image, hero, etc.) into those
     * regions in Page Designer. Categories without a matching region fall back to the header banner.
     */
    embeddedComponent?: EmbeddedMegaMenuComponent;
}

/**
 * ResponsiveNavigationMenu - A unified responsive navigation component
 *
 * This component uses CSS and Tailwind to adapt the same navigation structure
 * for both mobile and desktop:
 * - On mobile (< 1024px): Hamburger button with expandable vertical menu
 * - On desktop (>= 1024px): Horizontal mega menu with dropdown navigation
 *
 * The component renders a single navigation structure with responsive classes
 * controlling layout, visibility, and interaction patterns. This minimizes DOM bloat
 * while maintaining SSR compatibility.
 *
 * @param props - Component props
 * @param props.resolve - Promise resolving to root categories and first-level subcategories
 * @param props.defer - Promise resolving to deeper subcategory data for prefetch
 * @param props.embeddedComponent - Optional Page Designer 'mega-menu' component data
 * @returns A responsive navigation component with CSS-controlled responsive behavior
 */
export default function ResponsiveNavigationMenu({
    resolve,
    defer,
    embeddedComponent,
}: ResponsiveNavigationMenuProps): ReactElement {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { t } = useTranslation('header');
    const navigate = useNavigate();

    const defaultListStyle = {
        width: '100%',
        maxWidth: '100%',
    };

    // Handler for top-level category clicks
    const handleTopLevelClick = useCallback(
        (categoryId: string) => {
            void navigate(routeHref(routes.category, { categoryId }));
        },
        [navigate]
    );

    // Element props generator
    const getElementProps = useCallback(
        ({
            level,
            category,
            isLeaf,
        }: {
            level: number;
            category: ShopperProducts.schemas['Category'];
            isLeaf?: boolean;
        }) => {
            const isSubcategory = level >= 1;
            const isClickableParent = level === 0 && !isLeaf && category.id;

            return {
                className: cn(
                    'text-sm font-medium leading-5',
                    isSubcategory &&
                        'hover:!bg-transparent focus:!bg-transparent hover:!text-header-menu-foreground/60 focus:!text-header-menu-foreground/60 transition-colors'
                ),
                ...(isClickableParent && {
                    // Use onPointerDown instead of onClick for mouse-only navigation.
                    // This preserves keyboard accessibility: Enter/Space on the trigger
                    // expands the dropdown (Radix behavior), while mouse clicks navigate
                    // to the category page. Without this guard, keyboard users would be
                    // forced to navigate without being able to explore subcategories.
                    onPointerDown: (e: React.PointerEvent) => {
                        if (e.pointerType === 'mouse') {
                            handleTopLevelClick(category.id);
                        }
                    },
                }),
            };
        },
        [handleTopLevelClick]
    );

    return (
        <WithCategoryNavigationMenu resolve={resolve} defer={defer}>
            {({ categories }) => {
                const mobileMenuContext: MobileMenuContextType = {
                    isOpen: mobileMenuOpen,
                    toggle: () => setMobileMenuOpen(!mobileMenuOpen),
                    close: () => setMobileMenuOpen(false),
                    categories,
                };

                const regionIdFor = (categoryId: string | undefined): string | undefined =>
                    resolveMegaMenuRegionId(categoryId, embeddedComponent !== undefined);

                return (
                    <MobileMenuContext.Provider value={mobileMenuContext}>
                        {/* Mobile: Hamburger button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={mobileMenuContext.toggle}
                            className="lg:hidden hover:bg-transparent hover:opacity-50 transition-opacity"
                            aria-label={mobileMenuOpen ? t('closeMenu', 'Close menu') : t('openMenu', 'Open menu')}
                            aria-expanded={mobileMenuOpen}>
                            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                        </Button>

                        {/* Desktop: Mega menu (always rendered, hidden on mobile with CSS) */}
                        <div className="hidden lg:flex items-center h-full">
                            <CategoryNavigationMenu
                                categories={categories}
                                delayDuration={0}
                                propsViewport={() => ({
                                    className:
                                        ' border-0 shadow-lg [&[data-state=open]]:animate-[menuSlideDown_0.15s_ease-in] [&[data-state=closed]]:animate-none will-change-transform',
                                    // Anchor the fixed panel to both viewport edges via `left: 0` + `right: 0`
                                    // so its width matches the layout viewport, *excluding* the scrollbar gutter.
                                    // Using `width: 100vw` instead would include the scrollbar and overshoot
                                    // any in-flow content (e.g. the header) by the scrollbar's width.
                                    style: {
                                        position: 'fixed',
                                        top: 'var(--header-height)',
                                        left: 0,
                                        right: 0,
                                    },
                                })}
                                propsContentContainer={() => ({
                                    className:
                                        '!p-0 !left-auto !right-auto !w-full md:!w-full !animate-none !transition-none',
                                })}
                                propsContent={({ category }) => {
                                    const hasRegion = regionIdFor(category.id) !== undefined;
                                    const showRightColumn = hasRegion || hasBanner(category);
                                    return {
                                        className: cn(
                                            'section-container pb-6',
                                            showRightColumn &&
                                                (isVertical(category)
                                                    ? 'grid md:grid-cols-[1fr_.3fr] items-start'
                                                    : 'grid md:grid-cols-[1fr_.6fr] items-start')
                                        ),
                                    };
                                }}
                                propsList={({ parent, categories: subCategories, level }) => {
                                    if (level === 1) {
                                        if (isVertical(parent)) {
                                            return {
                                                style: defaultListStyle,
                                                className: 'flex flex-col gap-0 p-0',
                                            };
                                        }
                                        return {
                                            style: {
                                                ...defaultListStyle,
                                                gridTemplateColumns: `repeat(${subCategories.length}, minmax(0, 1fr))`,
                                            },
                                            className: 'grid p-0',
                                        };
                                    }
                                }}
                                propsElement={getElementProps}
                                renderSlotListAfter={({ level, parent }) => {
                                    if (level !== 1 || !parent) return null;
                                    // The dropdown renders multiple complementary landmarks (one per open
                                    // category), so each <aside> needs a distinct accessible name for screen
                                    // reader users to tell them apart (WCAG 1.3.1). Categories with neither a
                                    // populated region nor a banner render nothing — an empty landmark would
                                    // only add screen reader noise (handled inside MegaMenuFeaturedSlot).
                                    return (
                                        <MegaMenuFeaturedSlot
                                            category={parent}
                                            regionId={regionIdFor(parent.id)}
                                            embeddedComponent={embeddedComponent}
                                            label={t('featuredContent', {
                                                category: parent.name,
                                                defaultValue: `${parent.name} featured content`,
                                            })}
                                        />
                                    );
                                }}
                            />
                        </div>

                        {/* Mobile: Menu dropdown (rendered here to be inside provider) */}
                        <MobileMenuDropdown />
                    </MobileMenuContext.Provider>
                );
            }}
        </WithCategoryNavigationMenu>
    );
}
