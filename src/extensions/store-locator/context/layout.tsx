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

/**
 * Store Locator Layout Context
 *
 * Provides a lightweight mechanism to influence layout behavior of the
 * Store Locator feature without coupling components to specific containers.
 *
 * Current use case: allow components such as `StoreDetails` to render in a
 * forced mobile layout when embedded in constrained surfaces (e.g. a sheet),
 * while maintaining normal responsive behavior by default on the full page.
 */
import { createContext, type PropsWithChildren, useContext } from 'react';

/**
 * Shape of the value exposed by the Store Locator layout context.
 *
 * - When `forceMobile` is true, components should render using the mobile
 *   layout regardless of the actual viewport width.
 * - Defaults to `false` when no provider is present in the tree.
 */
interface StoreLocatorLayoutValue {
    /** When true, components should render using the mobile layout regardless of viewport */
    forceMobile: boolean;
}

/**
 * Context that carries layout directives for Store Locator components.
 * Defaults to `{ forceMobile: false }` so that, in the absence of a provider,
 * the Store Locator renders with normal responsive behavior.
 */
const StoreLocatorLayoutContext = createContext<StoreLocatorLayoutValue>({ forceMobile: false });

/**
 * StoreLocatorLayoutProvider
 *
 * Context provider that lets parents opt Store Locator components into a
 * forced mobile layout. Useful for constrained containers like sheets, drawers,
 * or popovers where the desktop grid should be suppressed.
 *
 * @param props.forceMobile - If true, force mobile layout for descendants
 * @param props.children - React children that can read layout directives
 *
 * @example
 * <StoreLocatorLayoutProvider forceMobile>
 *   <StoreLocator />
 * </StoreLocatorLayoutProvider>
 */
export function StoreLocatorLayoutProvider({ forceMobile, children }: PropsWithChildren<StoreLocatorLayoutValue>) {
    return <StoreLocatorLayoutContext.Provider value={{ forceMobile }}>{children}</StoreLocatorLayoutContext.Provider>;
}

/**
 * Hook to consume the Store Locator layout directives. Returns the current
 * layout flags. If no provider is mounted, the default value
 * `{ forceMobile: false }` is returned.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useStoreLocatorLayout(): StoreLocatorLayoutValue {
    return useContext(StoreLocatorLayoutContext);
}
