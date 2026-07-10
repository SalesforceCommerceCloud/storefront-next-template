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

import defaultTheme from 'tailwindcss/defaultTheme';
import type { AppConfig } from '@/types/config';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

export type DynamicImageDimensions = Array<number | string> | Record<string, number | string>;

// Pre-compiled regex patterns for better performance (compiled once at module load)
/** Matches DIS path and captures the realm: /dw/image/v2/REALM_ID/... */
const DIS_PATH_REALM_REGEX = /\/dw\/image\/v\d+\/([^/]+)/i;
/** Matches DIS path prefix and captures the remaining path */
const DIS_PATH_STRIP_REGEX = /\/dw\/image\/v\d+\/[^/]+(\/.*)/i;
/** Matches DynamicImage placeholder syntax: [?sw={width}], [_{width}], etc. */
const PLACEHOLDER_REGEX = /\[[^\]]*]/g;
/** Matches file extension at end of path: .jpg, .png, etc. */
const FILE_EXTENSION_REGEX = /\.([^.]+)$/;
/** Tests if URL contains DIS path structure */
const IS_DIS_URL_REGEX = /\/dw\/image\/v\d+\//i;
/** Matches dashes for realm conversion (demo-001 -> DEMO_001) */
const DASH_REGEX = /-/g;
/** Tests if URL contains quality (q) query parameter (must be preceded by ? or &) */
const HAS_QUALITY_PARAM_REGEX = /[?&]q=/;

/**
 * Sentinel base used to parse relative URLs so their query string can be read. The hostname is
 * irrelevant — we only inspect `searchParams` — so an unresolvable `.invalid` host is intentional.
 */
const SFRM_PARSE_BASE = 'https://sfrm-check.invalid';

/**
 * Returns `true` when `url` carries a real `sfrm` query parameter. Reads it from the parsed query
 * string (with a sentinel base so relative URLs still resolve) rather than a regex over the raw
 * string, so a literal `&sfrm=` inside a path segment (e.g. `/catalog&sfrm=jpg/x.jpg`) is not
 * mistaken for a query param. Fails closed (returns `false`) on unparseable input.
 */
const hasSfrmParam = (url: string): boolean => {
    try {
        return new URL(url, SFRM_PARSE_BASE).searchParams.has('sfrm');
    } catch {
        return false;
    }
};

export type Image = {
    disBaseLink?: string;
    link?: string;
    [key: string]: unknown;
};

export type DisImageOptions = {
    disHost?: string;
    format?: 'avif' | 'gif' | 'jp2' | 'jpg' | 'jpeg' | 'jxr' | 'png' | 'webp';
    width?: number;
    height?: number;
    quality?: number;
    sourceFormat?: string;
};

export type ImageUrlParams = {
    /** The source image URL to transform */
    src?: string | undefined;
    /** Optional DIS transformation options (format, width, quality) */
    options?: DisImageOptions;
    /** App config containing DIS host and quality settings */
    config?: AppConfig;
    /** Image object */
    image?: Image;
};

/**
 * Attempts to derive realm from hostname using custom mappings first, then built-in SFCC patterns.
 *
 * @param url - The URL to extract realm from
 * @param config - App config containing custom realm mappings
 * @returns The realm (uppercased) or undefined if not derivable
 */
function getRealmFromUrl(url: URL, config?: AppConfig): string | undefined {
    // 1. Check custom mappings first (customer/environment-specific)
    const customMappings = config?.images?.realmHostMappings;
    if (customMappings) {
        for (const { hostSuffix, realm } of customMappings) {
            const suffix = hostSuffix.toLowerCase();
            // Exact match OR suffix match with dot boundary (prevents 'evilshop.example.com' matching 'shop.example.com')
            const isMatch =
                url.hostname === suffix ||
                (suffix.startsWith('.') && url.hostname.endsWith(suffix)) ||
                (!suffix.startsWith('.') && url.hostname.endsWith(`.${suffix}`));
            if (isMatch) {
                return realm.toUpperCase();
            }
        }
    }

    // 2. Fall back to built-in Salesforce B2C Commerce URL patterns
    // Example hosts:
    //   demo-001.dx.commercecloud.salesforce.com -> realm DEMO_001
    //   demo-001.my.cc.salesforce.com            -> realm DEMO_001
    const isSfccHost =
        url.hostname.endsWith('.commercecloud.salesforce.com') ||
        url.hostname.endsWith('.demandware.net') ||
        url.hostname.endsWith('.my.cc.salesforce.com');
    if (!isSfccHost) {
        return undefined;
    }

    const subdomain = url.hostname.split('.')?.[0];
    if (!subdomain) {
        return undefined;
    }
    const realm = subdomain.replace(DASH_REGEX, '_').toUpperCase();
    return realm || undefined;
}

function getRealm(url: URL, config?: AppConfig): string | undefined {
    const realmFromPath = url.pathname.match(DIS_PATH_REALM_REGEX)?.[1];
    if (realmFromPath) {
        return realmFromPath.toUpperCase();
    }
    return getRealmFromUrl(url, config);
}

function stripDisPath(pathname: string): string {
    const disPathMatch = pathname.match(DIS_PATH_STRIP_REGEX);
    return disPathMatch?.[1] || pathname;
}

/**
 * Parses the configured DIS host string once and memoizes the resulting hostname. `isDISCapableHost`
 * runs per-image, but `config.images.host` is effectively constant at runtime, so caching avoids a
 * redundant `new URL()` parse on every image. The single-entry cache re-parses only when the input
 * string changes (e.g., a different config), so it stays correct without a full map.
 *
 * @param disHost - The configured DIS host URL string (`config.images.host`)
 * @returns The lowercased hostname, or `undefined` if `disHost` is not a parseable URL
 */
