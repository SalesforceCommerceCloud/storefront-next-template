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

import { createContext, useContext, type JSX, type PropsWithChildren } from 'react';

const RootComponentContext = createContext<boolean>(false);

/**
 * Marks the single component rendered directly beneath it as the design-canvas
 * root — the standalone content block being edited, which cannot be moved or
 * deleted. Non-sticky: {@link DesignComponent} consumes it once and re-provides
 * `false` (via {@link RootComponentResetProvider}) to its own children, so
 * root-ness never propagates into nested components. No effect outside design
 * mode, where the design decorators do not render.
 */
export function RootComponentProvider({ children }: PropsWithChildren): JSX.Element {
    return <RootComponentContext.Provider value={true}>{children}</RootComponentContext.Provider>;
}

/**
 * Resets canvas-root-ness to `false` for descendants. {@link DesignComponent}
 * wraps its children in this after reading {@link useIsRootComponent}, so a
 * nested child of the root is never itself treated as root.
 */
export function RootComponentResetProvider({ children }: PropsWithChildren): JSX.Element {
    return <RootComponentContext.Provider value={false}>{children}</RootComponentContext.Provider>;
}

/**
 * Whether the caller is the design-canvas root component. `false` when no
 * {@link RootComponentProvider} is present, so full-page content — which the
 * template never wraps — is never treated as root.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsRootComponent(): boolean {
    return useContext(RootComponentContext);
}
