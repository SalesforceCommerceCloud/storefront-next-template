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
    type ComponentProps,
    type ComponentPropsWithoutRef,
    Fragment,
    isValidElement,
    type JSX,
    type ReactNode,
} from 'react';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    navigationMenuTriggerStyle,
    NavigationMenuViewport,
} from '@/components/ui/navigation-menu';
import type { ShopperProducts } from '@/scapi';
import { NavLink } from '@/components/link';
import { useSubCategory } from './context';
import { routes, routeHref } from '@/route-paths';

export type CategoryNavigationMenuListCtx = {
    level: number;
    categories: ShopperProducts.schemas['Category'][];
    parent: ShopperProducts.schemas['Category'] | undefined;
    path: ReadonlyArray<ShopperProducts.schemas['Category']>;
};

export type CategoryNavigationMenuListItemCtx = {
    category: ShopperProducts.schemas['Category'];
    parent: ShopperProducts.schemas['Category'] | undefined;
    level: number;
    path: ReadonlyArray<ShopperProducts.schemas['Category']>;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    isLeaf: boolean;
};

type SlotType<T> = ReactNode | ((ctx: T) => ReactNode);
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type PropsSlot<T, P extends Record<string, any> = Record<string, any>> = P | ((ctx: T) => P | undefined);

type CategoryNavigationMenuProps = ComponentPropsWithoutRef<typeof NavigationMenu> & {
    categories?: ShopperProducts.schemas['Category'][];

    // Maximum depth (0=no display, 1=only top-level categories, ...). Default: unlimited
    maxDepth?: number;

    // Optional element props customizations
    propsViewport?: PropsSlot<CategoryNavigationMenuListCtx, ComponentProps<typeof NavigationMenuViewport>>;
    propsList?: PropsSlot<CategoryNavigationMenuListCtx, ComponentProps<typeof NavigationMenuList>>;
    propsListItem?: PropsSlot<CategoryNavigationMenuListItemCtx, ComponentProps<typeof NavigationMenuItem>>;
    propsContentContainer?: PropsSlot<CategoryNavigationMenuListItemCtx, ComponentProps<typeof NavigationMenuContent>>;
    propsContent?: PropsSlot<CategoryNavigationMenuListItemCtx, ComponentProps<'div'>>;
    propsElement?: PropsSlot<CategoryNavigationMenuListItemCtx, ComponentProps<keyof JSX.IntrinsicElements>>;

    // Optional render customizations
    renderElement?: SlotType<CategoryNavigationMenuListItemCtx>;
    renderSlotListBefore?: SlotType<CategoryNavigationMenuListCtx>;
    renderSlotListAfter?: SlotType<CategoryNavigationMenuListCtx>;
    renderSlotListItemBefore?: SlotType<CategoryNavigationMenuListItemCtx>;
    renderSlotListItemAfter?: SlotType<CategoryNavigationMenuListItemCtx>;
};

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
function propsFor<T, P extends Record<string, any> = Record<string, any>>(
    input: PropsSlot<T, P> | undefined,
    ctx: T
): P {
    return typeof input === 'function' ? (input(ctx) ?? ({} as P)) : (input ?? ({} as P));
}

function renderSlot<T>(slot: SlotType<T> | undefined, ctx: T) {
    return typeof slot === 'function' ? (slot(ctx) ?? null) : (slot ?? null);
}

function hasChildren(category: ShopperProducts.schemas['Category']): boolean {
    return typeof category.onlineSubCategoriesCount === 'number' && category.onlineSubCategoriesCount > 0;
}

function CategoryNavigationMenuItemLeaf({
    itemCtx,
    renderElement,
    className,
    ...props
}: {
    itemCtx: CategoryNavigationMenuListItemCtx;
    renderElement?: SlotType<CategoryNavigationMenuListItemCtx>;
    className?: string;
}) {
    const leafContent = renderSlot(renderElement, itemCtx);
    if (isValidElement(leafContent)) {
        return leafContent;
    }
    return (
        <NavigationMenuLink {...props} className={className ?? navigationMenuTriggerStyle()} asChild>
            <NavLink to={routeHref(routes.category, { categoryId: itemCtx.category.id })}>
                {itemCtx.category.name}
            </NavLink>
        </NavigationMenuLink>
    );
}

