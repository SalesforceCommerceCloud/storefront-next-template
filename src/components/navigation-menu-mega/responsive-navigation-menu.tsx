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
    useLayoutEffect,
    Suspense,
    type ComponentPropsWithoutRef,
    type ReactElement,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Await } from 'react-router';
import { NavLink } from '@/components/link';
import type { ShopperProducts } from '@/scapi';
import CategoryNavigationMenu, {
    WithCategoryNavigationMenu,
    type CategoryItemsFilter,
} from '@/components/navigation-menu';
import { Button } from '@/components/ui/button';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toImageUrl, transformHtmlImageUrls } from '@/lib/images/dynamic-image';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { NavigationMenuLink } from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';
import { useSubCategory } from '@/components/navigation-menu/context';
import { createCategoryUrl } from '@/route-paths';
import { useSeoUrlContext } from '@/hooks/use-seo-url-context';
import { EmbeddedComponentRegion } from '@/components/region/embedded-component-region';
import type { ComponentWithComponentData } from '@/lib/page-designer/component-loader.server';

type EmbeddedMegaMenuComponent = ComponentWithComponentData | Promise<ComponentWithComponentData | null> | undefined;

type CategoryField = Extract<keyof ShopperProducts.schemas['Category'], string>;

export type MegaMenuCategoryFields = {
    contentField?: CategoryField;
    imageField?: CategoryField;
    orientationField?: CategoryField;
};

const DEFAULT_MEGA_MENU_CATEGORY_FIELDS: MegaMenuCategoryFields = {
    contentField: 'c_headerMenuBanner',
    imageField: 'c_slotBannerImage',
    orientationField: 'c_headerMenuOrientation',
};

