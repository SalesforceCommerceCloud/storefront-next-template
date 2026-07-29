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
    createReactAdapter,
    type ReactDesignComponentType,
} from '@salesforce/storefront-next-runtime/design/react/core';
import { ComponentRegistry } from '@salesforce/storefront-next-runtime/design';

/**
 * Factory function to create a React-specific component registry
 * with the React adapter pre-configured.
 */
export function createReactComponentRegistry<TProps>() {
    return new ComponentRegistry<TProps, ReactDesignComponentType<TProps>>({
        adapter: createReactAdapter<TProps>(),
    });
}

/**
 * Global component registry instance.
 * Used throughout the application to discover and load components.
 *
 * This singleton instance is configured with:
 * - React adapter for React-specific behavior
 * - Design mode decorator for Page Designer integration
 * - Static component registration via Vite plugin (no dynamic discovery needed)
 * - Component metadata handled via API (not stored in registry)
 *
 * Heterogeneous component prop shapes are registered here; `any` is required so the
 * registry covariantly accepts any prop type. Switching to `unknown` would force every
 * call site to narrow before forwarding props, which defeats the runtime-driven design.
 */
/* oxlint-disable-next-line @typescript-eslint/no-explicit-any */
export const registry = createReactComponentRegistry<any>();
