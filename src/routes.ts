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
import { type RouteConfig, route } from '@react-router/dev/routes';
import { flatRoutes } from '@salesforce/storefront-next-runtime/routing';

/**
 * Enhanced `flatRoutes` from `@salesforce/storefront-next-runtime/routing`.
 *
 * This is a drop-in wrapper around React Router's stock `flatRoutes` (from
 * `@react-router/fs-routes`) — it accepts the same options (`ignoredRouteFiles`,
 * `rootDirectory`) and returns the same `RouteConfigEntry[]` shape. Internally it
 * delegates to the upstream `flatRoutes` and then layers on three SDK-level behaviors
 * that every storefront depends on:
 *
 * 1. **File-based route discovery** — scans `src/routes/` for route modules, same as the
 *    upstream `flatRoutes`.
 * 2. **Extension route merging** — additionally scans `src/extensions/<name>/routes/` for
 *    routes contributed by optional feature extensions and merges them into the base route
 *    tree. This is what allows extensions to ship their own routes without the template
 *    having to import them explicitly.
 * 3. **Multi-site URL prefixing** — if `app.url.prefix` is configured in `config.server.ts`
 *    (e.g. `/:siteId/:localeId`), wraps every route under that prefix using `app-wrapper.tsx`
 *    so that site- and locale-aware URLs work out of the box. See `docs/README-MULTI-SITE.md`.
 *
 * Test files (`*.test.ts`, `*.test.tsx`) are ignored by default.
 *
 * SLAS server-to-server callback routes are registered here, outside the `/:siteId/:localeId`
 * wrapper, so that a single URL per callback type works for all sites and locales. The
 * site-context middleware falls back to the default site/locale when no URL prefix is present.
 */
// SLAS server-to-server callback routes must be registered outside the /:siteId/:localeId
// wrapper so a single Callback URL entry in SLAS Admin works for all sites and locales.
// They are excluded from flatRoutes() discovery and manually registered at bare paths below.
// Include the default test-file exclusion because specifying ignoredRouteFiles overrides it.
const IGNORED_ROUTE_FILES = [
    '**/*.test.{ts,tsx}',
    '**/resource.slas-reset-password-callback.ts',
    '**/resource.slas-passwordless-login-callback.ts',
];

export default flatRoutes({ ignoredRouteFiles: IGNORED_ROUTE_FILES }).then((appRoutes) => [
    ...appRoutes,
    route('/reset-password-callback', 'routes/resource.slas-reset-password-callback.ts'),
    route('/passwordless-login-callback', 'routes/resource.slas-passwordless-login-callback.ts'),
]) satisfies Promise<RouteConfig>;