function CategoryNavigationMenuNested(
    props: Omit<Omit<CategoryNavigationMenuProps, 'categories'>, keyof typeof NavigationMenu> & {
        category: ShopperProducts.schemas['Category'];
        level: number;
        maxDepth: number;
        path: ReadonlyArray<ShopperProducts.schemas['Category']>;
    }
) {
    const { category: rawCategory, level, maxDepth } = props;
    const category = useSubCategory(rawCategory.id) ?? rawCategory;
    if (!hasChildren(category) || level >= maxDepth) {
        return null;
    }

    const {
        path,
        propsList,
        propsListItem,
        propsElement,
        renderSlotListBefore,
        renderSlotListAfter,
        renderSlotListItemBefore,
        renderSlotListItemAfter,
        renderElement,
    } = props;
    const childPath = [...path, category];
    const listCtx: CategoryNavigationMenuListCtx = {
        level,
        path: childPath,
        parent: category,
        categories: category.categories ?? [],
    };
    const length = category.categories?.length ?? 0;

    return (
        <>
            {renderSlot(renderSlotListBefore, listCtx)}

            <ul {...propsFor(propsList, listCtx)}>
                {category.categories?.map?.((subCategory: ShopperProducts.schemas['Category'], index: number) => {
                    const itemCtx: CategoryNavigationMenuListItemCtx = {
                        category: subCategory,
                        parent: category,
                        level,
                        path: childPath,
                        index,
                        isFirst: index === 0,
                        isLast: index === length - 1,
                        isLeaf: !hasChildren(subCategory) || maxDepth === level + 1,
                    };

                    return (
                        <Fragment key={subCategory.id}>
                            {renderSlot(renderSlotListItemBefore, itemCtx)}

                            <li {...propsFor(propsListItem, itemCtx)}>
                                {itemCtx.isLeaf ? (
                                    // Nested leaf => Render element (default = link)
                                    <CategoryNavigationMenuItemLeaf
                                        {...propsFor(propsElement, itemCtx)}
                                        itemCtx={itemCtx}
                                        renderElement={renderElement}
                                    />
                                ) : (
                                    // Nested branch => Render element and further nested menu content panel
                                    <>
                                        {renderSlot(
                                            renderElement ??
                                                ((ctx: CategoryNavigationMenuListItemCtx) => (
                                                    <CategoryNavigationMenuItemLeaf
                                                        {...propsFor(propsElement, itemCtx)}
                                                        itemCtx={ctx}
                                                    />
                                                )),
                                            itemCtx
                                        )}
                                        <CategoryNavigationMenuNested
                                            {...props}
                                            category={subCategory}
                                            level={level + 1}
                                            path={childPath}
                                        />
                                    </>
                                )}
                            </li>

                            {renderSlot(renderSlotListItemAfter, itemCtx)}
                        </Fragment>
                    );
                })}
            </ul>

            {renderSlot(renderSlotListAfter, listCtx)}
        </>
    );
}

/**
 * This component is a specialized and highly customizable navigation menu implementation based on the shadcn/ui
 * {@link NavigationMenu}. The component is optimized for the use of B2C Commerce {@link ShopperProducts.schemas['Category']}
 * data and its nested data structure passed as `categories` prop.
 *
 * ## Render Customization Capabilities
 *
 * This component provides extensive customization through multiple render functions and props slots:
 *
 * ### Element Rendering
 * - **`renderElement`**: Custom render function for category items (links, buttons, etc.)
 *   - Receives {@link CategoryNavigationMenuListItemCtx} with category data, level, parent, path, and other info
 *   - Default renders as {@link NavLink} to category page
 *
 * ### Slot Rendering
 * - **`renderSlotListBefore`**: Content before each category list
 * - **`renderSlotListAfter`**: Content after each category list
 * - **`renderSlotListItemBefore`**: Content before each category item
 * - **`renderSlotListItemAfter`**: Content after each category item
 * - All list-level slots receive {@link CategoryNavigationMenuListCtx} context data for dynamic rendering
 * - All item-level slots receive {@link CategoryNavigationMenuListItemCtx} context data for dynamic rendering
 *
 * ### Props Customization
 * - **`propsViewport`**: Customize {@link NavigationMenuViewport} props
 * - **`propsList`**: Customize {@link NavigationMenuList} props
 * - **`propsListItem`**: Customize {@link NavigationMenuItem} props
 * - **`propsContentContainer`**: Customize {@link NavigationMenuContent} props
 * - **`propsContent`**: Customize content wrapper `div` props (direct descendant of the content container for enhanced customizability)
 * - **`propsElement`**: Customize individual element props
 * - All props functions receive context objects ({@link CategoryNavigationMenuListCtx} or {@link CategoryNavigationMenuListItemCtx})
 * containing category data, hierarchy level, parent/child relationships, and other metadata.
 * @example
 * ```tsx
 * <CategoryNavigationMenu
 *   categories={categories}
 *   propsElement={({ category, level }) => ({
 *     className: `${level === 0 && category.id === 'top-seller' ? 'text-primary' : ''} text-base ${level <= 1 ? 'font-bold' : 'font-medium'}`,
 *   })}
 *   propsList={(ctx) => ({ className: `menu-level-${ctx.level}` })}
 * />
 * ```
 */
