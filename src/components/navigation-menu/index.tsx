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
import { cloneElement, isValidElement, type ReactNode, Suspense, useEffect, useMemo, useRef } from 'react';
import { Await } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import CategoryNavigationMenu from './impl';
import { SubCategoryContext, createSubCategoryStore } from './context';

export type { CategoryNavigationMenuListCtx, CategoryNavigationMenuListItemCtx } from './impl';

export default CategoryNavigationMenu;

type CategoryNavigationMenuChildProps = {
    categories: ShopperProducts.schemas['Category'][];
};

type WithCategoryNavigationMenuProps = {
    children?: ReactNode | ((props: CategoryNavigationMenuChildProps) => ReactNode);
    resolve?: Promise<ShopperProducts.schemas['Category']>;
    defer?: Promise<ShopperProducts.schemas['Category'][]>;
    fallback?: ReactNode;
    errorElement?: ReactNode;
    // Programmatically filter out items that you do not want to show. Default: 'c_showInMenu'
    itemsFilter?:
        | keyof ShopperProducts.schemas['Category']
        | ((category: ShopperProducts.schemas['Category']) => boolean);
};

function filterItem(
    category: ShopperProducts.schemas['Category'],
    itemsFilter: WithCategoryNavigationMenuProps['itemsFilter']
): boolean {
    if (typeof itemsFilter === 'function') {
        return Boolean(itemsFilter(category));
    }
    return Boolean(category[itemsFilter ?? 'c_showInMenu']);
}

function WithCategoryNavigationMenuView({
    root: rootCategory,
    defer: subCategoriesPromise,
    itemsFilter,
    children,
}: Omit<WithCategoryNavigationMenuProps, 'resolve' | 'fallback' | 'errorElement'> & {
    root?: ShopperProducts.schemas['Category'];
}) {
    // Stable root categories — never updated, so the root-level items keep their references
    const rootCategories = useMemo(
        () =>
            (rootCategory?.categories ?? []).filter((c: ShopperProducts.schemas['Category']) =>
                filterItem(c, itemsFilter)
            ),
        [rootCategory, itemsFilter]
    );

    // Stable store instance — the reference never changes, so the context provider never triggers re-renders.
    // Subscribers (via `useSyncExternalStore`) are notified on update.
    const storeRef = useRef<ReturnType<typeof createSubCategoryStore> | null>(null);
    if (!storeRef.current) {
        storeRef.current = createSubCategoryStore();
    }

    useEffect(() => {
        void subCategoriesPromise?.then((subCategories: ShopperProducts.schemas['Category'][]) => {
            storeRef.current?.update(
                new Map(
                    subCategories.map((category: ShopperProducts.schemas['Category']) => [
                        category.id,
                        {
                            ...category,
                            categories: category.categories?.filter((c: ShopperProducts.schemas['Category']) =>
                                filterItem(c, itemsFilter)
                            ),
                        },
                    ])
                )
            );
        });
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [subCategoriesPromise]);

    function renderChildren() {
        // Clone the child element and inject the `categories` prop
        if (isValidElement<CategoryNavigationMenuChildProps>(children)) {
            return cloneElement(children, { categories: rootCategories });
        }

        // If `children` is a function, call it with the `categories`
        if (typeof children === 'function') {
            return (children as (props: CategoryNavigationMenuChildProps) => ReactNode)({
                categories: rootCategories,
            });
        }

        // If children is not a valid element or function, return as-is
        return children;
    }

    return <SubCategoryContext value={storeRef.current}>{renderChildren()}</SubCategoryContext>;
}

/**
 * Higher-order component that provides category navigation data ({@link ShopperProducts.schemas['Category']}) to its
 * children.
 *
 * This HOC consumes up to two promises / data streams (e.g.,returned by the route’s/layout’s loader). This allows
 * consumers to defer the loading of the deeply nested subcategories data while the root-level category structure is
 * already loaded and rendered:
 * - Primary data (required): A {@link Promise} resolving to all root categories and their first-level subcategories.
 * The component reads this `Promise` during render (via {@link Await}), so it will suspend and show the nearest
 * {@link Suspense} fallback until it resolves.
 * - Secondary data (prefetch): A {@link Promise} resolving deeper subcategory data for those first-level categories.
 * The component does not read this `Promise` during render; instead it’s resolved in an effect to prefill the
 * categories store. Because it’s not read during render, it doesn’t trigger any {@link Suspense} boundary.
 *
 * The HOC is tailored to communicate/interact with `children` that are instances/subclasses of the
 * {@link CategoryNavigationMenu} component. It handles the async loading and filtering of category data, then passes
 * the resolved categories to its children. Children can be either:
 * - A React element that accepts a `categories` prop
 * - A render function that receives `{ categories }` as its argument
 *
 * @example With a component as children
 * ```tsx
 * <WithCategoryNavigationMenu resolve={rootCategoryPromise} defer={subCategoriesPromise}>
 *   <CustomNavigationMenu />
 * </WithCategoryNavigationMenu>
 * ```
 *@example With a render function
 * ```tsx
 * <WithCategoryNavigationMenu resolve={rootCategoryPromise}>
 *   {({ categories }) => <CustomNavigationMenu categories={categories} />}
 * </WithCategoryNavigationMenu>
 * ```
 * @example With a custom item filter
 * ```tsx
 * <WithCategoryNavigationMenu resolve={rootCategoryPromise} itemsFilter="c_yourFilterProperty">
 *   <CustomNavigationMenu maxDepth={3} />
 * </WithCategoryNavigationMenu>
 * ```
 * @example With custom skeleton fallback and error element
 * ```tsx
 * <WithCategoryNavigationMenu
 *   resolve={rootCategoryPromise}
 *   fallback={<NavigationSkeleton />}
 *   errorElement={<NavigationError />}
 *   <CustomNavigationMenu maxDepth={3} />
 * </WithCategoryNavigationMenu>
 * ```
 */
export function WithCategoryNavigationMenu({
    resolve: rootCategoryPromise,
    defer: subCategoriesPromise,
    fallback,
    errorElement,
    children,
    ...props
}: WithCategoryNavigationMenuProps) {
    return rootCategoryPromise ? (
        <Suspense fallback={fallback}>
            <Await resolve={rootCategoryPromise} errorElement={errorElement}>
                {(rootCategory) => (
                    <WithCategoryNavigationMenuView {...props} root={rootCategory} defer={subCategoriesPromise}>
                        {children}
                    </WithCategoryNavigationMenuView>
                )}
            </Await>
        </Suspense>
    ) : null;
}
