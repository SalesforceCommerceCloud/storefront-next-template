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
 * Analytics proxy route that forwards __Analytics-Start requests to ECOM.
 *
 * When hybrid auth is enabled, ECOM returns session cookies (dwsid, access tokens)
 * for new sessions. If the browser sends analytics requests directly to the ECOM domain,
 * the storefront's dwsid cookie (scoped to the storefront domain) is not included,
 * causing ECOM to create a duplicate session.
 *
 * This proxy ensures the dwsid cookie from the storefront domain is read server-side
 * and forwarded to ECOM, so ECOM recognizes the existing session and does not create
 * a new one. Set-Cookie headers from ECOM are rewritten to the storefront domain,
 * matching how PWA Kit's MRT proxy handles cookie domains.
 */
import type { Route } from './+types/resource.analytics-proxy';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';

/**
 * Rewrite the Domain attribute in a Set-Cookie header string from the ECOM
 * hostname to the storefront hostname. Cookies without a Domain attribute
 * are left unchanged (they default to the response origin).
 */
function rewriteCookieDomain(setCookieValue: string, ecomHostname: string, appHostname: string): string {
    return setCookieValue.replace(
        new RegExp(`(Domain=)\\.?${ecomHostname.replace(/\./g, '\\.')}`, 'i'),
        `$1${appHostname}`
    );
}

async function proxyAnalytics({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
    try {
        const auth = getAuth(context);
        if (auth.authMode === 'trusted-agent')
            return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        // Auth middleware not initialized
    }
    const logger = getLogger(context);
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    logger.debug('AnalyticsProxy: request starting', { method: request.method });

    if (!targetUrl) {
        logger.warn('AnalyticsProxy: missing url parameter');
        return new Response('Missing url parameter', { status: 400 });
    }

    const config = getConfig(context);
    const activeDataHost = config.engagement?.adapters?.activeData?.host;

    if (!activeDataHost) {
        logger.warn('AnalyticsProxy: Active Data host not configured');
        return new Response('Active Data host not configured', { status: 500 });
    }

    let parsedTarget: URL;
    try {
        parsedTarget = new URL(targetUrl);
    } catch {
        logger.warn('AnalyticsProxy: invalid url parameter', { targetUrl });
        return new Response('Invalid url parameter', { status: 400 });
    }

    const parsedHost = new URL(activeDataHost);
    if (parsedTarget.hostname !== parsedHost.hostname) {
        logger.warn('AnalyticsProxy: target hostname mismatch', {
            targetHostname: parsedTarget.hostname,
            expectedHostname: parsedHost.hostname,
        });
        return new Response('Target URL does not match configured Active Data host', { status: 403 });
    }

    let cookieHeader: string | undefined;

    try {
        const auth = getAuth(context);
        const cookieParts: string[] = [];
        if (auth.dwsid) {
            cookieParts.push(`dwsid=${auth.dwsid}`);
        }

        // Forward TikTok tracking cookies to ECOM for server-side ad attribution.
        // _ttp (TikTok browser ID) and ttclid (TikTok Click ID) are set by the
        // TikTok pixel SDK on the storefront domain. ECOM's TikTokAdsServerTrackingManager
        // reads them for Events API dedup and attribution — same as SiteGenesis/SFRA,
        // where ECOM reads them directly because pages are server-rendered on the ECOM domain.
        const incomingCookies = request.headers.get('cookie') ?? '';
        const ttpMatch = incomingCookies.match(/(?:^|;\s*)_ttp=([^;]+)/);
        const ttclidMatch = incomingCookies.match(/(?:^|;\s*)ttclid=([^;]+)/);
        if (ttpMatch) cookieParts.push(`_ttp=${ttpMatch[1]}`);
        if (ttclidMatch) cookieParts.push(`ttclid=${ttclidMatch[1]}`);

        if (cookieParts.length > 0) {
            cookieHeader = cookieParts.join('; ');
        }
    } catch {
        // Auth middleware not initialized — proceed without dwsid
    }

    try {
        const ecomResponse = await fetch(targetUrl, {
            method: request.method,
            headers: cookieHeader ? { Cookie: cookieHeader } : {},
            signal: AbortSignal.timeout(10000),
        });

        // Rewrite Set-Cookie domains from ECOM to the storefront hostname,
        // matching PWA Kit's proxy behavior. This ensures any cookies ECOM
        // returns are scoped to the storefront domain instead of creating
        // a separate cookie jar on the ECOM domain.
        const responseHeaders = new Headers();
        const setCookies =
            typeof ecomResponse.headers.getSetCookie === 'function' ? ecomResponse.headers.getSetCookie() : [];

        const appHostname = url.hostname;
        const ecomHostname = parsedHost.hostname;

        for (const cookie of setCookies) {
            responseHeaders.append('Set-Cookie', rewriteCookieDomain(cookie, ecomHostname, appHostname));
        }

        return new Response(null, { status: ecomResponse.status, headers: responseHeaders });
    } catch (error) {
        logger.error('AnalyticsProxy: upstream request failed', { error });
        return new Response(null, { status: 502 });
    }
}

// navigator.sendBeacon() sends POST requests, so we need an action handler.
// Export loader as well for flexibility (e.g., fetch-based GET calls).
export const loader = proxyAnalytics;
export const action = proxyAnalytics;
