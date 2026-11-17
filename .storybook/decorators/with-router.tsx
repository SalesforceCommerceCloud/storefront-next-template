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
import type { Decorator } from '@storybook/react-vite';
import type { ComponentType, ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { buildDefaultMockRoutes } from './mock-routes';

// Reserved paths owned by the decorator's router shell. Story-supplied routes
// must not shadow these — doing so silently breaks the story root, the 404
// catch-all, or one of the built-in mock fixtures.
const RESERVED_ROUTE_PATHS = new Set(['/', '*']);
const STORY_ROUTE_ID = '__storybook_story_route__';

const validateMockRoutes = (extraMockRoutes: RouteObject[] | undefined, defaultPaths: Set<string>) => {
    if (!extraMockRoutes) return;
    for (const route of extraMockRoutes) {
        const path = route.path;
        if (!path) continue;
        if (RESERVED_ROUTE_PATHS.has(path) || defaultPaths.has(path)) {
            throw new Error(
                `[storybook withRouter] parameters.mockRoutes path "${path}" conflicts with a reserved or default mock route. ` +
                    `Use a different path or override behavior via parameters.scapiMock instead.`
            );
        }
    }
};

interface RouterDecoratorParameters {
    /**
     * Data returned by the active story route's loader. Components using
     * `useLoaderData()` read this value directly.
     */
    loaderData?: unknown;
    /**
     * When provided, wraps the story inside ancestor routes that expose their
     * data via `useRouteLoaderData(routeId)`. Lets components like CategoryBanner
     * receive loader data without modifying the component itself.
     *
     * Each entry's key is the route id; each entry's value is the data the
     * loader should resolve to. Order is outermost → innermost.
     */
    routeLoaderData?: Record<string, unknown>;
    /**
     * Override the default product fixture returned by the
     * `/resource/api/client/:resource` route. Used by components whose play
     * functions assert against story-specific product data (e.g.
     * BonusProductModal).
     */
    scapiMock?: { data?: unknown };
    /**
     * Override what the `/resource/basket-products` mock returns. Required by
     * stories that need a different basket shape than the populated default
     * (e.g. CartSheet "Empty" story).
     */
    miniCartData?: { basket: unknown; productsById: Record<string, unknown> };
    /**
     * Extend the default mock route table with story-specific routes. Useful
     * when a per-domain story needs additional `/resource/*` or `/action/*`
     * fixtures without forking the decorator.
     */
    mockRoutes?: RouteObject[];
    /**
     * Seed the memory router with a non-root URL so the story renders against
     * a specific path / search-params combination on first paint. Useful for
     * components that read URL state via `useLocation` / `useSearchParams`
     * (e.g. ActiveFilters reading `?refine=...`) — avoids the `useEffect`-driven
     * `RouteSetter` pattern that produces empty-wrapper snapshots because the
     * effect hasn't fired by the time `toMatchSnapshot()` is called.
     *
     * Defaults to `['/']` when omitted.
     */
    initialEntries?: string[];
}

interface RouterWrapperProps {
    Story: ComponentType;
    context: { id: string; parameters?: RouterDecoratorParameters & Record<string, unknown> };
    Wrapper: ComponentType<{ children: ReactNode }>;
}

/**
 * Builds the memory router that backs every Storybook story. The wrapper
 * keeps `<Story />` inside whatever provider/UI-target stack the caller
 * passes via `Wrapper` so this decorator stays composable with the others.
 *
 * IMPORTANT: Create router synchronously (not in useEffect) to ensure it's
 * available during first render — critical for static Storybook builds where
 * async initialization causes empty div renders.
 */
function RouterWrapper({ Story, context, Wrapper }: RouterWrapperProps) {
    const loaderData = context.parameters?.loaderData;
    const routeLoaderData = context.parameters?.routeLoaderData;
    const scapiMock = context.parameters?.scapiMock;
    const miniCartData = context.parameters?.miniCartData;
    const extraMockRoutes = context.parameters?.mockRoutes;
    const initialEntries = context.parameters?.initialEntries;
    const routeLoaderEntries = Object.entries(routeLoaderData ?? {});
    const hydrationData =
        loaderData === undefined && routeLoaderEntries.length === 0
            ? undefined
            : {
                  loaderData: {
                      ...Object.fromEntries(routeLoaderEntries),
                      ...(loaderData === undefined ? {} : { [STORY_ROUTE_ID]: loaderData }),
                  },
              };
    const routerConfigKey = JSON.stringify({
        storyId: context.id,
        loaderData,
        routeLoaderData,
        scapiMock,
        miniCartData,
        initialEntries,
        mockRoutes: extraMockRoutes?.map(({ path, id, index, caseSensitive, loader, action, element }) => ({
            path,
            id,
            index,
            caseSensitive,
            hasLoader: Boolean(loader),
            hasAction: Boolean(action),
            hasElement: Boolean(element),
        })),
    });

    const storyRef = useRef({ Story, Wrapper });
    storyRef.current = { Story, Wrapper };
    const StoryRenderer = useMemo(
        () => () => {
            const { Story: CurrentStory, Wrapper: CurrentWrapper } = storyRef.current;
            return (
                <CurrentWrapper>
                    <CurrentStory />
                </CurrentWrapper>
            );
        },
        []
    );
    const WrappedStory = useMemo(() => <StoryRenderer />, [StoryRenderer]);
    const storyIndexRoute: RouteObject = {
        id: STORY_ROUTE_ID,
        index: true,
        loader: loaderData === undefined ? undefined : () => loaderData,
        element: WrappedStory,
    };

    // Default action for the story root route: absorbs page-level fetcher.submit() calls that
    // omit an explicit `action` (e.g. useCheckoutActions submits contact/shipping/payment forms
    // to the current route). Returns a generic success so the action's `data` is defined and
    // doesn't trigger the component's "blocking error" toast paths.
    const defaultStoryAction = () => ({ success: true });

    // Build the main story route. When routeLoaderData is provided, each entry becomes a
    // pathless ancestor layout route (element: <Outlet />) so useRouteLoaderData(id) resolves.
    // The outermost entry gets path: '/' to anchor the route tree.
    const storyRoute: RouteObject =
        routeLoaderEntries.length > 0
            ? routeLoaderEntries.reduceRight<RouteObject>(
                  (child, [id, data], i) => ({
                      ...(i === 0 ? { path: '/', action: defaultStoryAction, HydrateFallback: () => null } : {}),
                      id,
                      loader: () => data,
                      element: <Outlet />,
                      children: [child],
                   }),
                   storyIndexRoute
                )
            : {
                  id: STORY_ROUTE_ID,
                  path: '/',
                  loader: loaderData === undefined ? undefined : () => loaderData,
                  element: WrappedStory,
                  action: defaultStoryAction,
                  HydrateFallback: () => null,
              };

    // Create a memory router for components that use React Router hooks (e.g., useFetcher).
    // This provides the data router context needed for useFetcher and other React Router hooks.
    // Using createMemoryRouter in framework mode is fine because both framework and data routers
    // share the same underlying architecture, so it provides a valid navigation context for
    // hooks and <Link>.
    const router = useMemo(
        () => {
            const defaultMockRoutes = buildDefaultMockRoutes(scapiMock, miniCartData);
            const defaultPaths = new Set(
                defaultMockRoutes.map((r) => r.path).filter((p): p is string => typeof p === 'string')
            );
            validateMockRoutes(extraMockRoutes, defaultPaths);
            return createMemoryRouter(
                [
                    storyRoute,
                    ...defaultMockRoutes,
                    ...(extraMockRoutes ?? []),
                    {
                        // Catch-all: absorbs navigations triggered by interactive components
                        // (e.g. swatch <Link>, Quick Add "Buy It Now", product tile clicks).
                        // Returns the user to the story root so the 404 error page is never shown.
                        path: '*',
                        element: WrappedStory,
                    },
                ],
                {
                    initialEntries: initialEntries ?? ['/'],
                    hydrationData,
                }
            );
        },
        // Storybook replaces parameters with equivalent objects while initializing a story.
        // Rebuild only when their values change so loaders receive hydrated data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [routerConfigKey]
    );

    return <RouterProvider router={router} />;
}

/**
 * Build the global router decorator. Accepts a `Wrapper` component that
 * is rendered between the router and the story — typically the
 * provider/UI-target stack.
 *
 *   decorators: [withRouter(StorybookWrapper)]
 *
 * Story-level overrides:
 * - `parameters.loaderData` — active story route loader data (`useLoaderData`).
 * - `parameters.routeLoaderData` — ancestor route loader data (`useRouteLoaderData`).
 * - `parameters.scapiMock` — override the resource loader's product fixture.
 * - `parameters.miniCartData` — override the `/resource/basket-products` payload.
 * - `parameters.mockRoutes` — append story-specific routes.
 * - `parameters.initialEntries` — seed the router with a non-root URL on first paint.
 */
export const withRouter = (Wrapper: ComponentType<{ children: ReactNode }>): Decorator =>
    (Story, context) => (
        <RouterWrapper Story={Story} context={context} Wrapper={Wrapper} />
    );
