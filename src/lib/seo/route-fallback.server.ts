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
import { redirectDocument, type RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext, stripPathPrefix } from '@salesforce/storefront-next-runtime/site-context';
import { getUrlMapping } from '@/lib/api/shopper-seo.server';
import { getAppOrigin } from '@/lib/origin';
import { buildUrlSegment, resolveUrlMapping } from '@/lib/seo/url-mapping.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { findLegacyRoute } from '@/middlewares/legacy-routes';
import { sanitizeShopperSeoError } from '@/lib/seo/shopper-seo-error.server';
import { getLogger } from '@/lib/logger.server';

export async function attemptRouteSeoFallback(
    context: Readonly<RouterContextProvider>,
    request: Request
): Promise<Response | undefined> {
    const config = getConfig(context);
    const url = new URL(request.url);
    const strippedPath = stripPathPrefix({ pathname: url.pathname, prefix: config.url?.prefix ?? '' });
    const legacyRoutes = config.hybrid.enabled ? (config.hybrid.legacyRoutes ?? []) : [];
    if (findLegacyRoute(strippedPath || '/', legacyRoutes)) return undefined;
    let urlSegment: string;
    try {
        urlSegment = buildUrlSegment(strippedPath);
    } catch (error) {
        if (error instanceof TypeError) return undefined;
        throw error;
    }
    const mapping = await getUrlMapping(context, urlSegment).catch((error: unknown) => {
        getLogger(context).warn('RouteSeoFallback: Shopper SEO fallback failed', { outcome: 'error' });
        return sanitizeShopperSeoError(error);
    });
    const activeSite = context.get(siteContext);
    if (!activeSite) {
        throw new Error('Site context not found. Ensure siteContextMiddleware runs before loaders.');
    }
    const destinationPrefix =
        strippedPath === url.pathname ? undefined : url.pathname.slice(0, url.pathname.length - strippedPath.length);
    const outcome = resolveUrlMapping(mapping, {
        requestUrl: url,
        publicOrigin: getAppOrigin(context),
        incomingPathname: strippedPath || '/',
        sitePolicy: config.seoFallback?.sites[activeSite.site.id],
        seoUrlContext: { siteId: activeSite.site.id, seoRoutes: config.url?.seoRoutes },
        destinationPrefix,
        buildResourceUrl: (location) => buildUrlFromContext(location, context),
        legacyRoutes,
    });

    if (outcome.type === 'redirect' || outcome.type === 'hybrid') {
        return redirectDocument(outcome.location, outcome.status);
    }
}