let cachedDisHostInput: string | undefined;
let cachedDisHostname: string | undefined;
function getDisHostname(disHost: string): string | undefined {
    if (disHost !== cachedDisHostInput) {
        cachedDisHostInput = disHost;
        try {
            cachedDisHostname = new URL(disHost).hostname.toLowerCase();
        } catch {
            // Invalid disHost URL — cache the miss so we don't re-parse it every call
            cachedDisHostname = undefined;
        }
    }
    return cachedDisHostname;
}

/**
 * Returns `true` when `url.hostname` is a DIS-capable host — one that can serve `/dw/image/v2/{realm}/...`
 * URLs and honor DIS transformation parameters (`sfrm`, `q`, `sw`, `sh`). Used to gate DIS-eligibility checks
 * so third-party hosts carrying `/dw/image/v2/` in the path (e.g., a coincidental path layout or legacy redirect)
 * are not misclassified as DIS-eligible.
 *
 * A host is DIS-capable if it matches:
 * 1. The configured DIS endpoint (`config.images.host`), OR
 * 2. A `realmHostMappings` entry (vanity domain with explicit realm), OR
 * 3. A built-in SFCC domain (`.commercecloud.salesforce.com`, `.demandware.net`, `.my.cc.salesforce.com`).
 *
 * **Performance contract**: runs per-image. The configured DIS host is parsed once and memoized (see
 * `getDisHostname`), and the `realmHostMappings` loop is over a small config array (typically 0-3 entries),
 * so this is negligible compared to the `new URL()` parse done by callers.
 *
 * @param url - The URL to check
 * @param config - App config containing DIS host and custom realm mappings
 * @returns `true` if the host can serve DIS URLs, `false` otherwise
 */
function isDISCapableHost(url: URL, config?: AppConfig): boolean {
    const hostname = url.hostname.toLowerCase();

    // 1. Configured DIS endpoint (e.g., edge.disstg.commercecloud.salesforce.com)
    const disHost = config?.images?.host;
    if (disHost) {
        const disHostname = getDisHostname(disHost);
        if (disHostname && hostname === disHostname) {
            return true;
        }
    }

    // 2. Custom vanity domain mappings
    const customMappings = config?.images?.realmHostMappings;
    if (customMappings) {
        for (const { hostSuffix } of customMappings) {
            const suffix = hostSuffix.toLowerCase();
            // Exact match OR suffix match with dot boundary (prevents 'evilshop.example.com' matching 'shop.example.com')
            const isMatch =
                hostname === suffix ||
                (suffix.startsWith('.') && hostname.endsWith(suffix)) ||
                (!suffix.startsWith('.') && hostname.endsWith(`.${suffix}`));
            if (isMatch) {
                return true;
            }
        }
    }

    // 3. Built-in SFCC domains
    const isSfccHost =
        hostname.endsWith('.commercecloud.salesforce.com') ||
        hostname.endsWith('.demandware.net') ||
        hostname.endsWith('.my.cc.salesforce.com');

    return isSfccHost;
}

/**
 * Shared parsing step for the DIS URL helpers. Extracts placeholders, parses the URL, and resolves
 * the effective `disHost`, `realm`, and `normalizedPathname`. Returns `undefined` only when the URL
 * is unparseable — `disHost` / `realm` may still be `undefined` on the parts object and callers
 * decide how to handle each case.
 */
function parseDisUrlParts(
    src: string,
    options: DisImageOptions,
    config?: AppConfig
):
    | {
          /** DynamicImage placeholder fragments (e.g. `[?sw={width}]`) extracted from `src`. */
          placeholders: string[];
          /** `src` with all placeholders removed — safe to pass to `new URL()` / regex checks. */
          cleanUrl: string;
          /** Parsed URL object for `cleanUrl`. */
          url: URL;
          /** Resolved DIS host from `options.disHost` or `config.images.host`. `undefined` if neither is set. */
          disHost: string | undefined;
          /** Realm derived from the URL path (existing DIS URL), custom mappings, or subdomain (raw SFCC URL). */
          realm: string | undefined;
          /** URL pathname with any existing `/dw/image/v2/{realm}` prefix stripped. */
          normalizedPathname: string;
      }
    | undefined {
    try {
        const placeholders = src.match(PLACEHOLDER_REGEX) || [];
        const cleanUrl = src.replace(PLACEHOLDER_REGEX, '');
        const url = new URL(cleanUrl);
        return {
            placeholders,
            cleanUrl,
            url,
            disHost: options.disHost || config?.images?.host,
            realm: getRealm(url, config),
            normalizedPathname: stripDisPath(url.pathname),
        };
    } catch {
        return undefined;
    }
}

/**
 * Converts a full image URL into a relative `/on/demandware.static/...` path, preserving any
 * DynamicImage placeholders. Used by the `enableDis=false` branches where the Vite dev server or
 * proxy serves static assets directly. Returns `undefined` when `src` is not a parseable URL.
 */
function toRelativeStaticPath(src: string): string | undefined {
    try {
        const placeholders = src.match(PLACEHOLDER_REGEX) || [];
        const cleanUrl = src.replace(PLACEHOLDER_REGEX, '');
        const url = new URL(cleanUrl);
        const normalizedPathname = stripDisPath(url.pathname);
        return placeholders.length > 0 ? `${normalizedPathname}${placeholders.join('')}` : normalizedPathname;
    } catch {
        return undefined;
    }
}