/**
 * Resolves the embedded-component region id for a top-level category, or `undefined` when the
 * category has no mapped region (no embedded component, no category id, or the derived region id is
 * not declared in the provided `regionIds` set). Pure and exported so the per-category mapping can be
 * unit-tested without mounting the lazily-rendered dropdown panel.
 *
 * Page Designer region ids must match `^[\w]+$`, but category ids can contain characters that don't —
 * e.g. hyphenated cgids like `limited-editions` or `shop-by-price`. Non-word characters are therefore
 * normalized to `_` to form `region_<id>`, matching the sanitized ids declared in `@RegionDefinition`.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared pure helper co-located with the engine component
export function resolveMegaMenuRegionId(
    categoryId: string | undefined,
    hasEmbeddedComponent: boolean,
    regionIds: ReadonlySet<string>
): string | undefined {
    if (!hasEmbeddedComponent || categoryId === undefined) return undefined;
    const regionId = `region_${categoryId.replace(/[^\w]/g, '_')}`;
    return regionIds.has(regionId) ? regionId : undefined;
}

interface MobileMenuContextType {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
    categories: ShopperProducts.schemas['Category'][];
}

const MobileMenuContext = createContext<MobileMenuContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- shared hook co-located with the engine component
export function useMobileMenu() {
    return useContext(MobileMenuContext);
}

/**
 * Canonical banner-detection predicate: a top-level category has featured banner content when its
 * `c_headerMenuBanner` (banner HTML) is a non-empty string. Exported so the default can be
 * unit-tested and so a vertical can compose it in its own {@link ResponsiveNavigationMenuProps.hasBanner}.
 *
 * `CategoryBanner` renders whichever of `c_slotBannerImage` (image) or `c_headerMenuBanner` (HTML) is
 * present, but a category driven *only* by `c_slotBannerImage` is a vertical-specific arrangement
 * (e.g. luxury maps `category.image` onto it): such verticals pass a widened predicate rather than
 * changing this shared default, so other verticals are unaffected.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared pure helper co-located with the engine component
export function categoryHasBanner(category?: ShopperProducts.schemas['Category']): boolean {
    return typeof category?.c_headerMenuBanner === 'string' && category.c_headerMenuBanner.length > 0;
}

function getStringField(
    category: ShopperProducts.schemas['Category'] | undefined,
    field: MegaMenuCategoryFields[keyof MegaMenuCategoryFields]
): string | undefined {
    const value = field ? category?.[field] : undefined;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function configuredCategoryHasBanner(
    category: ShopperProducts.schemas['Category'] | undefined,
    fields: MegaMenuCategoryFields
): boolean {
    return Boolean(getStringField(category, fields.contentField) || getStringField(category, fields.imageField));
}

function isVertical(
    category: ShopperProducts.schemas['Category'] | undefined,
    fields: MegaMenuCategoryFields
): boolean {
    const orientation = fields.orientationField ? category?.[fields.orientationField] : undefined;
    // Default to vertical if not set
    if (!orientation) {
        return true;
    }
    // Only horizontal if explicitly set to "horizontal"
    return String(orientation).toLowerCase() !== 'horizontal';
}

function CategoryBanner({
    category,
    fields,
    ...props
}: ComponentPropsWithoutRef<'a'> & {
    category: ShopperProducts.schemas['Category'];
    fields: MegaMenuCategoryFields;
}) {
    const config = useConfig();
    const seoUrlContext = useSeoUrlContext();
    const imageSrc = toImageUrl({ src: getStringField(category, fields.imageField), config });

    // Transform any image URLs in the HTML banner to use DIS with WebP optimization
    const transformedBannerHtml = transformHtmlImageUrls(getStringField(category, fields.contentField) ?? '', config);

    return (
        <NavigationMenuLink asChild>
            <NavLink {...props} to={createCategoryUrl({ categoryId: category.id, slugSegments: [] }, seoUrlContext)}>
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
// eslint-disable-next-line react-refresh/only-export-components -- shared pure helper co-located with the engine component
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
    hasBanner,
    fields,
}: {
    category: ShopperProducts.schemas['Category'];
    regionId: string | undefined;
    embeddedComponent: EmbeddedMegaMenuComponent;
    label: string;
    hasBanner: (category?: ShopperProducts.schemas['Category']) => boolean;
    fields: MegaMenuCategoryFields;
}): ReactNode {
    const bannerSlot = hasBanner(category) ? (
        <aside className="self-stretch" aria-label={label}>
            <CategoryBanner category={category} fields={fields} />
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

function ShopAllCategoryLink({ category }: { category: ShopperProducts.schemas['Category'] }): ReactElement {
    const { t } = useTranslation('header');
    const seoUrlContext = useSeoUrlContext();
    return (
        <NavigationMenuLink asChild>
            <NavLink
                to={createCategoryUrl({ categoryId: category.id, slugSegments: [] }, seoUrlContext)}
                // When the panel has a featured column it is a 2-col grid whose other
                // children are the submenu list and the banner/region aside. Span both
                // columns so this link sits on its own row above them and the list and
                // banner stay side by side. On panels with no featured column the
                // container is not a grid, so col-span is inert.
                className="block md:col-span-2 text-sm font-medium leading-5 underline underline-offset-4 hover:!bg-transparent focus:!bg-transparent hover:!text-header-menu-foreground/60 focus:!text-header-menu-foreground/60 transition-colors">
                {t('shopAllCategory', {
                    category: category.name,
                    defaultValue: `Shop all ${category.name}`,
                })}
            </NavLink>
        </NavigationMenuLink>
    );
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
    const seoUrlContext = useSeoUrlContext();
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
                    to={createCategoryUrl({ categoryId: subcategory.id, slugSegments: [] }, seoUrlContext)}
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
                    to={createCategoryUrl({ categoryId: category.id, slugSegments: [] }, seoUrlContext)}
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
 * MobileMenuDropdown - Renders the mobile menu dropdown content with expandable subcategories.
 * Uses absolute positioning (relative to header) to automatically appear below the header
 * regardless of header height changes. No hardcoded values needed.
 */
