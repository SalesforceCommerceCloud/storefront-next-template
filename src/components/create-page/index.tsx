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

import { Fragment, type ReactNode, type ComponentType } from 'react';
import { type useLoaderData, type useActionData, useLocation, type useParams, type useMatches } from 'react-router';
import withSuspense from '@/components/with-suspense';
import { Skeleton } from '@/components/ui/skeleton';

// React Router v7 generates route-specific ComponentProps types automatically
// These are available in .react-router/types/src/routes/+types/<route>.ts
// For a generic HOC, we can infer the component props from the actual React Router hooks
// This ensures compatibility with the generated types while providing a fallback
type LoaderDataProp<TLoaderData> = [TLoaderData] extends [undefined]
    ? { loaderData?: undefined }
    : /** Loader data from the route's loader function */
      { loaderData: ReturnType<typeof useLoaderData<TLoaderData>> };

export type RouteComponentProps<TLoaderData = unknown> = LoaderDataProp<TLoaderData> & {
    /** Action data from the route's action function */
    actionData?: ReturnType<typeof useActionData>;
    /** Route parameters from the URL */
    params?: ReturnType<typeof useParams>;
    /** Route matches for the current location */
    matches?: ReturnType<typeof useMatches>;
};

/**
 * Creates a page component with the standard Suspense pattern and page key handling.
 * This HOC is built on top of withSuspense and adds page-specific functionality.
 *
 * This factory creates a page that handles the common pattern of:
 * - Data promises from loader (passed directly to component)
 * - Page key for navigation (automatically wraps in Fragment when provided)
 * - Suspense for loading states
 *
 * The loader data is passed directly to the component, allowing TypeScript
 * to infer the correct types based on your loader's return type.
 *
 * @param config - Configuration for the page
 * @returns A page component
 *
 * @example
 * ```tsx
 * // Category page with page key (automatically wrapped in Fragment)
 * const CategoryPage = createPage({
 *   component: CategoryView,
 *   fallback: <CategorySkeleton />,
 *   getPageKey: (data) => data.categoryId
 * });
 *
 * // Product page without page key (no Fragment wrapping)
 * const ProductPage = createPage({
 *   component: ProductView,
 *   fallback: <ProductViewSkeleton />
 * });
 * ```
 */
export function createPage<TLoaderData = unknown>(config: {
    /** The component to render when data is loaded */
    component: ComponentType<RouteComponentProps<TLoaderData>>;
    /** Fallback component to show while loading */
    fallback?: ReactNode;
    /** Function to get page key for navigation transitions */
    getPageKey?: (loaderData: RouteComponentProps<TLoaderData>['loaderData']) => string | number;
}) {
    const {
        component: Component,
        fallback = (
            <div className="space-y-4 p-6">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        ),
        getPageKey,
    } = config;

    // Create the component with Suspense using withSuspense HOC
    const ComponentWithSuspense = withSuspense<RouteComponentProps<TLoaderData>>(
        Component as ComponentType<Omit<RouteComponentProps<TLoaderData>, 'resolve'>>,
        { fallback }
    );

    return function PageComponent(props: RouteComponentProps<TLoaderData> = {} as RouteComponentProps<TLoaderData>) {
        const loaderData = props.loaderData;
        const location = useLocation();
        const pageKey = getPageKey?.(loaderData) ?? `${location.pathname}${location.search}${location.hash}`;
        // The conditional `LoaderDataProp<TLoaderData>` produces a structural prop type that
        // does not match the spread shape after generic instantiation. The runtime is valid;
        // this cast bridges the generic-HOC type boundary.
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        const content = <ComponentWithSuspense {...(props as any)} />;

        if (pageKey) {
            return <Fragment key={pageKey}>{content}</Fragment>;
        }

        return content;
    };
}

export default createPage;
