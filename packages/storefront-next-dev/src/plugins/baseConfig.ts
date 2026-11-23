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
import type { Plugin } from 'vite';

/**
 * Vite plugin contributing the baseline Vite config required by the
 * Storefront Next framework. These settings are uniform across every
 * customer project and are not intended to be customized.
 *
 * Additional framework-level Vite defaults should be added here rather
 * than in the template's vite.config.ts or in a new single-purpose plugin.
 *
 * Current defaults:
 * - Client entry chunks omit redundant transitive import statements; React Router
 *   preloads the SSR dependency graph and Vite preloads dynamic-import dependencies.
 * - `resolve.dedupe`: prevents duplicate React / React Router copies on the
 *   client. Duplicate React instances cause hooks to throw "Invalid hook call".
 * - `optimizeDeps.include`: forces Vite's dep optimizer to pre-bundle
 *   `react-router` and its `/internal/react-server-client` entry so the
 *   React Router dev plugin resolves a single shared instance on the client.
 *   It also pre-bundles the React-importing entry points of the runtime SDK
 *   (`/config`, `/security/react`, `/site-context`, `/design/react/core`,
 *   `/routing/app-wrapper`, `/i18n/client`). Without this, Vite optimizes the
 *   app's own React first, then *discovers* these SDK subpaths the first time a
 *   component imports them at request time, triggers a dep re-optimization, and
 *   forces a full-page reload. During that window the SDK's React hooks
 *   (`useConfig` → `useContext`) momentarily resolve against a second, freshly
 *   optimized React instance — surfacing as "Invalid hook call" / "Cannot read
 *   properties of null (reading 'useContext')" until the reload settles.
 *   Including them up front means a single first-pass optimization with one
 *   shared React, so no mid-session re-optimize and no transient duplicate.
 * - `ssr.noExternal`: forces the SDK through Vite's SSR transform pipeline
 *   in dev. The SDK exports module-level singletons (router contexts, etc.)
 *   whose object identity is load-bearing — they're used as `Map` keys, so
 *   reads and writes must reference the same object. In dev SSR, Vite can
 *   externalize a package for some import sites (loaded by Node's native
 *   ESM resolver) while transforming it for others (loaded by Vite's SSR
 *   transform pipeline), producing two distinct module records for the
 *   same file on disk. When that happens, the singletons are constructed
 *   twice and the keys no longer match — context lookups silently return
 *   the default value. `noExternal` collapses both paths into Vite's
 *   transform cache so there is exactly one module record. Production
 *   builds inline the SDK into the SSR bundle and are unaffected. We
 *   don't blanket-`noExternal` every dependency because most third-party
 *   packages are identity-agnostic (two copies work fine) and externalizing
 *   keeps dev startup fast — only packages exporting identity-sensitive
 *   singletons need this treatment.
 *
 * @returns {Plugin} A Vite plugin contributing the framework's base config.
 */
export const baseConfigPlugin = (): Plugin => ({
    name: 'storefront-next:base-config',
    config() {
        return {
            environments: {
                client: {
                    build: {
                        rollupOptions: {
                            output: {
                                // React Router and Vite already preload these dependencies. Avoid repeating
                                // their import paths in every route entry as inventory gains more consumers.
                                hoistTransitiveImports: false,
                            },
                        },
                    },
                },
            },
            resolve: {
                dedupe: ['react', 'react-dom', 'react-router'],
            },
            optimizeDeps: {
                include: [
                    'react-router',
                    'react-router/internal/react-server-client',
                    // React-importing runtime SDK entry points. Pre-bundling these
                    // in the first optimizer pass prevents a late discovery +
                    // re-optimize that transiently loads a second React instance
                    // (see optimizeDeps note above).
                    '@salesforce/storefront-next-runtime/config',
                    '@salesforce/storefront-next-runtime/security/react',
                    '@salesforce/storefront-next-runtime/site-context',
                    '@salesforce/storefront-next-runtime/design/react/core',
                    '@salesforce/storefront-next-runtime/routing/app-wrapper',
                    '@salesforce/storefront-next-runtime/i18n/client',
                    // i18n peer deps that the runtime SDK imports *internally* and the
                    // template does NOT import directly from its own source. Vite's
                    // initial crawl scans the app's source graph, so a dep used only
                    // inside the SDK is discovered late — the first time the SDK module
                    // executes — triggering a re-optimize + reload (the same reload that
                    // transiently duplicates React). `react-i18next` does NOT need listing
                    // here because the template imports it directly in many components, so
                    // the initial crawl already finds it.
                    //   - i18next-browser-languagedetector: imported by `/i18n/client`.
                    //   - remix-i18next/middleware: imported by the SDK's `/i18n` barrel
                    //     (createI18nMiddleware), which the template reaches via getTranslation.
                    'i18next-browser-languagedetector',
                    'remix-i18next/middleware',
                ],
            },
            ssr: {
                noExternal: ['@salesforce/storefront-next-runtime'],
            },
        };
    },
});
