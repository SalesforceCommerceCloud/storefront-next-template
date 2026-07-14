import { n as Site$1, r as Url, t as Locale$1 } from "./types.js";
import { PropsWithChildren } from "react";
import * as react_jsx_runtime1 from "react/jsx-runtime";
import * as react_router8 from "react-router";
import { Cookie, CookieOptions, MiddlewareFunction, RouterContextProvider } from "react-router";
import { RouteConfigEntry } from "@react-router/dev/routes";

//#region src/site-context/types.d.ts

type Locale = Locale$1 & {
  alias?: string;
};
type Site = Omit<Site$1, 'supportedLocales'> & {
  name?: string;
  alias?: string;
  supportedLocales: Locale[];
};
type SiteContext = {
  site: Site;
  locale: Locale;
  currency: string;
  siteCookie: Cookie;
  localeCookie: Cookie;
  currencyCookie: Cookie;
};
/**
 * Configuration passed into the site context middleware
 * Configured by the consumer
 */
type SiteConfig = {
  sites: Site[];
  defaultSiteId: string;
  defaultLocale: string;
  siteDetectionConfig?: DetectionConfig;
  localeDetectionConfig?: DetectionConfig;
  currencyCookieName?: string;
  cookieOptions?: CookieOptions;
};
/**
 * Resolved settings used by site/locale/currency resolution (all detection options have values).
 */
type SiteSettings = SiteConfig & {
  siteDetectionConfig: Required<DetectionConfig>;
  localeDetectionConfig: Required<DetectionConfig>;
  siteCookie: Cookie;
  localeCookie: Cookie;
  currencyCookie: Cookie;
};
/** Detection method identifier (used for both site and locale detection) */
type DetectionMethod = 'path' | 'querystring' | 'cookie' | 'header';
type DetectionConfig = {
  order: DetectionMethod[];
  lookupFromPathIndex?: number;
  lookupQuerystring?: string;
  lookupCookie?: string;
  lookupHeader?: string;
  caches?: Array<'cookie'>;
};
//#endregion
//#region src/site-context/site-context.d.ts
/**
 * The value provided by {@link SiteProvider} and returned by {@link useSite}.
 */
type SiteContextValue = {
  /**
   * The resolved site configuration object for the current request.
   * Contains the site's supported locales, supported currencies, and default values.
   */
  site: Site;
  /**
   * The full locale object from the site's `supportedLocales` list for the current request.
   * Contains structured locale metadata: `id` (e.g. `"en-GB"`), optional `alias` (e.g. `"en"`),
   * and optional `preferredCurrency`.
   *
   */
  locale: Locale;
  /**
   * The current i18next language string (e.g. `"en-GB"`, `"fr-FR"`).
   * This is the value returned by `i18next.language` and drives which translation
   * namespace is active. Passed as a prop because the SDK has no react-i18next dependency.
   *
   * @see {@link SiteContextValue.locale} for the full locale object from site config.
   */
  language: string;
  /**
   * The active currency code for the current session (e.g. `"USD"`, `"GBP"`).
   * Resolved from the locale's `preferredCurrency`, a currency cookie, or the site's
   * `defaultCurrency`.
   */
  currency: string;
};
/**
 * Provides the current site context (site, locale, language, currency) to the component tree.
 *
 * Mounted in the template's root.tsx with the resolved values from the
 * loader/middleware. The SDK has no react-i18next dependency, so `language`
 * is passed as a prop from the template.
 */
declare function SiteProvider({
  site,
  locale,
  language,
  currency,
  children
}: PropsWithChildren<SiteContextValue>): react_jsx_runtime1.JSX.Element;
/**
 * React hook to get the current site context.
 * Returns `{ site, locale, language, currency }`.
 * @throws If called outside of a SiteProvider
 */
declare function useSite(): SiteContextValue;
//#endregion
//#region src/site-context/apply-url-config.d.ts
/**
 * Applies site context URL configuration to a set of route entries.
 *
 * Wraps non-excluded routes under a parent route with the configured URL prefix
 * (e.g. `/:siteId/:localeId`), while keeping excluded routes (action/resource by default)
 * at the root level. The homepage index route (and its parent layout) is always
 * duplicated at `/` so the root URL still serves content.
 *
 * @param options - Configuration for URL customisation.
 * @param options.routes - The flat route entries discovered from the filesystem.
 * @param options.urlConfig - URL customisation configuration (prefix, excludeRoutes).
 * @param options.wrapperFile - Path to the wrapper component file, relative to appDirectory.
 * @returns The transformed route entries with prefix wrapping applied.
 */
