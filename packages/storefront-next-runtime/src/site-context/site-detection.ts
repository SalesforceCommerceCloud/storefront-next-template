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

import type { Cookie } from 'react-router';
import type { Site, SiteSettings, DetectionMethod } from './types';
import { readCookieFromRequest, lookupFromPath } from './utils';

/**
 * Detect site reference from cookie.
 */
export async function readSiteFromCookie(request: Request, cookie: Cookie): Promise<string | null> {
    return readCookieFromRequest(request, cookie);
}

/**
 * Get site object using the site id or alias
 * 1. Check siteIdentifier against each site's alias; if matched, return that site.
 * 2. Else check against each site's id; if matched, return that site.
 * 3. If no match, return null.
 */
export function getSiteFromIdOrAlias(siteIdentifier: string | null, sites: Site[]): Site | null {
    if (!siteIdentifier) return null;
    return sites.find((site) => site.alias === siteIdentifier || site.id === siteIdentifier) ?? null;
}

/**
 * Resolve site using the configured detection order.
 * Returns the first valid site from the first source that yields a valid value.
 */
export async function resolveSite(request: Request, settings: SiteSettings): Promise<Site> {
    const { sites, defaultSiteId, siteDetectionConfig, siteCookie } = settings;

    const requestUrl = new URL(request.url);

    // When a base path is configured (e.g., '/shop'), we need to skip its path segments.
    // React Router handles the base path internally for hooks like useParams or useLocation,
    // but it does not strip it from request.url. The offset is calculated dynamically from
    // the number of segments in the base path as future-proof in case we support multi-segment
    // base paths in the future.
    const basePathOffset = process.env.MRT_ENV_BASE_PATH
        ? process.env.MRT_ENV_BASE_PATH.split('/').filter(Boolean).length
        : 0;

    const resolvers: Record<DetectionMethod, () => Promise<string | null>> = {
        path: () =>
            Promise.resolve(
                lookupFromPath(requestUrl.pathname, siteDetectionConfig.lookupFromPathIndex + basePathOffset)
            ),
        querystring: () => Promise.resolve(requestUrl.searchParams.get(siteDetectionConfig.lookupQuerystring)),
        header: () => Promise.resolve(request.headers.get(siteDetectionConfig.lookupHeader)),
        cookie: async () => readSiteFromCookie(request, siteCookie),
    };

    for (const method of siteDetectionConfig.order) {
        const siteIdOrAlias = await resolvers[method]?.();
        const resolvedSite = getSiteFromIdOrAlias(siteIdOrAlias, sites);
        if (resolvedSite) return resolvedSite;
    }

    // If no site id was found, use the default site id
    const site = getSiteFromIdOrAlias(defaultSiteId, sites);

    // If default site id is invalid, throw an error
    if (!site) {
        throw new Error(`Default site ${defaultSiteId} not found.`);
    }

    return site;
}