/**
 * Rewrites raw SFCC static image URLs into DIS-hosted URLs by inserting the `/dw/image/v2/{realm}/` prefix and
 * switching to the configured DIS host. Preserves the original file extension and query string — does NOT perform
 * format conversion or append DIS transformation parameters (sfrm, q, sw, sh). Use this when downstream code (e.g.
 * `getResponsivePictureAttributes`) handles per-breakpoint format/query generation and expects a clean base URL.
 *
 * Behavior:
 * - Raw SFCC URL with derivable realm → DIS-hosted URL, same extension, same query.
 * - Already a DIS URL on the configured host → returned unchanged.
 * - Already a DIS URL on a different host → host rewritten, realm from path preserved.
 * - Non-SFCC URL (no realm derivable) → returned unchanged.
 * - Falsy `src` or invalid URL → returns `src` unchanged.
 * @example
 * toDisBaseUrl({
 *     src: 'https://demo-001.my.cc.salesforce.com/on/demandware.static/-/.../image.jpg',
 *     config,
 * })
 * // → 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/.../image.jpg'
 */
export function toDisBaseUrl({ src, options = {}, config }: ImageUrlParams): string | undefined {
    if (!src) {
        return src;
    }
    const parts = parseDisUrlParts(src, options, config);
    if (!parts) {
        return src;
    }

    const { cleanUrl, disHost } = parts;
    const isDisUrl = IS_DIS_URL_REGEX.test(cleanUrl);
    if (isDisUrl && (!disHost || cleanUrl.startsWith(disHost))) {
        return src;
    }

    const { realm } = parts;
    if (!disHost || !realm) {
        return src;
    }

    const { url, placeholders, normalizedPathname } = parts;
    const rewritten = `${disHost}/dw/image/v2/${realm}${normalizedPathname}${url.search}`;
    return placeholders.length > 0 ? `${rewritten}${placeholders.join('')}` : rewritten;
}

/**
 * Utility helper to convert B2C Commerce static asset URLs into Dynamic Imaging Service (DIS) URLs.
 *
 * When `config.images.enableDis` is false, skips DIS transformation and returns
 * relative static paths for environments that serve images directly.
 *
 * Example:
 * https://demo-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-storefront-catalog-m-non-en/default/dwa6379acf/images/slot/landing/cat-landing-slotbanner-mens.jpg
 * becomes
 * https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/on/demandware.static/-/Sites-storefront-catalog-m-non-en/default/dwa6379acf/images/slot/landing/cat-landing-slotbanner-mens.webp?sfrm=jpg
 *
 * @see {@link https://help.salesforce.com/s/articleView?id=cc.b2c_image_transformation_service.htm&type=5}
 */
export function toDisImageUrl({ src, options = {}, config }: ImageUrlParams): string | undefined {
    if (!src) {
        return undefined;
    }

    // When DIS is disabled, skip transformation and use direct static paths
    // (/on/demandware.static paths proxied through Vite dev server config)
    if (config?.images?.enableDis === false) {
        return toRelativeStaticPath(src);
    }

    const parts = parseDisUrlParts(src, options, config);
    if (!parts || !parts.disHost || !parts.realm) {
        return undefined;
    }
    const { placeholders, url, disHost, realm, normalizedPathname } = parts;

    // Derive formats
    const extMatch = normalizedPathname.match(FILE_EXTENSION_REGEX);
    const sourceFormat = options.sourceFormat || extMatch?.[1]?.toLowerCase() || 'jpg';
    const targetFormat = options.format || config?.images?.formats?.[0] || config?.images?.fallbackFormat || 'webp';
    const disPath = normalizedPathname.replace(FILE_EXTENSION_REGEX, `.${targetFormat}`);

    // Build query params
    const search = new URLSearchParams(url.search);
    search.set('sfrm', sourceFormat);
    if (options.width) {
        search.set('sw', String(options.width));
    }
    if (options.height) {
        search.set('sh', String(options.height));
    }
    const quality = options.quality ?? config?.images?.quality;
    if (quality != null) {
        search.set('q', String(quality));
    }

    const query = search.toString();
    const baseUrl = `${disHost}/dw/image/v2/${realm}${disPath}${query ? `?${query}` : ''}`;
    return placeholders.length > 0 ? `${baseUrl}${placeholders.join('')}` : baseUrl;
}

/**
 * Converts an image URL to an optimized format, with graceful fallback.
 *
 * Unlike `toDisImageUrl` which returns `undefined` for non-SFCC URLs,
 * this function returns the original URL as a fallback, making it safer
 * for use with images that may or may not be from SFCC.
 *
 * @param params - Object containing src, options, and config
 * @param params.src - The image URL to transform
 * @param params.options - Optional DIS transformation options (format, width, quality)
 * @param params.config - App config containing DIS host and quality settings
 * @returns Transformed DIS URL, or original URL if transformation not possible
 *
 * @example
 * // SFCC URL - transforms to DIS WebP
 * toImageUrl({ src: 'https://demo-001.dx.commercecloud.salesforce.com/.../image.jpg', config })
 * // → 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/DEMO_001/.../image.webp?sfrm=jpg&q=70'
 *
 * // Already DIS URL - ensures WebP format
 * toImageUrl({ src: 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/.../image.jpg', config })
 * // → 'https://edge.disstg.commercecloud.salesforce.com/dw/image/v2/.../image.webp?sfrm=jpg'
 *
 * // Non-SFCC URL - returns original (fallback)
 * toImageUrl({ src: 'https://example.com/image.jpg', config })
 * // → 'https://example.com/image.jpg'
 */