declare function applyUrlConfig(options: {
  routes: RouteConfigEntry[];
  urlConfig?: Url;
  wrapperFile: string;
}): RouteConfigEntry[];
//#endregion
//#region src/site-context/build-url.d.ts
/**
 * Resolves a prefix template by replacing parameter placeholders with values.
 *
 * @example
 * resolvePrefix({ prefix: '/:siteId/:localeId', params: { siteId: 'global', localeId: 'en-GB' } })
 * // → '/global/en-GB'
 */
declare function resolvePrefix({
  prefix,
  params
}: {
  prefix: string;
  params: Record<string, string>;
}): string;
/**
 * Strips a URL prefix from a pathname.
 *
 * Accepts either a resolved prefix or a prefix pattern — segments may be
 * literal strings (must match the pathname exactly) or `:param` placeholders
 * (match any segment value). Mixed prefixes are supported.
 *
 * Returns `''` when the pathname matches the prefix exactly with no remainder
 * (so concatenating `prefix + result` round-trips the input), `pathname`
 * unchanged when literal segments don't match or the path is shorter than the
 * prefix, or the bare remainder otherwise. Callers that need the homepage to
 * be `'/'` should coerce: `stripPathPrefix(...) || '/'`.
 *
 * @example
 * stripPathPrefix({ pathname: '/global/en-GB/checkout', prefix: '/:siteId/:localeId' })   // → '/checkout'
 * stripPathPrefix({ pathname: '/global/en-GB/checkout', prefix: '/global/en-GB' })        // → '/checkout'
 * stripPathPrefix({ pathname: '/shop/en-GB/x',          prefix: '/shop/:localeId' })      // → '/x'
 * stripPathPrefix({ pathname: '/global/en-GB',          prefix: '/:siteId/:localeId' })   // → ''
 * stripPathPrefix({ pathname: '/checkout',              prefix: '/:siteId/:localeId' })   // → '/checkout'
 * stripPathPrefix({ pathname: '/other/x',               prefix: '/global/en-GB' })        // → '/other/x'
 * stripPathPrefix({ pathname: '/x',                     prefix: '' })                     // → '/x'
 */
declare function stripPathPrefix({
  pathname,
  prefix
}: {
  pathname: string;
  prefix: string;
}): string;
/**
 * Extracts the values of `:param` placeholders in a prefix pattern from a pathname.
 *
 * Mirrors {@link stripPathPrefix}'s matching rules: literal segments must match the
 * pathname exactly, `:param` segments capture the corresponding path segment. Returns
 * an empty object when the pathname doesn't carry the prefix (a literal segment
 * mismatches, or the path has fewer segments than the prefix) — so a non-empty result
 * is a reliable signal that the prefix was present.
 *
 * Pair this with {@link stripPathPrefix}: strip gives you the bare functional path,
 * this gives you the site/locale the path carried. Together they let a caller
 * re-decorate a path for a different URL shape without double-stacking.
 *
 * @example
 * extractPrefixParamValues({ pathname: '/global/en-GB/cart', prefix: '/:siteId/:localeId' }) // → { siteId: 'global', localeId: 'en-GB' }
 * extractPrefixParamValues({ pathname: '/uk/cart',           prefix: '/:localeId' })          // → { localeId: 'uk' }
 * extractPrefixParamValues({ pathname: '/shop/uk/x',         prefix: '/shop/:localeId' })     // → { localeId: 'uk' }
 * extractPrefixParamValues({ pathname: '/cart',              prefix: '/:siteId/:localeId' })  // → {} (too few segments)
 * extractPrefixParamValues({ pathname: '/other/x',          prefix: '/shop/:localeId' })     // → {} (literal mismatch)
 * extractPrefixParamValues({ pathname: '/cart',              prefix: '' })                    // → {}
 */
