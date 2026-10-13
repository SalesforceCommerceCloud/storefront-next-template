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
import { getLogger } from '@/lib/logger.server';
import { COOKIE_TRACKING_CONSENT, COOKIE_DWSID } from '@/middlewares/auth.utils';
import { modeDetectionContext } from '@/middlewares/mode-detection';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { isRemote } from '@salesforce/storefront-next-runtime/env';
import { isValidCookieDomain } from '@salesforce/storefront-next-runtime/cookie-domain';

/**
 * List of cookie names that should NOT be namespaced.
 * These cookies will be used as-is without siteId suffix.
 *
 * Add cookie names here that need to be shared across sites or
 * that are used by external systems that don't support namespacing.
 *
 * @example
 * const COOKIE_NAMESPACE_EXCLUSIONS = [COOKIE_DWSID, 'external-analytics-id'];
 */
export const COOKIE_NAMESPACE_EXCLUSIONS: readonly string[] = [
    // Add cookie names that should not be namespaced here
    COOKIE_DWSID,
    COOKIE_TRACKING_CONSENT,
];

/**
 * Cookie configuration attributes.
 * Compatible with both client and server environments.
 *
 */
export interface CookieConfig {
    domain?: string;
    path?: string;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    expires?: Date;
    maxAge?: number;
    httpOnly?: boolean;
    partitioned?: boolean;
}

/**
 * Get the namespaced cookie name by appending siteId.
 *
 * If the cookie name is in COOKIE_NAMESPACE_EXCLUSIONS, returns the name as-is.
 *
 * @param name - Base cookie name
 * @param context - Router context provider (required for site context resolution)
 * @returns Namespaced cookie name in format: `${name}_${siteId}`, or original name if excluded
 *
 * @example
 * getCookieNameWithSiteId('cc-nx-g', context); // Returns "cc-nx-g_RefArch"
 *
 * @example
 * // Returns "dwsid" (if in exclusions array)
 * getCookieNameWithSiteId(COOKIE_DWSID, context);
 */
export const getCookieNameWithSiteId = (name: string, context: Readonly<RouterContextProvider>): string => {
    // Check if this cookie should be excluded from namespacing
    if (COOKIE_NAMESPACE_EXCLUSIONS.includes(name)) {
        return name;
    }

    // Site ID is always resolved by site context middleware
    const siteCtx = context.get(siteContext);
    if (!siteCtx?.site?.id) {
        throw new Error('Site context not initialized for cookie namespacing');
    }
    const { site } = siteCtx;

    return `${name}_${site.id}`;
};

/**
 * Get cookie configuration with proper precedence order.
 *
 * Precedence (highest to lowest):
 * 1. App config cookie domain — the per-site `commerce.sites[].cookies.domain` if set,
 *    otherwise the global `app.cookies.domain` knob (highest priority)
 * 2. Provided cookie options (passed to this function)
 * 3. Default values (path, sameSite, secure)
 *
 * The cookie domain is opt-in: when neither the per-site override nor the global knob is
 * set, no `Domain` attribute is emitted and cookies use host-only scoping.
 *
 * @param cookieOptions - Optional cookie options to merge with defaults and app config
 * @param context - Router context provider (required, server-only)
 * @returns Final cookie attributes with proper precedence applied
 *
 * @example
 * // Pass context from middleware/loader/action
 * const cookieConfig = getCookieConfig({ httpOnly: false }, context);
 * // Result includes domain from config if set
 *
 * @example
 * // Provided options override defaults, but the app config domain takes precedence over both.
 * // `secure` defaults to isRemote() — true on deployed (HTTPS) environments,
 * // false on local `pnpm dev` / `pnpm preview` (plain HTTP over loopback).
 * const cookieConfig = getCookieConfig({ path: '/custom', domain: '.code.com' }, context);
 * // If app.cookies.domain=.env.com is set (e.g. via PUBLIC__app__cookies__domain, deployed):
 * // Result: { path: '/custom', sameSite: 'lax', secure: true, domain: '.env.com' }
 *
 * @example
 * // Use with createCookie
 * const authCookie = createCookie('auth', getCookieConfig({ httpOnly: false }, context), context);
 */

/**
 * Parse all cookies from a Cookie header string into a key-value map.
 * More efficient than calling parse() multiple times on individual cookies.
 *
 * @param cookieHeader - Raw Cookie header string
 * @returns Record of cookie name to value (no decoding, raw values)
 */
/**
 * Resolve the cookie `Domain` for the current request, applied uniformly to every storefront
 * cookie. A per-site `commerce.sites[].cookies.domain` takes precedence over the global
 * `app.cookies.domain` knob; when neither is set the result is `undefined` (host-only scoping).
 *
 * @param context - Router context provider (server-only)
 * @param site - Optional site to resolve against (e.g. the target site of a site switch);
 *   defaults to the request's resolved site from the site context.
 * @returns The resolved cookie domain, or `undefined` for host-only scoping.
 */
// Warn at most once per distinct invalid value so a misconfigured merchant does not get a
// per-cookie, per-request log flood. Persists for the process lifetime; cold starts reset it.
// Validation itself (which values a browser rejects) lives in the runtime's shared
// `isValidCookieDomain` so the server, the client (dw_attribution), and the site-context
// middleware all agree on the same rule.
const warnedCookieDomains = new Set<string>();