export function toImageUrl({ src, options = {}, config, image }: ImageUrlParams): string | undefined {
    const imageUrl = src || image?.disBaseLink || image?.link;

    if (!imageUrl) {
        return undefined;
    }

    try {
        // Extract and preserve any DynamicImage placeholder syntax (e.g., [?sw={width}])
        const placeholders = imageUrl.match(PLACEHOLDER_REGEX) || [];
        const cleanUrl = imageUrl.replace(PLACEHOLDER_REGEX, '');

        // When DIS is disabled, convert all image URLs to relative static paths
        if (config?.images?.enableDis === false) {
            return toRelativeStaticPath(imageUrl) ?? imageUrl;
        }

        // Fast path: source is already a DIS URL on a DIS-capable host. Use `toDisBaseUrl` to normalize
        // host/realm (no-op when already on the configured host) and then apply only format + quality,
        // leaving per-breakpoint params (sw/sh) for downstream code. The host-capability gate (via
        // `isDisTransformed`) prevents third-party hosts carrying `/dw/image/v2/` in the path from
        // receiving `sfrm`/`q` params they can't process (which would 404); those fall through to the
        // raw-SFCC branch below, which only rewrites when a realm and DIS host are derivable.
        if (isDisTransformed(cleanUrl, config)) {
            const normalized = toDisBaseUrl({ src: imageUrl, options, config }) ?? imageUrl;
            const normalizedClean = normalized.replace(PLACEHOLDER_REGEX, '');

            const targetFormat =
                options.format || config?.images?.formats?.[0] || config?.images?.fallbackFormat || 'webp';
            // Pass true for isDisEligible since isDisTransformed already confirmed eligibility above
            let transformedUrl = replaceImageFormat(normalizedClean, targetFormat, true, config);

            const quality = options.quality ?? config?.images?.quality;
            if (quality && !HAS_QUALITY_PARAM_REGEX.test(transformedUrl)) {
                const separator = transformedUrl.includes('?') ? '&' : '?';
                transformedUrl = `${transformedUrl}${separator}q=${quality}`;
            }

            return placeholders.length > 0 ? `${transformedUrl}${placeholders.join('')}` : transformedUrl;
        }

        // Raw SFCC URL — full DIS conversion applies width/height/quality/format.
        const disUrl = toDisImageUrl({ src: imageUrl, options, config });
        return disUrl ?? imageUrl;
    } catch {
        // On any error, return the original URL
        return imageUrl;
    }
}

/**
 * Transforms all image URLs in HTML content to use Dynamic Imaging Service (DIS).
 *
 * This function parses HTML content, finds all `<img>` tags, and transforms their
 * `src` attributes to use DIS URLs with WebP format optimization.
 *
 * @param html - HTML string containing image tags
 * @param config - Application configuration for DIS settings
 * @returns HTML string with transformed image URLs
 *
 * @example
 * const html = '<img src="/on/demandware.static/.../image.jpg" alt="Banner">';
 * const transformed = transformHtmlImageUrls(html, config);
 * // Returns: '<img src="https://edge.disstg.../image.webp?sfrm=jpg&q=70" alt="Banner">'
 */
export function transformHtmlImageUrls(html: string, config: AppConfig): string {
    // Return empty string for null/undefined to maintain type safety
    if (!html) {
        return '';
    }

    // Short-circuit if no image tags present (performance optimization)
    if (!html.includes('<img')) {
        return html;
    }

    // Regular expression to match <img> tags with src attributes
    const imgTagRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;

    return html.replace(imgTagRegex, (match, srcValue: string) => {
        // Transform the src URL using toImageUrl
        const transformedSrc = toImageUrl({ src: srcValue, config });

        // If transformation succeeded, replace only the src attribute value
        if (transformedSrc && transformedSrc !== srcValue) {
            // Use targeted regex to replace only src attribute, preserving quotes
            return match.replace(/src=(["'])([^"']+)\1/i, (_, quote) => `src=${quote}${transformedSrc}${quote}`);
        }

        // If transformation failed or URL unchanged, return original match
        return match;
    });
}

/**
 * Supported target formats of Salesforce's Dynamic Imaging Service are: avif, gif, jp2, jpg, jpeg, jxr, png, and webp.
 * @see {@link https://help.salesforce.com/s/articleView?id=cc.b2c_image_transformation_service.htm&type=5}
 * @see {@link https://help.salesforce.com/s/articleView?id=cc.b2c_creating_image_transformation_urls.htm&type=5}
 */
type DynamicImageFormat = 'avif' | 'gif' | 'jp2' | 'jpg' | 'jpeg' | 'jxr' | 'png' | 'webp';

export const defaultImageFormats: Array<DynamicImageFormat> = ['webp'];

const vwValue = /^[\d.]+vw$/;
const pxValue = /^[\d.]+px$/;
const emValue = /^[\d.]+em$/;
const remValue = /^[\d.]+rem$/;
const imageExtensions = /\.(avif|gif|jp2|jpe?g|png|tiff?|webp)(?=\?|$)/i;

/**
 * Returns `true` when `src` ends in a file extension that DIS can ingest as a source image. Use this to filter SCAPI
 * image-group entries before wrapping them in `<picture>`/`<DynamicImage>` — anything else (videos, 3D assets, unknown
 * blobs) cannot be transformed by DIS and should not be passed through the responsive image pipeline.
 *
 * The accepted extensions match the canonical list of DIS source formats:
 * avif, gif, jp2, jpg/jpeg, png, tif/tiff, webp.
 */
export const isDynamicImageSource = (src: string | undefined): boolean => {
    if (!src) {
        return false;
    }
    return imageExtensions.test(src);
};

// Tailwind CSS default breakpoints (converted from rem to px)
const defaultBreakpoints = {
    base: '0px',
    ...Object.fromEntries(
        Object.entries(defaultTheme.screens).map(([key, value]) => [
            key,
            remValue.test(value) ? `${parseFloat(value) * 16}px` : value,
        ])
    ),
} as const;

type Breakpoints = typeof defaultBreakpoints;
type BreakpointKey = keyof Breakpoints;

const getBreakpointLabels = (breakpoints: Record<string, string>): string[] =>
    Object.entries(breakpoints)
        .sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]))
        .map(([key]) => key);