export function MobileMenuDropdown({ portalSlot }: { portalSlot?: string }): ReactElement | null {
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

    const dropdown = (
        <div
            {...(portalSlot ? { 'data-slot': portalSlot } : {})}
            className={cn(
                'absolute top-full z-40 max-h-[70vh] overflow-y-auto bg-header-background text-header-foreground shadow-lg lg:hidden',
                portalSlot ? 'right-[calc(-1*var(--page-gutter))] left-[calc(-1*var(--page-gutter))]' : 'left-0 right-0'
            )}>
            <nav
                className={cn('py-4', portalSlot ? 'px-[var(--page-gutter)]' : 'px-4')}
                aria-label={t('mobileNavigation', 'Mobile navigation menu')}>
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

    return dropdown;
}

/**
 * Portal wrapper that renders children into a named slot on the page, or inline if the slot
 * doesn't exist. Uses `useLayoutEffect` to ensure the portal host is found before rendering.
 */
function Portal({ slotName, children }: { slotName: string; children: ReactElement }): ReactElement | null {
    const [host, setHost] = useState<HTMLElement | null>(null);
    const [ready, setReady] = useState(false);

    useLayoutEffect(() => {
        setHost(document.querySelector<HTMLElement>(`[data-slot="${slotName}"]`));
        setReady(true);
    }, [slotName]);

    if (!ready) return null;
    if (host) return createPortal(children, host);
    return children;
}

export interface ResponsiveNavigationMenuProps extends ComponentPropsWithoutRef<typeof WithCategoryNavigationMenu> {
    /**
     * Embedded mega-menu Page Designer component fetched by the route loader via
     * `fetchComponentWithComponentData({ componentId: 'mega-menu' })`. A top-level category whose
     * id matches a declared region (`region_${category.id}`, e.g. `region_womens`) renders that
     * region in its dropdown panel; merchants place content blocks (image, hero, etc.) into those
     * regions in Page Designer. Categories without a matching region fall back to the header banner.
     */
    embeddedComponent?: EmbeddedMegaMenuComponent;

    /**
     * Declared mega-menu region IDs. A top-level category renders its region when
     * `region_${category.id}` is present in this set.
     */
    regionIds: ReadonlySet<string>;

    /**
     * Optional portal slot names for catalog, utility, and mobile-menu sections. When a name is
     * provided, the corresponding section is marked with that `data-slot` (and the catalog/utility
     * sections are rendered into the named portal target via `createPortal`). When absent, sections
     * render inline (canonical behavior). Slot names are supplied by the vertical rather than
     * hard-coded here so the engine stays vertical-agnostic.
     */
    portalSlots?: { catalog?: string; utility?: string; mobileMenu?: string };

    /**
     * Optional filter to apply to the root categories. Categories that do not pass this filter
     * are excluded from the catalog navigation menu (but not from the mobile menu).
     */
    categoryFilter?: (category: ShopperProducts.schemas['Category']) => boolean;

    /**
     * Category field or predicate used to filter menu items at every rendered navigation level.
     * Route loaders using response projection must include every field read by a predicate.
     */
    itemsFilter?: CategoryItemsFilter;

    /** Category fields used for the desktop featured-content column and its orientation. */
    megaMenu?: MegaMenuCategoryFields;

    /**
     * Optional predicate deciding whether a top-level category renders a featured banner in its
     * dropdown panel. Defaults to {@link categoryHasBanner} (the canonical `c_headerMenuBanner`
     * rule). A vertical that sources the banner from a different attribute passes its own predicate,
     * keeping that widening out of the shared engine so other verticals are unaffected.
     */
    hasBanner?: (category?: ShopperProducts.schemas['Category']) => boolean;

    /**
     * Optional utility content to render in the utility portal slot. Only used when
     * `portalSlots.utility` is provided. Typed as a single element to match the `Portal` host.
     */
    utilityContent?: ReactElement;
}

/**
 * Preserve the header row's responsive dimensions while the root navigation data suspends.
 * The desktop placeholder fills the stable navigation slot so resolving the menu cannot
 * redistribute the header's remaining horizontal space during hydration.
 */
function ResponsiveNavigationMenuFallback(): ReactElement {
    return (
        <>
            <div aria-hidden="true" className="lg:hidden size-9 shrink-0" />
            <div aria-hidden="true" className="hidden lg:block h-full w-full" />
        </>
    );
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
 * @param props.regionIds - Declared mega-menu region IDs for this vertical
 * @param props.extraNavLinks - Optional extra navigation links for utility section
 * @param props.portalSlots - Optional portal slot names for catalog, utility, and mobile-menu sections
 * @param props.categoryFilter - Optional filter for root categories
 * @param props.itemsFilter - Optional category field or predicate used to filter navigation items
 * @param props.megaMenu - Optional category fields used for the desktop featured-content column
 * @param props.hasBanner - Optional predicate for whether a category shows a featured banner
 * @param props.utilityContent - Optional utility content to render in the utility portal slot
 * @returns A responsive navigation component with CSS-controlled responsive behavior
 */
export default function ResponsiveNavigationMenu({
    resolve,
    defer,
    embeddedComponent,
    regionIds,
    portalSlots,
    categoryFilter,
    itemsFilter,
    megaMenu = DEFAULT_MEGA_MENU_CATEGORY_FIELDS,
    hasBanner,
    utilityContent,
}: ResponsiveNavigationMenuProps): ReactElement {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { t } = useTranslation('header');

    const defaultListStyle = {
        width: '100%',
        maxWidth: '100%',
    };
    const categoryBannerPredicate = hasBanner ?? ((category) => configuredCategoryHasBanner(category, megaMenu));

    // Element props generator
    const getElementProps = useCallback(
        ({ level }: { level: number; category: ShopperProducts.schemas['Category']; isLeaf?: boolean }) => {
            const isSubcategory = level >= 1;

            // A top-level category that has a submenu renders as a disclosure trigger
            // (a button with aria-expanded). Activating it opens the submenu for both
            // mouse and keyboard, so the action always matches the announced role.
            // We deliberately do not navigate on activation: a control announced as
            // "expandable" that also changes context on click fails WCAG 3.2.2
            // (Context changes on input). The category landing page stays reachable
            // through the panel's links and banner.
            return {
                className: cn(
                    'text-sm font-medium leading-5',
                    isSubcategory &&
                        'hover:!bg-transparent focus:!bg-transparent hover:!text-header-menu-foreground/60 focus:!text-header-menu-foreground/60 transition-colors'
                ),
            };
        },
        []
    );

    return (
        <WithCategoryNavigationMenu
            resolve={resolve}
            defer={defer}
            itemsFilter={itemsFilter}
            fallback={<ResponsiveNavigationMenuFallback />}>
            {({ categories }) => {
                const mobileMenuContext: MobileMenuContextType = {
                    isOpen: mobileMenuOpen,
                    toggle: () => setMobileMenuOpen(!mobileMenuOpen),
                    close: () => setMobileMenuOpen(false),
                    categories,
                };

                const regionIdFor = (categoryId: string | undefined): string | undefined =>
                    resolveMegaMenuRegionId(categoryId, embeddedComponent !== undefined, regionIds);

                // Apply optional filter to catalog categories
                const catalogCategories = categoryFilter ? categories.filter(categoryFilter) : categories;

                const catalogMenu = (
                    <div
                        className={
                            portalSlots?.catalog
                                ? 'w-full hidden lg:block'
                                : 'hidden lg:flex h-full w-full items-center'
                        }
                        {...(portalSlots?.catalog ? { 'data-testid': `${portalSlots.catalog}-nav` } : {})}>
                        <CategoryNavigationMenu
                            categories={catalogCategories}
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
                                    top: portalSlots?.catalog
                                        ? 'calc(var(--header-height) - 1px)'
                                        : 'var(--header-height)',
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
                                const showRightColumn = hasRegion || categoryBannerPredicate(category);
                                return {
                                    className: cn(
                                        portalSlots?.catalog ? 'section-container pt-5 pb-8' : 'section-container pb-6',
                                        showRightColumn &&
                                            (isVertical(category, megaMenu)
                                                ? 'grid md:grid-cols-[1fr_.3fr] items-start'
                                                : 'grid md:grid-cols-[1fr_.6fr] items-start')
                                    ),
                                };
                            }}
                            propsList={({ parent, categories: subCategories, level }) => {
                                if (level === 1) {
                                    if (isVertical(parent, megaMenu)) {
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
                            renderSlotListBefore={({ level, parent }) => {
                                // The top-level trigger only opens the panel (it never
                                // navigates, per WCAG 3.2.2). Give every panel an explicit
                                // link to the parent category's landing page so it stays
                                // reachable whether or not the category has a banner.
                                if (level === 1 && parent) {
                                    return <ShopAllCategoryLink category={parent} />;
                                }
                            }}
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
                                        hasBanner={categoryBannerPredicate}
                                        fields={megaMenu}
                                        label={t('featuredContent', {
                                            category: parent.name,
                                            defaultValue: `${parent.name} featured content`,
                                        })}
                                    />
                                );
                            }}
                        />
                    </div>
                );

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

                        {/* Desktop: Utility links (optional, portaled or skipped) */}
                        {utilityContent && portalSlots?.utility ? (
                            <Portal slotName={portalSlots.utility}>{utilityContent}</Portal>
                        ) : null}

                        {/* Desktop: Catalog navigation menu (portaled or inline) */}
                        {portalSlots?.catalog ? (
                            <Portal slotName={portalSlots.catalog}>{catalogMenu}</Portal>
                        ) : (
                            catalogMenu
                        )}

                        {/* Mobile: Menu dropdown (rendered here to be inside provider). The slot name,
                            when present, comes from the vertical's portalSlots config — the engine
                            does not name any vertical. */}
                        <MobileMenuDropdown portalSlot={portalSlots?.mobileMenu} />
                    </MobileMenuContext.Provider>
                );
            }}
        </WithCategoryNavigationMenu>
    );
}