declare function extractPrefixParamValues({
  pathname,
  prefix
}: {
  pathname: string;
  prefix: string;
}): Record<string, string>;
/**
 * Builds a fully-qualified URL with site context prefix and search params.
 *
 * Only keys defined in urlConfig.search are set by site context. Any other query params
 * already present on the `to` URL (including duplicate keys) are preserved as-is.
 * e.g. to='/api/search?refine=color:blue&refine=size:M', search='?lng=:localeId'
 *   → '/api/search?refine=color:blue&refine=size:M&lng=en-GB'
 *
 * External links (explicit scheme, protocol-relative, or a scheme-less bare domain) are never
 * site-prefixed — see {@link classifyExternal}.
 *
 * @example
 * buildUrl({ to: '/product/123', urlConfig: { prefix: '/:siteId', search: '?lng=:localeId' }, params: { siteId: 'global', localeId: 'en-GB' } })
 * // → '/global/product/123?lng=en-GB'
 */
declare function buildUrl({
  to,
  urlConfig,
  params
}: {
  to: string;
  urlConfig?: Url;
  params: Record<string, string>;
}): string;
//#endregion
//#region src/site-context/middleware.d.ts
declare const siteContext: react_router8.RouterContext<SiteContext | null>;
/**
 * Resolved site context result from {@link resolveSiteContext}.
 */
type ResolvedSiteContext = {
  site: Site;
  locale: Locale;
  currency: string;
};
/**
 * Resolve site, locale, and currency from a request in one call.
 *
 * This is the recommended public entry point for site-context resolution.
 * It encapsulates the required resolution order (site → locale → currency)
 * so consumers don't need to manage the dependency chain manually.
 *
 * The individual resolvers (`resolveSite`, `resolveLocale`, `resolveCurrency`)
 * are available as advanced utilities for cases that need fine-grained control.
 *
 * @param request - Incoming HTTP request
 * @param settings - Fully resolved site settings (with detection config and cookies)
 * @returns Resolved site, locale, and currency
 *
 * @example
 * ```typescript
 * const { site, locale, currency } = await resolveSiteContext(request, settings);
 * ```
 */
declare function resolveSiteContext(request: Request, settings: SiteSettings): Promise<ResolvedSiteContext>;
/**
 * Helper function to get site context cookies from router context.
 * Useful in server actions and loaders that need to read/set cookies.
 *
 * @param context - Router context provider
 * @returns Object with siteCookie and localeCookie instances, or null if context not set
 *
 * @example
 * ```typescript
 * export const action: ActionFunction = async ({ request, context }) => {
 *     const cookies = getSiteContextCookies(context);
 *     if (cookies) {
 *         const cookieHeader = await cookies.localeCookie.serialize(locale);
 *         // ... use cookieHeader
 *     }
 * };
 * ```
 */
declare function getSiteContextCookies(context: Readonly<RouterContextProvider>): {
  siteCookie: react_router8.Cookie;
  localeCookie: react_router8.Cookie;
  currencyCookie: react_router8.Cookie;
} | null;
/**
 * Creates a site context middleware that resolves the current site from
 * the request (path, cookie, header, query, or default) and stores the
 * result in the router context.
 *
 * Does not import or read from app config context; the consumer supplies config.
 */
declare function createSiteContextMiddleware(config: SiteConfig): MiddlewareFunction<Response>;
//#endregion
//#region src/site-context/cookies.d.ts
/**
 * WeakMap to pass resolved locale from site context middleware to i18next's findLocale.
 * WeakMap allows garbage collection when requests are done.
 * This is necessary because findLocale() only receives the Request object, not the router context.
 */
declare const requestToLocaleMap: WeakMap<Request, string>;
//#endregion
export { type DetectionConfig, type Locale, type ResolvedSiteContext, type Site, type SiteConfig, type SiteContext, type SiteContextValue, SiteProvider, type SiteSettings, applyUrlConfig, buildUrl, createSiteContextMiddleware, extractPrefixParamValues, getSiteContextCookies, requestToLocaleMap, resolvePrefix, resolveSiteContext, siteContext, stripPathPrefix, useSite };
//# sourceMappingURL=site-context.d.ts.map