let themeBreakpoints = defaultBreakpoints;
let breakpointLabels = getBreakpointLabels(themeBreakpoints);

/**
 * Helper to create very specific `media` attributes for responsive preload purposes.
 * @see {@link https://web.dev/articles/preload-responsive-images#picture}
 */
const obtainImageLinkMedia = (breakpointIndex: number): { min?: string; max?: string } | undefined => {
    const toMediaValue = (bp: string, type: 'min' | 'max') => {
        const val = themeBreakpoints[bp as BreakpointKey];
        if (emValue.test(val)) {
            // em value
            const parsed = parseFloat(val);
            return { [type]: type === 'max' ? `${parsed - 0.01}em` : `${parsed}em` };
        }

        const parsed = parseInt(val, 10);
        return { [type]: type === 'max' ? `${parsed - 1}px` : `${parsed}px` };
    };

    const nextBp = breakpointLabels[breakpointIndex + 1];
    const currentBp = breakpointLabels[breakpointIndex];
    if (breakpointIndex === 0) {
        // first
        return toMediaValue(nextBp, 'max');
    } else if (breakpointIndex === breakpointLabels.length - 1) {
        // last
        return toMediaValue(currentBp, 'min');
    }
    return { ...toMediaValue(currentBp, 'min'), ...toMediaValue(nextBp, 'max') };
};

const isObject = (o: unknown): o is Record<string, unknown> =>
    typeof o === 'object' && o !== null && o.constructor === Object;

/**
 * @example
 * // returns the array [10, 10, 10, 50]
 * widthsAsArray({base: 10, lg: 50})
 */
const widthsAsArray = (widths: Record<string, number | string>): Array<number | string> => {
    const biggestBreakpoint = breakpointLabels.filter((bp) => Boolean(widths[bp])).pop();

    if (!biggestBreakpoint) {
        return [];
    }

    const biggestBreakpointIndex = breakpointLabels.indexOf(biggestBreakpoint);
    let mostRecent: number | string | undefined;
    return breakpointLabels
        .slice(0, biggestBreakpointIndex + 1)
        .map((bp) => {
            if (widths[bp]) {
                mostRecent = widths[bp];
                return widths[bp];
            }
            return mostRecent;
        })
        .filter((item): item is number | string => item !== undefined);
};

const emToPx = (em: number, browserDefaultFontSize = 16): number => Math.round(em * browserDefaultFontSize);

const vwToPx = (vw: number, breakpoint: string): number => {
    const result = (vw / 100) * parseFloat(themeBreakpoints[breakpoint as BreakpointKey]);
    const breakpointsDefinedInPx = Object.values(themeBreakpoints).some((val) => pxValue.test(val));

    // Assumes theme's breakpoints are defined in either em or px
    return breakpointsDefinedInPx ? result : emToPx(result);
};

/** Anchored DIS path check — the `/dw/image/v\d+/` prefix must be at the START of `url.pathname`. */
const DIS_PATHNAME_PREFIX_REGEX = /^\/dw\/image\/v\d+\//i;

/**
 * Returns `true` when a URL is eligible for DIS transformation — it either already carries the DIS path structure
 * (`/dw/image/v\d+/` in the pathname) on a DIS-capable host, or it has already been transformed (carries the `sfrm`
 * query parameter) on a DIS-capable host. This predicate gates format conversion and param injection so non-DIS
 * hosts don't receive DIS-specific query parameters they can't process.
 *
 * **Correctness gates**:
 * - The `/dw/image/v\d+/` check is anchored to `url.pathname` (not the full URL string) to avoid false positives
 *   from query strings, fragments, or mid-path matches.
 * - The host must be DIS-capable (matches `config.images.host`, a `realmHostMappings` entry, or a built-in SFCC
 *   domain) before the URL is declared DIS-eligible. This prevents third-party hosts with coincidental paths from
 *   being misclassified.
 *
 * @param url - The URL string to test
 * @param config - App config containing DIS host and realm mappings (optional for backward compat, but required
 *                 for correct host-check behavior)
 * @returns `true` if the URL is DIS-eligible, `false` otherwise
 */
export const isDisTransformed = (url: string, config?: AppConfig): boolean => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        // Unparseable URL — fail closed
        return false;
    }

    // Already transformed if it carries the sfrm query parameter. Read it from the parsed query string
    // (not a regex over the raw URL) so a literal `&sfrm=` inside the pathname can't be mistaken for a
    // query param — consistent with the pathname-anchoring below. Defensive: if sfrm is present on a
    // non-DIS-capable host, it's a false signal (e.g., an attack or copy-paste from a DIS URL to a
    // third-party host), so verify the host before declaring it DIS-eligible.
    if (parsed.searchParams.has('sfrm')) {
        return isDISCapableHost(parsed, config);
    }

    // Check for DIS path structure (/dw/image/v2/...) anchored to the pathname. The DIS path alone is
    // not enough — the host must also be DIS-capable.
    if (!DIS_PATHNAME_PREFIX_REGEX.test(parsed.pathname)) {
        return false;
    }
    return isDISCapableHost(parsed, config);
};

/**
 * Replaces the image file extension in a URL with a configurable target format, e.g. `webp`.
 * Handles URLs with query parameters correctly.
 * If the format changes, appends the original extension as `sfrm` parameter.
 *
 * **Correctness gate**: Only applies transformation if the URL is DIS-eligible (has DIS path or sfrm param).
 * This prevents DIS params from leaking to non-DIS hosts that would return 404.
 *
 * @param url - The URL to transform
 * @param targetFormat - The desired image format
 * @param isDisEligible - Optional pre-computed DIS-eligibility flag to avoid redundant checks
 *
 * @example
 * // returns 'https://example.com/image.webp?sw=460&q=60&sfrm=jpg'
 * replaceImageFormat('https://example.com/image.jpg?sw=460&q=60')
 */
