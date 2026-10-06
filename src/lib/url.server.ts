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
import type { RouterContextProvider } from 'react-router';
import { buildUrl, siteContext } from '@salesforce/storefront-next-runtime/site-context';

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getBasePath } from '@/lib/utils';

/** Remove the known MRT base path from an externally supplied internal URL before it is rebuilt. */
export function stripMrtBasePathFromUrl(to: string): string {
    const basePath = getBasePath();
    if (!basePath || !to.startsWith('/') || to.startsWith('//')) return to;

    const suffixIndex = to.search(/[?#]/);
    const pathname = suffixIndex === -1 ? to : to.slice(0, suffixIndex);
    const suffix = suffixIndex === -1 ? '' : to.slice(suffixIndex);

    if (pathname === basePath) return `/${suffix}`;
    if (!pathname.startsWith(`${basePath}/`)) return to;

    return `${pathname.slice(basePath.length)}${suffix}`;
}

/**
 * Server-side counterpart of the client-side `useCurrentSiteAndLocaleRef` + `buildUrl` pattern.
 * Reads the resolved site and locale from router context, applies alias mappings,
 * and prefixes the given path with the site context URL prefix.
 *
 * Use this in loaders and actions where you need a prefixed URL (e.g., for `redirect()`).
 * For client-side code, use `useCurrentSiteAndLocaleRef` hook with `buildUrl` instead.
 *
 * This file is `.server.ts` to prevent accidental client-side imports, since it depends
 * on server-only APIs (`getConfig`, `siteContext`).
 *
 * @example
 * ```typescript
 * import { buildUrlFromContext } from '@/lib/url.server';
 *
 * export function loader({ context }: LoaderFunctionArgs) {
 *     throw redirect(buildUrlFromContext('/login', context));
 * }
 * ```
 *
 * @param to - An application-relative target without the MRT base path (e.g., '/login', '/account/orders')
 * @param context - The router context from loader/action args
 * @returns The prefixed URL (e.g., '/shop/global/en-GB/login')
 */
export function buildUrlFromContext(to: string, context: Readonly<RouterContextProvider>): string {
    const config = getConfig(context);
    const siteCtx = context.get(siteContext);
    const siteUrl =
        !siteCtx || to === '/'
            ? to
            : buildUrl({
                  to,
                  urlConfig: config.url,
                  params: {
                      siteId: siteCtx.site.alias ?? siteCtx.site.id,
                      localeId: config.localeAliasMap?.[siteCtx.locale.id] ?? siteCtx.locale.id,
                  },
              });
    const basePath = getBasePath();

    if (!basePath || !siteUrl.startsWith('/') || siteUrl.startsWith('//')) {
        return siteUrl;
    }

    // `to` is application-relative by contract. Inferring that the base path is already present
    // from the first segment is ambiguous because site aliases and application routes can match it.
    return `${basePath}${siteUrl}`;
}