export default function CategoryNavigationMenu({
    categories,
    maxDepth = Number.POSITIVE_INFINITY,
    viewport = true,
    ...props
}: CategoryNavigationMenuProps) {
    if (maxDepth <= 0) {
        throw new Error('maxDepth must be greater than 0');
    }
    if (!Array.isArray(categories) || !categories.length) {
        return null;
    }

    const listCtx: CategoryNavigationMenuListCtx = { level: 0, path: [], parent: undefined, categories };
    const {
        propsViewport,
        propsList,
        propsListItem,
        propsElement,
        propsContent,
        propsContentContainer,
        renderSlotListBefore,
        renderSlotListAfter,
        renderSlotListItemBefore,
        renderSlotListItemAfter,
        renderElement,
        ...rest
    } = props;
    const length = categories.length;

    return (
        <NavigationMenu {...rest} viewport={false} data-viewport={viewport}>
            {renderSlot(renderSlotListBefore, listCtx)}

            <NavigationMenuList {...propsFor(propsList, listCtx)}>
                {categories.map((category: ShopperProducts.schemas['Category'], index: number) => {
                    const itemCtx: CategoryNavigationMenuListItemCtx = {
                        category,
                        parent: undefined,
                        level: 0,
                        path: [],
                        index,
                        isFirst: index === 0,
                        isLast: index === length - 1,
                        isLeaf: !hasChildren(category) || maxDepth === 1,
                    };

                    return (
                        <Fragment key={category.id}>
                            {renderSlot(renderSlotListItemBefore, itemCtx)}

                            <NavigationMenuItem {...propsFor(propsListItem, itemCtx)}>
                                {itemCtx.isLeaf ? (
                                    // Top-level leaf => Render element (default = link)
                                    <CategoryNavigationMenuItemLeaf
                                        {...propsFor(propsElement, itemCtx)}
                                        itemCtx={itemCtx}
                                        renderElement={renderElement}
                                    />
                                ) : (
                                    // Top-level branch => Render trigger and menu content panel
                                    <>
                                        <NavigationMenuTrigger
                                            {...(propsFor(propsElement, itemCtx) as ComponentProps<
                                                typeof NavigationMenuTrigger
                                            >)}
                                            data-has-submenu="true">
                                            {renderSlot(renderElement ?? category.name, itemCtx)}
                                        </NavigationMenuTrigger>
                                        <NavigationMenuContent {...propsFor(propsContentContainer, itemCtx)}>
                                            <div {...propsFor(propsContent, itemCtx)}>
                                                <CategoryNavigationMenuNested
                                                    {...props}
                                                    category={category}
                                                    level={1}
                                                    path={itemCtx.path}
                                                    maxDepth={maxDepth}
                                                />
                                            </div>
                                        </NavigationMenuContent>
                                    </>
                                )}
                            </NavigationMenuItem>

                            {renderSlot(renderSlotListItemAfter, itemCtx)}
                        </Fragment>
                    );
                })}
            </NavigationMenuList>

            {renderSlot(renderSlotListAfter, listCtx)}

            {viewport && <NavigationMenuViewport {...propsFor(propsViewport, listCtx)} />}
        </NavigationMenu>
    );
}
