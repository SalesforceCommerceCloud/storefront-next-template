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
    type ComponentPropsWithoutRef,
    type ReactElement,
} from 'react';
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
 * @returns A responsive navigation component with CSS-controlled responsive behavior
 */
export default function ResponsiveNavigationMenu({
    resolve,
    defer,
}: ComponentPropsWithoutRef<typeof WithCategoryNavigationMenu>): ReactElement {
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
                                propsContent={({ category }) => ({
                                    className: cn(
                                        'section-container pb-6',
                                        hasBanner(category) &&
                                            (isVertical(category)
                                                ? 'grid md:grid-cols-[1fr_.3fr] items-start'
                                                : 'grid md:grid-cols-[1fr_.6fr] items-start')
                                    ),
                                })}
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
                                    if (level === 1 && hasBanner(parent)) {
                                        return (
                                            <aside className="self-stretch">
                                                <CategoryBanner category={parent} />
                                            </aside>
                                        );
                                    }
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