export const replaceImageFormat = (
    url: string,
    targetFormat: 'webp' | 'avif' | 'gif' | 'jp2' | 'jpg' | 'jpeg' | 'jxr' | 'png' = 'webp',
    isDisEligible?: boolean,
    config?: AppConfig
): string => {
    // If URL already has sfrm parameter, it's already been transformed - return as-is. Read it from
    // the parsed query (see hasSfrmParam) so a literal `&sfrm=` in a path segment isn't misread as a
    // query param — mirrors the check in isDisTransformed.
    if (hasSfrmParam(url)) {
        return url;
    }

    // Part 1: Stop the leak - only transform DIS-eligible URLs
    // Use pre-computed flag if provided to avoid redundant check
    const eligible = isDisEligible ?? isDisTransformed(url, config);
    if (!eligible) {
        return url;
    }

    const match = url.match(imageExtensions);
    if (!match) {
        return url;
    }

    const originalExtension = match[1].toLowerCase();
    if (originalExtension === targetFormat) {
        return url;
    }

    const newUrl = url.replace(imageExtensions, `.${targetFormat}`);
    const separator = newUrl.includes('?') ? '&' : '?';
    return `${newUrl}${separator}sfrm=${originalExtension}`;
};

/**
 * Interpolates DynamicImage placeholder syntax and injects DIS transformation parameters.
 *
 * **Correctness gate**: Only injects DIS params (`sw`, `sh`, `q`) and applies format conversion
 * when the URL is DIS-eligible. This prevents non-DIS hosts from receiving params they can't process.
 *
 * @example
 * // returns https://example.com/image_720.webp?sw=720&q=60&sfrm=jpg
 * getSrc('https://example.com/image[_{width}].jpg', { w: 720, q: 60 })
 */
export const getSrc = (
    dynamicSrc: string,
    {
        w,
        h,
        q,
        f,
    }: {
        /** Image width in px — maps to DIS `sw` parameter */
        w?: number;
        /** Image height in px — maps to DIS `sh` parameter */
        h?: number;
        /** Image quality (1-100) — maps to DIS `q` parameter */
        q?: number;
        /** Target image format — triggers format conversion via `sfrm` */
        f?: 'webp' | 'avif' | 'gif' | 'jp2' | 'jpg' | 'jpeg' | 'jxr' | 'png';
    } = {},
    config?: AppConfig
): string => {
    const getSep = (res: string): '?' | '&' => (res.includes('?') ? '&' : '?');
    const hasUrlParam = (url: string, param: string) => new RegExp(`[?&]${param}=`).test(url);

    // 1. Remove surrounding brackets from placeholder syntax
    // 2. Handle edge cases where DIS instructions are added to an already parameterized URL
    // 3. Replace named placeholders: {width} → w, {height} → h
    // 4. Replace any remaining unnamed placeholders with primary dimension (backward compat)
    const widthStr = w != null ? w.toString() : '';
    const heightStr = h != null ? h.toString() : widthStr;
    const fallbackStr = widthStr || heightStr;
    let result = dynamicSrc
        .replace(/\[([?&]?)([^\]]+)]/g, (_match, _sep, content, offset, fullString) => {
            const beforeMatch = fullString?.slice?.(0, offset);
            return `${getSep(beforeMatch)}${content}`;
        })
        .replace(/\{width}/g, widthStr)
        .replace(/\{height}/g, heightStr)
        .replace(/\{[^}]+}/g, fallbackStr);

    // Part 1: Stop the leak - only inject DIS params if URL is DIS-eligible
    const isDisEligible = isDisTransformed(result, config);

    // Handle sw= parameter - only added when width is explicitly provided and URL is DIS-eligible
    if (w != null && isDisEligible) {
        if (hasUrlParam(result, 'sw')) {
            result = result.replace(/([?&])sw=\d+/, `$1sw=${w}`);
        } else {
            result = `${result}${getSep(result)}sw=${w}`;
        }
    }

    // Handle sh= parameter - only added when height is explicitly provided and URL is DIS-eligible
    if (h != null && isDisEligible) {
        if (hasUrlParam(result, 'sh')) {
            result = result.replace(/([?&])sh=\d+/, `$1sh=${h}`);
        } else {
            result = `${result}${getSep(result)}sh=${h}`;
        }
    }

    // Handle quality parameter - existing q= in URL takes priority, only inject if DIS-eligible
    if (typeof q === 'number' && Number.isInteger(q) && !hasUrlParam(result, 'q') && isDisEligible) {
        result = `${result}${getSep(result)}q=${q}`;
    }

    // If no target format specified, don't convert format (keep original)
    // This is important for environments where DIS format conversion isn't available
    // Pass pre-computed isDisEligible to avoid redundant check in replaceImageFormat
    if (f) {
        return replaceImageFormat(result, f, isDisEligible, config);
    }
    return result;
};

/**
 * @example
 * // Returns 'https://example.com/image.jpg'
 * getSrcWithoutOptionalParams('https://example.com/image.jpg[?sw={width}]')
 */
const getSrcWithoutOptionalParams = (dynamicSrc: string): string => dynamicSrc.replace(/\[[^\]]+]/g, '');

const padArray = (arr: Array<number | string>): Array<number | string> => {
    const l1 = arr.length;
    const l2 = breakpointLabels.length;
    if (l1 < l2) {
        const lastEntry = arr[arr.length - 1];
        const amountToPad = l2 - l1;
        return [...arr, ...Array(amountToPad).fill(lastEntry)];
    }
    return arr;
};