export const resolveCookieDomain = (
    context: Readonly<RouterContextProvider>,
    site?: { cookies?: { domain?: string } }
): string | undefined => {
    const resolvedSite = site ?? context.get(siteContext)?.site;
    const cookieDomain = resolvedSite?.cookies?.domain || getConfig(context).cookies?.domain || undefined;
    if (!cookieDomain) return undefined;

    // Fall back to host-only scoping on an invalid domain rather than emitting a malformed
    // (browser-rejected) or attribute-injecting Set-Cookie. Applies to every storefront cookie,
    // since this is the single choke point they all resolve their Domain through.
    if (!isValidCookieDomain(cookieDomain)) {
        if (!warnedCookieDomains.has(cookieDomain)) {
            warnedCookieDomains.add(cookieDomain);
            getLogger(context).warn(
                'Invalid cookie domain; falling back to host-only scoping. Cookie domains must not ' +
                    'contain wildcards or special characters (e.g. ".example.com").',
                { cookieDomain }
            );
        }
        return undefined;
    }
    return cookieDomain;
};

export const parseAllCookies = (cookieHeader: string | null): Record<string, string> => {
    if (!cookieHeader) {
        return {};
    }

    return cookieHeader.split(';').reduce(
        (acc, cookie) => {
            const [key, ...valueParts] = cookie.trim().split('=');
            if (key) {
                const value = valueParts.join('=');
                if (value) {
                    acc[key] = value;
                }
            }
            return acc;
        },
        {} as Record<string, string>
    );
};

export const getCookieConfig = <T extends object = CookieConfig>(
    cookieOptions: T | undefined,
    context: Readonly<RouterContextProvider>
): T & CookieConfig => {
    const modeDetection = context.get(modeDetectionContext);

    // 3. Start with defaults (lowest priority)
    const defaults: CookieConfig = {
        path: '/',
        sameSite: 'lax',
        // `Secure` only in deployed (HTTPS) environments. Local `pnpm dev` and `pnpm
        // preview` both serve plain HTTP over loopback, where Safari/WebKit refuses to
        // persist `Secure` cookies (Chrome/Firefox have a localhost exception that hides
        // it) — so auth cookies silently fail to stick and login never persists.
        // isRemote() (BUNDLE_ID) is the same signal that gates HSTS and
        // upgrade-insecure-requests, so cookies, HSTS, and CSP all agree on "is this real
        // HTTPS?". It is NOT NODE_ENV: `pnpm preview` is a production build over http.
        secure: isRemote(),
        ...(modeDetection?.isDesignMode && {
            sameSite: 'none',
            partitioned: true,
        }),
    };

    // 2. Apply provided options (middle priority)
    const merged = {
        ...defaults,
        ...cookieOptions,
    };

    // `SameSite=None` cookies are rejected by browsers unless they are also `Secure`.
    // Page Designer design-mode cookies are embedded cross-site in the Business Manager
    // iframe (always HTTPS) and must be `SameSite=None`, so they stay `Secure` even in
    // local dev where the default is otherwise non-secure.
    if (merged.sameSite === 'none') {
        merged.secure = true;
    }

    // 1. Apply app config cookie overrides (highest priority)
    const cookieConfigOverrides: CookieConfig = {};

    // Cookie domain: per-site override wins over the global default knob.
    // Both unset → no Domain attribute (host-only scoping).
    const cookieDomain = resolveCookieDomain(context);
    if (cookieDomain) {
        cookieConfigOverrides.domain = cookieDomain;
    }

    return {
        ...merged,
        ...cookieConfigOverrides,
    } as T & CookieConfig;
};

/**
 * Cookie interface for server-side cookie operations.
 */
export interface Cookie<T = unknown> {
    parse: (cookieHeader: string | null) => Promise<T | null>;
    serialize: (value: T | '', config?: CookieConfig) => Promise<string>;
}

/**
 * Simple cookie implementation for server environments.
 * Creates a cookie instance that:
 * - Parses cookies from Cookie header strings
 * - Serializes cookies to Set-Cookie header strings
 * - No signing, encryption, or encoding — values are stored as-is
 * - Automatically namespaces cookies by siteId
 *
 * @param name - Cookie name (will be namespaced with siteId)
 * @param defaultConfig - Default cookie configuration
 * @param context - Router context for accessing configuration (server-side only)
 * @returns Cookie instance with parse and serialize methods
 */
export const createCookie = <T = unknown>(
    name: string,
    defaultConfig: CookieConfig,
    context: Readonly<RouterContextProvider>
): Cookie<T> => {
    const namespacedName = getCookieNameWithSiteId(name, context);

    return {
        parse: (cookieHeader: string | null): Promise<T | null> => {
            const cookies = parseAllCookies(cookieHeader);
            const value = cookies[namespacedName];

            if (!value) {
                return Promise.resolve(null);
            }

            return Promise.resolve(value as T);
        },

        serialize: (value: T | '', config: CookieConfig = {}): Promise<string> => {
            const finalConfig = getCookieConfig({ ...defaultConfig, ...config }, context);
            const parts: string[] = [];

            if (value === '') {
                parts.push(`${namespacedName}=`);
            } else {
                parts.push(`${namespacedName}=${String(value)}`);
            }

            if (finalConfig.domain) {
                parts.push(`Domain=${finalConfig.domain}`);
            }

            if (finalConfig.path) {
                parts.push(`Path=${finalConfig.path}`);
            }

            if (finalConfig.expires) {
                parts.push(`Expires=${finalConfig.expires.toUTCString()}`);
            }

            if (finalConfig.maxAge !== undefined) {
                parts.push(`Max-Age=${finalConfig.maxAge}`);
            }

            if (finalConfig.httpOnly) {
                parts.push('HttpOnly');
            }

            if (finalConfig.secure) {
                parts.push('Secure');
            }

            if (finalConfig.sameSite) {
                const sameSiteValue = finalConfig.sameSite.charAt(0).toUpperCase() + finalConfig.sameSite.slice(1);
                parts.push(`SameSite=${sameSiteValue}`);
            }

            if (finalConfig.partitioned) {
                parts.push('Partitioned');
            }

            return Promise.resolve(parts.join('; '));
        },
    };
};
