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

import { useMatches } from 'react-router';

/**
 * Page-level UI configuration, declared per-route via the `handle.ui` export.
 *
 * Any route may set this (e.g. cart, product detail, home). The shell
 * (`routes/_app.tsx`) reads it during render and reflects it onto `<main>` as
 * `data-*` attributes, so the correct layout is present in the SERVER-rendered
 * HTML — no post-hydration mutation, no layout shift (CLS).
 *
 * The attributes are inert unless your CSS keys off them. You can style `<main>`
 * padding based on `data-has-top-padding` / `data-hero-bleed` as needed.
 *
 * @example
 * ```tsx
 * // In a route module
 * export const handle = {
 *   ui: { main: { hasTopPadding: true } }
 * };
 * ```
 */
export interface PageUIConfig {
    /** Header configuration for this page. */
    header?: {
        /**
         * When true, the route opts its `<main>` out of the header-height top
         * padding so a hero can bleed full-bleed behind a transparent header
         * (reflected as `data-hero-bleed="true"` on `<main>`).
         *
         * @default false
         */
        transparentOnLoad?: boolean;
    };
    /** Main content area configuration for this page. */
    main?: {
        /**
         * When true, adds extra vertical spacing (the `--ui-vertical-spacing`
         * token) on top of the header height (reflected as
         * `data-has-top-padding="true"` on `<main>`).
         *
         * @default false
         */
        hasTopPadding?: boolean;
    };
    /** Footer configuration for this page. */
    footer?: {
        /**
         * When true, the footer is hidden and `<main>` expands to fill the
         * remaining viewport height. Use for immersive full-screen pages
         * (e.g. appointment booking, full-screen maps).
         *
         * @default false
         */
        hide?: boolean;
    };
}

/**
 * Read the leaf route's `handle.ui` config. Backed by `useMatches`, which
 * resolves on the server too, so callers can apply the result during render
 * (SSR) rather than in an effect.
 *
 * @returns the leaf route's `PageUIConfig`, or `{}` if none is declared.
 */
export function usePageUIConfig(): PageUIConfig {
    const matches = useMatches();
    const leafMatch = matches[matches.length - 1];

    const handle = leafMatch?.handle as { ui?: PageUIConfig } | undefined;
    return handle?.ui ?? {};
}

/**
 * Map a `PageUIConfig` to the `data-*` attributes that belong on `<main>`.
 * Returned as a plain props object so the shell can spread it onto `<main>` at
 * render time:
 *
 * ```tsx
 * <main className="grow pt-8" {...mainPaddingDataAttributes(usePageUIConfig())}>
 * ```
 *
 * Both attributes are always emitted (`"true"`/`"false"`) so the served HTML is
 * deterministic and SPA navigations that flip the value update it on the
 * existing attribute rather than adding/removing it.
 */
export function mainPaddingDataAttributes(config: PageUIConfig): {
    'data-has-top-padding': 'true' | 'false';
    'data-hero-bleed': 'true' | 'false';
} {
    return {
        'data-has-top-padding': config.main?.hasTopPadding ? 'true' : 'false',
        'data-hero-bleed': config.header?.transparentOnLoad ? 'true' : 'false',
    };
}