const convertToPxNumbers = (widths: Array<number | string>): Array<number> =>
    widths
        .map((width, i) => {
            if (typeof width === 'number') {
                return width;
            }

            if (vwValue.test(width)) {
                const vw = parseFloat(width);
                const currentBp = breakpointLabels[i];
                // We imagine the biggest image for the current breakpoint
                // to be when the viewport is closely approaching the _next breakpoint_.
                const nextBp = breakpointLabels[i + 1];

                if (nextBp) {
                    return vwToPx(vw, nextBp);
                }
                // We're already at the last breakpoint
                return widths[i] !== widths[i - 1] ? vwToPx(vw, currentBp) : undefined;
            } else if (pxValue.test(width)) {
                return parseInt(width, 10);
            } else {
                logger.error('Expecting to see values with vw or px unit only');
                return 0;
            }
        })
        .filter((width): width is number => width !== undefined);

type ImageLink = {
    type: string;
    /**
     * Canonical 1x URL for this breakpoint. Used as the `href` of `<link rel="preload">`, where it
     * doubles as React's per-resource dedup key. The browser ignores `href` when `imagesrcset` is
     * present, so this URL is not what actually gets requested — `srcSet` is.
     */
    href: string;
    srcSet: string;
    sizes: string;
    media: { min?: string; max?: string };
};

type ConvertedImageLink = {
    type: string;
    href: string;
    srcSet: string;
    sizes: string;
    media: string;
};

/**
 * Transforms an array of preload link objects by converting the raw `media`
 * property of each entry (with `min` and/or `max` values) into actual media
 * queries using `(min-width)` and/or `(max-width)`.
 */
const convertImageLinksMedia = (links: ImageLink[]): ConvertedImageLink[] =>
    links.map((link) => {
        const {
            media: { min, max },
        } = link;
        const acc: string[] = [];
        if (min) {
            acc.push(`(min-width: ${min})`);
        }
        if (max) {
            acc.push(`(max-width: ${max})`);
        }
        return { ...link, media: acc.join(' and ') };
    });

type Source = {
    type: string;
    srcSet: string;
    sizes: string;
    media: string;
};

type ResponsiveData = {
    sources: Source[];
    links: ConvertedImageLink[];
};

const toMimeType = (format: DynamicImageFormat) => (format === 'jpg' ? 'image/jpeg' : `image/${format}`);

/**
 * Determines the data required for the responsive `<source>` and `<link rel="preload" type="image/{format}">
 * portions/elements.
 */
const getResponsiveSourcesAndLinks = (
    src: string,
    {
        widths,
        heights,
        formats,
        quality,
    }: {
        widths?: Array<number | string>;
        heights?: Array<number | string>;
        formats: Array<DynamicImageFormat>;
        quality?: number;
    },
    config?: AppConfig
): ResponsiveData => {
    // Use widths as the primary sizing dimension; fall back to heights for the `sizes` attribute
    // when only heights are provided (heights-only mode).
    const sizingDimension = widths ?? heights ?? [];

    // By default, unitless value is interpreted as px
    const sizeValues = sizingDimension.map((dim) => (typeof dim === 'number' ? `${dim}px` : dim));
    const l = sizeValues.length;

    const _sizes = breakpointLabels.map((bp, i) => {
        return i === 0
            ? {
                  media: '',
                  mediaLink: obtainImageLinkMedia(i),
                  sizes: sizeValues[i],
              }
            : {
                  media: `(min-width: ${themeBreakpoints[bp as BreakpointKey]})`,
                  mediaLink: obtainImageLinkMedia(i),
                  sizes: sizeValues.at(i >= l ? l - 1 : i),
              };
    });

    const sourcesWidths = widths ? convertToPxNumbers(padArray(widths)) : undefined;
    const sourcesHeights = heights ? convertToPxNumbers(padArray(heights)) : undefined;
    const sourcesLength = sourcesWidths?.length ?? sourcesHeights?.length ?? 0;
    const sourcesHeightsLength = sourcesHeights?.length ?? 0;
    // Use first format for srcSet generation (when DIS is disabled, formats is empty so no conversion occurs)
    const targetFormat = formats[0];
    const { sources, links } = breakpointLabels.reduce(
        (acc: { sources: Source[]; links: ImageLink[] }, _bp, idx) => {
            const width = sourcesWidths
                ? sourcesWidths[idx >= sourcesWidths.length ? sourcesWidths.length - 1 : idx]
                : undefined;
            const height = sourcesHeights
                ? sourcesHeights[idx >= sourcesHeightsLength ? sourcesHeightsLength - 1 : idx]
                : undefined;
            // The descriptor dimension used for the `w` descriptor in srcSet
            const descriptorDimension = width ?? height;
            const sizeData = _sizes[idx];
            if (!sizeData || !descriptorDimension) {
                return acc;
            }

            const { sizes, media, mediaLink } = sizeData;
            const firstSource = acc.sources[0];
            const lastLink = acc.links[acc.links.length - 1];
            // Canonical 1x URL for this breakpoint, captured separately so `<link rel="preload">` can use it as `href`.
            // A srcSet is a candidate-list, not a URL, so it isn't a valid `href` and would make React's per-resource
            // dedup key non-canonical.
            let href = '';
            const srcSet = [1, 2]
                .map((factor) => {
                    const effectiveWidth = width != null ? Math.round(width * factor) : undefined;
                    const effectiveHeight = height != null ? Math.round(height * factor) : undefined;
                    const descriptorValue = Math.round(descriptorDimension * factor);

                    const url = getSrc(
                        src,
                        { w: effectiveWidth, h: effectiveHeight, q: quality, f: targetFormat },
                        config
                    );
                    if (factor === 1) {
                        href = url;
                    }
                    return `${url} ${descriptorValue}w`;
                })
                .join(', ');

            if (idx < sourcesLength && sizes && (firstSource?.sizes !== sizes || srcSet !== firstSource?.srcSet)) {
                // Only store new `<source>` if we haven't already stored those values
                // Insert at beginning to achieve reversed `<source>` order
                for (let i = formats.length - 1; i >= 0; i--) {
                    acc.sources.unshift({ type: toMimeType(formats[i]), srcSet, sizes, media });
                }
            }

            if (sizes && (lastLink?.sizes !== sizes || srcSet !== lastLink?.srcSet)) {
                // Only store new `<link>` if we haven't already stored those values
                for (const format of formats) {
                    acc.links.push({ type: toMimeType(format), href, srcSet, sizes, media: mediaLink || {} });
                }
            } else if (lastLink && mediaLink) {
                // If we have already stored those values, update the `max` portion of the related `<link>` data
                lastLink.media.max = mediaLink.max;
            }
            return acc;
        },
        { sources: [], links: [] }
    );
    return { sources, links: convertImageLinksMedia(links) };
};

