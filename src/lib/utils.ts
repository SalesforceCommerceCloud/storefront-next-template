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
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import type { Json } from '+types/lang';
import { ApiError } from '@/scapi';

/**
 * Get the configurable base path for the application.
 * This is a runtime-safe version that works in both client and server without importing dev tooling.
 *
 * @returns The base path (e.g., '/site-a') or empty string
 */
export function getBasePath(): string {
    // Server-side: read from process.env
    if (typeof window === 'undefined') {
        const basePath = process.env.MRT_ENV_BASE_PATH?.trim();
        if (!basePath) return '';

        // Base Path conditions match those imposed by MRT
        if (!/^\/[a-zA-Z0-9_.+$~"'@:-]{1,63}$/.test(basePath)) {
            throw new Error(
                `Invalid base path: "${basePath}". ` +
                    "Base path must be a single segment starting with '/' (e.g., '/site-a'), " +
                    'contain only URL-safe characters, and be at most 63 characters after the leading slash.'
            );
        }

        return basePath;
    }

    // Client-side: extract from bundle path
    // In production, the bundle path already includes the base path
    if (window._BASE_PATH) {
        return window._BASE_PATH;
    }

    // Fallback: no base path
    return '';
}

export const stringToBase64 =
    typeof window === 'object' && typeof window.document === 'object'
        ? (unencoded: string): string => btoa(unencoded)
        : (unencoded: string): string => Buffer.from(unencoded).toString('base64');

export const validatePassword = (password: string) => ({
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[,!%#@$&*()_+\-=[\]{};':"\\|.<>/?]/.test(password),
});

export const isPasswordValid = (password: string) => {
    const validation = validatePassword(password);
    return Object.values(validation).every(Boolean);
};

/**
 * This method extracts the status and message from a ResponseError that is returned
 * by the SCAPI client.
 *
 * The SCAPI client throws an `ApiError` (exported from @salesforce/storefront-next-runtime/scapi).
 * We check for the `response` property and assume it is a ResponseError if present.
 *
 * @throws error if the error is not a ResponseError
 */
export const extractResponseError = async (
    error: unknown
): Promise<{
    status_code: string | undefined;
    type?: string | undefined;
    responseMessage: string | undefined;
    [key: string]: Json | undefined;
}> => {
    // the regular error.message will return only the generic status code message
    // i.e. 'Bad Request' for 400. We need to drill specifically into the ResponseError
    // to get a more descriptive error message from SLAS
    if (error instanceof Error && 'response' in error) {
        const json = (await (error.response as Response).json()) ?? {};
        const { type, status_code, ...rest } = json;

        // TODO: This sort of anticipation of how the user might want the API response to be interpreted
        //  as error message, isn't necessarily a good idea. It's better to pass all properties to the user
        //  let the user decide how to format the error.
        // Extract error message from various possible fields in the API response
        // Salesforce Commerce Cloud API can return error details in different fields
        const responseMessage = (json.message || json.detail || json.title || error.message) as string;

        return {
            status_code,
            type,
            // If we have a structured error with title and detail, combine them for better UX
            responseMessage:
                json.title && json.detail && json.title !== json.detail
                    ? `${json.title}: ${json.detail}`
                    : responseMessage,
            ...rest,
        };
    }
    throw error;
};

/**
 * Type for Commerce SDK error objects that may have status or response properties
 */
interface CommerceSdkError extends Error {
    status?: number | string;
    response?: {
        status?: number | string;
        [key: string]: unknown;
    };
}

/**
 * Type guard to check if an error has status information
 */
function hasStatus(error: unknown): error is CommerceSdkError {
    return (
        typeof error === 'object' &&
        error !== null &&
        ('status' in error || ('response' in error && typeof (error as CommerceSdkError).response === 'object'))
    );
}

/**
 * Extract status code from an error object, handling both direct status and nested response.status
 * This is a fallback when extractResponseError fails to read the response body
 */
export function extractStatusCode(error: unknown): string | undefined {
    if (!hasStatus(error)) {
        return undefined;
    }
    if (typeof error.status === 'number' || typeof error.status === 'string') {
        return String(error.status);
    }
    if (error.response && typeof error.response === 'object' && 'status' in error.response) {
        const responseStatus = error.response.status;
        if (typeof responseStatus === 'number' || typeof responseStatus === 'string') {
            return String(responseStatus);
        }
    }
    return undefined;
}

/**

 * TODO: This method replaces the extractResponseError for the new scapi client. We may want to rename this once we remove extractResponseError
 * Extracts error message from different error types
 * @param error - The error to extract message from
 * @returns A user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        // Try to parse rawBody JSON string first
        if (error.rawBody) {
            try {
                const parsedBody = JSON.parse(error.rawBody);
                if (parsedBody.message) {
                    return parsedBody.message;
                }
            } catch {
                // Failed to parse, fall through to other options
            }
        }
        // Fall back to body.detail or statusText
        return error.body?.detail || error.statusText || 'An error occurred';
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'An error occurred';
}

/**
 * Returns the application's origin.
 *
 * This function is isomorphic, it can be used on the client and server.
 *
 * On the server, it will return the origin derived from the EXTERNAL_DOMAIN_NAME (from process.env).
 *
 * On the client, it will return the window.location.origin
 */
export const getAppOrigin = () => {
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    const EXTERNAL_DOMAIN_NAME = process.env.EXTERNAL_DOMAIN_NAME || 'localhost:5173';
    if (!EXTERNAL_DOMAIN_NAME) {
        throw new Error('Environment variable: "EXTERNAL_DOMAIN_NAME" is not set.');
    }

    const isLocalhost = EXTERNAL_DOMAIN_NAME?.includes('localhost');
    const protocol = isLocalhost ? 'http' : 'https';
    return `${protocol}://${EXTERNAL_DOMAIN_NAME}`;
};

/**
 * Get the SCAPI base URL for server-side requests.
 * Uses SCAPI_PROXY_HOST if set, otherwise constructs from the given shortCode.
 *
 * Server-only — accesses process.env.
 *
 * @param shortCode - Commerce API short code (e.g., 'kv7kzm78')
 * @returns Base URL like 'https://kv7kzm78.api.commercecloud.salesforce.com' or the proxy host
 */
export const getScapiBaseUrl = (shortCode: string): string =>
    process.env.SCAPI_PROXY_HOST || `https://${shortCode}.api.commercecloud.salesforce.com`;

/**
 * Determines whether the specified URL is absolute.
 *
 * @param url The URL to test
 * @returns True if the specified URL is absolute, otherwise false
 */
export const isAbsoluteURL = (url: string): boolean => /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);

/** Last-label patterns that mark a "host" as really a filename, not an external host. */
const FILENAME_HOST = /\.(html?|php|aspx?|jsp|css|js|mjs|cjs|json|xml|txt|pdf|png|jpe?g|gif|svg|webp|ico)$/i;

/**
 * True when `host` is an IPv4 literal in a private, loopback, link-local, or otherwise
 * non-public range — i.e. an address a carrier tracking link should never point at.
 * A carrier URL resolving to `127.0.0.1`, `169.254.169.254` (cloud metadata), or an
 * RFC 1918 address means the "external" link would target the storefront's own network.
 * These all contain dots, so the generic dot-based host check does not catch them.
 * Returns false for non-IPv4 hostnames (regular domains fall through to the other checks).
 */
const isPrivateOrReservedIpv4 = (host: string): boolean => {
    const octets = host.split('.');
    if (octets.length !== 4) return false;
    const parts = octets.map((o) => (/^\d{1,3}$/.test(o) ? Number(o) : NaN));
    if (parts.some((n) => Number.isNaN(n) || n > 255)) return false;
    const [a, b] = parts;
    return (
        a === 0 || // 0.0.0.0/8 "this network"
        a === 10 || // 10.0.0.0/8 private
        a === 127 || // 127.0.0.0/8 loopback
        (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 carrier-grade NAT
        (a === 169 && b === 254) || // 169.254.0.0/16 link-local (incl. cloud metadata 169.254.169.254)
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
        (a === 192 && b === 168) || // 192.168.0.0/16 private
        a >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    );
};

/**
 * A parsed URL is a safe external href only if it is http(s), carries NO userinfo,
 * and resolves to a plausible public host. Userinfo is rejected because
 * `new URL('https://www.carrier.com@evil.com')` parses `evil.com` as the host and
 * `www.carrier.com` as the username — the href would read like the carrier but
 * navigate elsewhere. A host with no dot, an empty label (`a..b`), or one that looks
 * like a bare filename (`data.html`) isn't a real external host. A private, loopback,
 * or link-local IP literal (`127.0.0.1`, `169.254.169.254`, `192.168.x.x`) is rejected
 * so a carrier link can't be pointed at the storefront's own network. (Bracketed IPv6
 * literals such as `[::1]` carry no dot and are already rejected by the dot check.)
 */
const isSafeExternalUrl = (url: URL): boolean => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const host = url.hostname;
    if (!host.includes('.')) return false;
    if (!host.split('.').every((label) => label.length > 0)) return false;
    if (FILENAME_HOST.test(host)) return false;
    if (isPrivateOrReservedIpv4(host)) return false;
    return true;
};

/**
 * Normalize a possibly scheme-less external URL (e.g. a carrier tracking URL) into
 * a safe, absolute http(s) URL for an `href`. Prepends `https://` to a scheme-less
 * value so the browser doesn't treat it as a path relative to the current page.
 *
 * Unlike {@link isAbsoluteURL} (which reports a bare host as not-absolute), this
 * turns such a host into an absolute external URL. A result is returned only when it
 * passes {@link isSafeExternalUrl} (http(s), no userinfo, plausible host); unsafe or
 * non-web values (`javascript:`, `data:`, `mailto:`, userinfo spoofs, internal/relative
 * paths, bare filenames, …) and non-string input return `undefined` so callers render
 * an inactive `<a>`. Pair the link with `target="_blank" rel="noopener noreferrer"`.
 */
export const ensureExternalUrl = (input: string | null | undefined): string | undefined => {
    if (typeof input !== 'string') return undefined;

    // Backslashes never appear in a real carrier URL; the WHATWG parser treats `\`
    // as `/`, so a value like `https:\\evil.com` would smuggle in an authority.
    if (input.includes('\\')) return undefined;

    // Reject relative / app-internal paths (allow protocol-relative "//host"). This guard
    // must see the input BEFORE control chars are stripped, but AFTER leading whitespace is
    // trimmed — otherwise a leading-whitespace payload (" /\x00/evil.com") would skip a
    // raw-`startsWith` guard, and a control char BETWEEN the slashes (/\x00/) would only
    // collapse into "//host" once stripped. Trimming just the leading whitespace here keeps
    // the still-single leading slash visible so "/\x00/evil.com" is rejected as relative
    // instead of surviving to be re-prepended into "https://evil.com".
    const leadingTrimmed = input.replace(/^[\s\x00-\x1f\x7f]+/, ''); // eslint-disable-line no-control-regex -- only leading whitespace/control chars, so "/\x00/…" keeps its lone leading slash
    if (leadingTrimmed.startsWith('/') && !leadingTrimmed.startsWith('//')) return undefined;
    if (leadingTrimmed.startsWith('.')) return undefined;

    // eslint-disable-next-line no-control-regex -- strip control chars so they can't smuggle past the checks
    const sanitized = input.replace(/[\x00-\x1f\x7f]/g, '').trim();
    if (!sanitized) return undefined;

    try {
        // A real scheme (`https:`, `javascript:`, `mailto:`) parses to a dot-less
        // protocol; a scheme-less `host:port` (`carrier.com:8080`) mis-parses to a
        // dotted protocol — only the former should be validated/rejected as-is.
        const parsed = new URL(sanitized);
        if (!parsed.protocol.replace(/:$/, '').includes('.')) {
            return isSafeExternalUrl(parsed) ? parsed.toString() : undefined;
        }
        // Dotted protocol WITH an authority (`attacker.com://ups.com/t`) is a host-confusion
        // spoof — the real host is `ups.com` but it reads like `attacker.com`. It must NOT fall
        // through to be re-prepended (which would yield `https://attacker.com//ups.com/t`). A
        // genuine scheme-less `host:port` has an EMPTY host on this parse (`carrier.com:8080` →
        // host ``), so only the empty-host form is allowed through to the prepend path.
        if (parsed.host) return undefined;
    } catch {
        // no scheme — fall through to prepend
    }

    // Scheme-less (`www.carrier.com/t`, `//carrier.com`, `carrier.com:8080`) → prepend https.
    const candidate = sanitized.startsWith('//') ? `https:${sanitized}` : `https://${sanitized}`;
    try {
        const fixed = new URL(candidate);
        return isSafeExternalUrl(fixed) ? fixed.toString() : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Returns the URL if it is a safe relative path, otherwise returns the fallback.
 * Prevents open redirect attacks by rejecting absolute URLs (e.g. https://evil.com, //evil.com).
 */
export const getSafeReturnUrl = (url: string | null | undefined, fallback = '/'): string => {
    if (!url) return fallback;
    if (isAbsoluteURL(url)) return fallback;
    return url;
};

/**
 * Check if code is running on the server side
 */
export const isServer = () => typeof window === 'undefined';

/**
 * Retrieves an item from session storage and parses it as JSON
 * @param key - The session storage key
 * @returns The parsed JSON value or undefined if not found or on server
 */
export const getSessionJSONItem = <T = unknown>(key: string): T | undefined => {
    if (isServer()) {
        return undefined;
    }
    try {
        const item = window.sessionStorage.getItem(key);
        if (item) {
            return JSON.parse(item) as T;
        }
    } catch {
        // Failed to parse, ignore silently
    }
    return undefined;
};

/**
 * Sets an item in session storage as a JSON string
 * @param key - The session storage key
 * @param value - The value to stringify and store
 */
export const setSessionJSONItem = <T = unknown>(key: string, value: T): void => {
    if (isServer()) {
        return;
    }
    try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Failed to save, ignore silently
    }
};

export const clearSessionJSONItem = (key: string): void => {
    if (isServer()) {
        return;
    }
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // Failed to remove, ignore silently
    }
};

/**
 * Parse a JSON string into a flat Record<string, string>.
 * Only includes entries whose values are string or null (number, boolean, objects, arrays are omitted).
 * Null is coerced to the string "null". Returns {} for invalid JSON or non-objects.
 *
 * For now used for strings can be extended to support other types in the future.
 *
 * @param value - JSON string, e.g. '{"device":"mobile","src":"124"}', '{"src":"email"}'
 * @returns Record with string values only
 */
export function parseJsonToStringRecord(value: string | null | undefined): Record<string, string> {
    if (value == null || value === '') return {};
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
        const result: Record<string, string> = {};
        for (const key of Object.keys(parsed)) {
            const v = (parsed as Record<string, unknown>)[key];
            if (typeof v === 'string' || v === null) {
                result[key] = String(v);
            }
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Resolves a local asset URL to work correctly in both local and MRT (Managed Runtime) environments.
 *
 * When assets are imported directly (e.g., `import hero from '/images/hero.png'`), Vite handles
 * the bundle path transformation at build time. However, for dynamic string paths passed as props,
 * we need to resolve them at runtime.
 *
 * This function:
 * - Returns absolute URLs (http://, https://, data:, //) unchanged
 * - Returns URLs that already contain the bundle path unchanged (e.g., statically imported images)
 * - In local dev, returns paths as-is (e.g., '/images/hero.png')
 * - In MRT, prepends the bundle path (e.g., '/mobify/bundle/60/client/images/hero.png')
 * - Works isomorphically (client and server)
 *
 * @param url The asset URL to resolve (e.g., '/images/hero.png' or 'images/hero.png')
 * @returns The resolved URL with bundle path for MRT, or the original path for local dev
 *
 * @example
 * // Local dev:
 * resolveAssetUrl('/images/hero.png') // → '/images/hero.png'
 * resolveAssetUrl('images/hero.png') // → '/images/hero.png'
 * // On MRT with BUNDLE_ID=60:
 * resolveAssetUrl('/images/hero.png') // → '/mobify/bundle/60/client/images/hero.png'
 * resolveAssetUrl('images/hero.png') // → '/mobify/bundle/60/client/images/hero.png'
 * // Already transformed (static import):
 * resolveAssetUrl('/mobify/bundle/60/client/images/hero.png') // → '/mobify/bundle/60/client/images/hero.png'
 * // External URLs (always unchanged):
 * resolveAssetUrl('http://example.com/image.jpg') // → 'http://example.com/image.jpg'
 */
export const resolveAssetUrl = (url: string): string => {
    // Return absolute URLs unchanged
    if (isAbsoluteURL(url) || url.startsWith('data:')) {
        return url;
    }

    // If the URL already contains the bundle path, it's already transformed (e.g., from a static import) — return as-is
    // This is to avoid double transformation of the URL
    if (url.includes('/mobify/bundle/')) {
        return url;
    }

    const basePath = getBasePath();

    // Determine the bundle ID
    // Falls back to 'local' if _BUNDLE_ID is undefined (e.g., in dev mode where bundle config isn't injected)
    const bundleId = (typeof window !== 'undefined' ? window._BUNDLE_ID : process.env.BUNDLE_ID) || 'local';

    // In local development, don't prepend bundle path
    if (bundleId === 'local') {
        // Ensure the URL starts with a slash for consistency
        return url.startsWith('/') ? url : `/${url}`;
    }

    // In MRT, prepend the bundle path with base path
    const bundlePath = `${basePath}/mobify/bundle/${bundleId}/client/`;
    const normalizedUrl = url.startsWith('/') ? url.slice(1) : url;

    return `${bundlePath}${normalizedUrl}`;
};

const twMerge = extendTailwindMerge<'border-ui'>({
    extend: {
        classGroups: {
            'border-ui': ['border-ui'],
        },
        conflictingClassGroups: {},
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