/**
 * Resolve the attributes required to create a DIS-optimized `<picture>` component.
 */
export const getResponsivePictureAttributes = ({
    src,
    widths,
    heights,
    formats = defaultImageFormats,
    breakpoints = defaultBreakpoints,
    quality,
    config,
}: {
    src: string;
    /**
     * Image widths relative to the breakpoints. Supports multiple formats:
     * - Array of numbers: [100, 360, 720] (unitless, interpreted as px)
     * - Array of strings with units: ['50vw', '100vw', '500px'] (mixed px and vw units)
     * - Object with breakpoint keys: {base: 100, sm: 360, md: 720} (unitless, interpreted as px)
     * - Object with breakpoint keys and units: {base: '100vw', sm: '50vw', md: '500px'}
     */
    widths?: DynamicImageDimensions;
    /**
     * Image heights relative to the breakpoints, used for DIS server-side cropping via
     * the `sh` parameter. Supports the same formats as `widths`. When provided alongside
     * `widths`, defines the exact crop box on the DIS server. When omitted, DIS preserves
     * the original aspect ratio based on `sw` alone.
     */
    heights?: DynamicImageDimensions;
    formats?: Array<DynamicImageFormat>;
    breakpoints?: Record<string, string>;
    /**
     * Image quality (1-100). If the source URL already contains a `q` parameter,
     * that value takes priority over this setting.
     */
    quality?: number;
    /** App config — threaded through so DIS-eligibility host-checks have the DIS host and realm mappings. */
    config?: AppConfig;
}): {
    sources: Source[];
    links: ConvertedImageLink[];
    src: string;
} => {
    if (!widths && !heights) {
        return {
            sources: [],
            links: [],
            src: getSrcWithoutOptionalParams(src),
        };
    }

    if (breakpoints !== themeBreakpoints) {
        themeBreakpoints = breakpoints as typeof defaultBreakpoints;
        breakpointLabels = getBreakpointLabels(themeBreakpoints);
    }

    const _widths = widths ? (isObject(widths) ? widthsAsArray(widths) : widths.slice(0)) : undefined;
    const _heights = heights ? (isObject(heights) ? widthsAsArray(heights) : heights.slice(0)) : undefined;
    const { sources, links } = getResponsiveSourcesAndLinks(
        src,
        {
            widths: _widths,
            heights: _heights,
            formats,
            quality,
        },
        config
    );

    return {
        sources,
        links,
        src: getSrcWithoutOptionalParams(src),
    };
};

/**
 * Single source of truth for the URL math both `<DynamicImage>` and `preloadDynamicImage()` rely on. Owns the `images`
 * config destructure with defaults so the render path and the prefetch path can never produce different URLs for the
 * same input.
 */
export const resolveDynamicImageAttributes = ({
    src,
    config,
    widths,
    heights,
}: {
    src: string;
    config: AppConfig;
    widths?: DynamicImageDimensions;
    heights?: DynamicImageDimensions;
}) => {
    const {
        quality = 70,
        formats = defaultImageFormats,
        fallbackFormat = 'jpg',
        enableDis = true,
    } = config.images ?? {};

    const transformedSrc = (enableDis ? toDisBaseUrl({ src, config }) : toImageUrl({ src, config })) || src;

    // DIS can only resize/convert URLs it actually routes through the imaging service — i.e. ones `toDisBaseUrl`
    // rewrote into `/dw/image/v2/{realm}/`. A relative bundled asset (`/images/hero-01.webp`) or a third-party host
    // (`https://via.placeholder.com/300`) has no derivable realm, so `toDisBaseUrl` returns it unchanged, and it never
    // gains that prefix. "Absolute" is not enough: applying format conversion or query params to those would fabricate
    // URLs the origin doesn't serve (`/images/hero-01.jpg?sfrm=webp` — a 404, or `…/300.webp?sw=300` on a host that
    // ignores it). Gate on "is this actually a DIS URL" so DIS is inactive unless the rewrite succeeded.
    const disApplies = enableDis && isDisTransformed(transformedSrc, config);

    // Empty `formats` is the off-switch for `<source>` format conversion in `getResponsiveSourcesAndLinks`:
    // `targetFormat` becomes `undefined`, so srcSet URLs keep the original extension and no `sfrm=` is emitted.
    // Don't replace this with `[fallbackFormat]` — that would re-engage DIS-only rewrites we explicitly disabled.
    const effectiveFormats = disApplies ? formats : [];

    const responsive = getResponsivePictureAttributes({
        src: transformedSrc,
        widths,
        heights,
        quality: disApplies ? quality : undefined,
        formats: effectiveFormats,
        config,
    });

    // `enableDis` reflects whether DIS is actually in effect for this image — the render path keys the `<img>` format
    // rewrite off it, so a local asset (disApplies=false) keeps its original URL.
    return { ...responsive, transformedSrc, enableDis: disApplies, fallbackFormat };
};
