import { t as isRemote } from "./env2.js";
import { createContext, useContext, useMemo } from "react";
import { jsx } from "react/jsx-runtime";
import { createContext as createContext$1, createCookie } from "react-router";

//#region src/site-context/site-context.tsx
const SiteContext = createContext(void 0);
/**
* Provides the current site context (site, locale, language, currency) to the component tree.
*
* Mounted in the template's root.tsx with the resolved values from the
* loader/middleware. The SDK has no react-i18next dependency, so `language`
* is passed as a prop from the template.
*/
function SiteProvider({ site, locale, language, currency, children }) {
	const value = useMemo(() => ({
		site,
		locale,
		language,
		currency
	}), [
		site,
		locale,
		language,
		currency
	]);
	return /* @__PURE__ */ jsx(SiteContext.Provider, {
		value,
		children
	});
}
/**
* React hook to get the current site context.
* Returns `{ site, locale, language, currency }`.
* @throws If called outside of a SiteProvider
*/
function useSite() {
	const value = useContext(SiteContext);
	if (!value) throw new Error("useSite must be used within a SiteProvider");
	return value;
}

//#endregion
//#region src/site-context/build-url.ts
/**
* Parses search config string into key-value pairs, preserving ':param' placeholders.
* '?lng=:localeId&site=:siteId' → { lng: ':localeId', site: ':siteId' }
*/
function parseSearchConfig(search) {
	const searchParams = new URLSearchParams(search);
	const result = {};
	for (const [key, value] of searchParams) result[key] = value;
	return result;
}
/**
* Extracts parameter names from a prefix string.
* '/:siteId/:localeId' → ['siteId', 'localeId']
*/
function extractPrefixParams(prefix) {
	const matches = prefix.match(/:(\w+)/g);
	return matches ? matches.map((m) => m.slice(1)) : [];
}
/**
* Splits a URL string into its component parts.
* '/product/123?color=red#details' → { pathname: '/product/123', search: 'color=red', hash: '#details' }
*/
function decomposeUrl(url) {
	const hashIdx = url.indexOf("#");
	const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";
	const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
	const searchIdx = withoutHash.indexOf("?");
	const search = searchIdx >= 0 ? withoutHash.slice(searchIdx + 1) : "";
	return {
		pathname: searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash,
		search,
		hash
	};
}
/**
* Resolves a prefix template by replacing parameter placeholders with values.
*
* @example
* resolvePrefix({ prefix: '/:siteId/:localeId', params: { siteId: 'global', localeId: 'en-GB' } })
* // → '/global/en-GB'
*/
function resolvePrefix({ prefix, params }) {
	let resolved = prefix;
	for (const paramName of extractPrefixParams(prefix)) {
		const value = params[paramName];
		if (value) resolved = resolved.replace(`:${paramName}`, value);
	}
	return resolved;
}
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
function stripPathPrefix({ pathname, prefix }) {
	if (!prefix || prefix === "/") return pathname;
	const prefixSegments = prefix.split("/").filter(Boolean);
	const pathSegments = pathname.split("/").filter(Boolean);
	if (pathSegments.length < prefixSegments.length) return pathname;
	for (let i = 0; i < prefixSegments.length; i++) {
		const segment = prefixSegments[i];
		if (!segment.startsWith(":") && segment !== pathSegments[i]) return pathname;
	}
	const remaining = pathSegments.slice(prefixSegments.length);
	return remaining.length === 0 ? "" : `/${remaining.join("/")}`;
}
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
function extractPrefixParamValues({ pathname, prefix }) {
	if (!prefix || prefix === "/") return {};
	const prefixSegments = prefix.split("/").filter(Boolean);
	const pathSegments = pathname.split("/").filter(Boolean);
	if (pathSegments.length < prefixSegments.length) return {};
	const values = {};
	for (let i = 0; i < prefixSegments.length; i++) {
		const segment = prefixSegments[i];
		if (segment.startsWith(":")) values[segment.slice(1)] = pathSegments[i];
		else if (segment !== pathSegments[i]) return {};
	}
	return values;
}
/**
* Detects a link that targets somewhere outside this app's routing and must NOT receive the
* site/locale prefix. Three shapes count as external:
*
* 1. **Explicit scheme** — `https://…`, `mailto:…`, `tel:…`, `ftp://…`, etc. Matched by a leading
*    `scheme:` per RFC 3986 (a letter followed by letters/digits/`+`/`-`/`.`, then `:`).
* 2. **Protocol-relative** — `//example.com/page`.
* 3. **Scheme-less bare domain** — what a merchant typically types into a Page Designer link field,
*    e.g. `www.google.com` or `example.com/products`. It does not start with `/`, and its first
*    path segment contains a dot (a hostname), so it is not an in-app route. These are normalized
*    to `https://` by {@link buildUrl} so the browser performs a real cross-origin navigation
*    instead of resolving them as a relative in-app path (which would glue the site prefix on and
*    produce a broken link like `/global/en-GBwww.google.com`).
*
* A rooted path is always internal, even when it contains a dot (e.g. `/assets/sitemap.xml`).
* Conversely, an *unrooted* dotted value with no slash (e.g. `page.html`, `sitemap.xml`) is
* genuinely ambiguous — filename or domain — and is intentionally treated as a domain
* (`https://page.html`); author unrooted internal targets as rooted paths (`/page.html`).
* Relative-path prefixes (`./sibling`, `../parent`) are exempted and stay internal.
*/
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
function classifyExternal(to) {
	if (SCHEME_RE.test(to) || to.startsWith("//")) return "passthrough";
	const firstSegment = to.split("/")[0];
	if (!to.startsWith("/") && firstSegment !== "." && firstSegment !== ".." && firstSegment.includes(".")) return "normalize";
	return "internal";
}
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
function buildUrl({ to, urlConfig, params }) {
	if (!urlConfig) return to;
	if (!to || to === "#") return to;
	const external = classifyExternal(to);
	if (external === "passthrough") return to;
	if (external === "normalize") return `https://${to}`;
	const { pathname, search: existingSearch, hash } = decomposeUrl(to);
	const pathPrefix = urlConfig.prefix && urlConfig.prefix !== "/" ? resolvePrefix({
		prefix: urlConfig.prefix,
		params
	}) : "";
	const path = pathPrefix ? `${pathPrefix}${stripPathPrefix({
		pathname,
		prefix: pathPrefix
	})}` : pathname;
	const searchParams = new URLSearchParams(existingSearch);
	if (urlConfig.search) {
		const searchConfig = parseSearchConfig(urlConfig.search);
		for (const [queryKey, value] of Object.entries(searchConfig)) if (value.startsWith(":")) {
			const paramValue = params[value.slice(1)];
			if (paramValue) searchParams.set(queryKey, paramValue);
		} else searchParams.set(queryKey, value);
	}
	const search = searchParams.toString();
	return `${path}${search ? `?${search}` : ""}${hash}`;
}

//#endregion
//#region src/site-context/utils.ts
/**
* Extract a string value from the URL path segment at the given index.
*/
function lookupFromPath(pathname, pathIndex) {
	const pathSegments = pathname.split("/").filter(Boolean);
	if (pathSegments.length <= pathIndex) return null;
	return pathSegments[pathIndex];
}
/**
* Detect a string value from cookie using the given cookie parser.
*
* Returns a promise that resolves to the cookie value.
*/
async function readCookieFromRequest(request, cookie) {
	const cookies = request.headers.get("Cookie");
	if (!cookies) return null;
	return await cookie.parse(cookies);
}

//#endregion
//#region src/site-context/site-detection.ts
/**
* Detect site reference from cookie.
*/
async function readSiteFromCookie(request, cookie) {
	return readCookieFromRequest(request, cookie);
}
/**
* Get site object using the site id or alias
* 1. Check siteIdentifier against each site's alias; if matched, return that site.
* 2. Else check against each site's id; if matched, return that site.
* 3. If no match, return null.
*/
function getSiteFromIdOrAlias(siteIdentifier, sites) {
	if (!siteIdentifier) return null;
	return sites.find((site) => site.alias === siteIdentifier || site.id === siteIdentifier) ?? null;
}
/**
* Resolve site using the configured detection order.
* Returns the first valid site from the first source that yields a valid value.
*/
async function resolveSite(request, settings) {
	const { sites, defaultSiteId, siteDetectionConfig, siteCookie } = settings;
	const requestUrl = new URL(request.url);
	const basePathOffset = process.env.MRT_ENV_BASE_PATH ? process.env.MRT_ENV_BASE_PATH.split("/").filter(Boolean).length : 0;
	const resolvers = {
		path: () => Promise.resolve(lookupFromPath(requestUrl.pathname, siteDetectionConfig.lookupFromPathIndex + basePathOffset)),
		querystring: () => Promise.resolve(requestUrl.searchParams.get(siteDetectionConfig.lookupQuerystring)),
		header: () => Promise.resolve(request.headers.get(siteDetectionConfig.lookupHeader)),
		cookie: async () => readSiteFromCookie(request, siteCookie)
	};
	for (const method of siteDetectionConfig.order) {
		const resolvedSite = getSiteFromIdOrAlias(await resolvers[method]?.(), sites);
		if (resolvedSite) return resolvedSite;
	}
	const site = getSiteFromIdOrAlias(defaultSiteId, sites);
	if (!site) throw new Error(`Default site ${defaultSiteId} not found.`);
	return site;
}

//#endregion
//#region src/site-context/configs.ts
const DEFAULT_CURRENCY_COOKIE_NAME = "currency";
/**
* Default site detection configuration
*/
const DEFAULT_SITE_DETECTION = {
	order: [
		"path",
		"querystring",
		"cookie",
		"header"
	],
	lookupFromPathIndex: 0,
	lookupQuerystring: "site",
	lookupCookie: "site_id",
	lookupHeader: "X-Site-Id",
	caches: ["cookie"]
};
/**
* Default locale detection configuration
*/
const DEFAULT_LOCALE_DETECTION = {
	order: [
		"path",
		"querystring",
		"cookie",
		"header"
	],
	lookupFromPathIndex: 1,
	lookupQuerystring: "lng",
	lookupCookie: "lng",
	lookupHeader: "Accept-Language",
	caches: ["cookie"]
};

//#endregion
//#region src/site-context/cookies.ts
/**
* Base cookie options for site context cookies (site, locale, currency).
*
* Internal: `secure` is intentionally absent so it can be resolved per call via
* {@link isRemote} in {@link resolveCookieOptions} (reflecting `BUNDLE_ID` at
* request time rather than at module load). Because it is incomplete on its own,
* it is not exported — consumers use the factory functions below, which always
* apply the correct `secure` value.
*/
const COOKIE_OPTIONS = {
	path: "/",
	sameSite: "lax",
	httpOnly: true
};
/**
* Build the per-call cookie options.
*
* `secure` is gated on {@link isRemote} (BUNDLE_ID), NOT `NODE_ENV`: `pnpm
* preview` runs a production build over plain-HTTP `localhost`, where a
* `NODE_ENV` gate would emit `Secure` and Safari/WebKit would then refuse to
* persist these cookies. This keeps the signal consistent with the auth-cookie
* defaults and the HSTS / upgrade-insecure-requests gates. Caller `options` win,
* so an explicit `secure` still overrides the default.
*/
function resolveCookieOptions(options) {
	return {
		...COOKIE_OPTIONS,
		secure: isRemote(),
		...options
	};
}
/**
* Creates a cookie instance with the given name.
*
* @param name - Cookie name
* @returns Cookie instance configured with site context options
*/
function createSiteContextCookie(name, options) {
	return createCookie(name, resolveCookieOptions(options));
}
/**
* Creates a currency cookie instance with the given name.
*
* @param name - Cookie name
* @returns Cookie instance configured with site context cookie options
*/
function createCurrencyCookie(name, options) {
	return createCookie(name, resolveCookieOptions(options));
}
/**
* WeakMap to pass resolved locale from site context middleware to i18next's findLocale.
* WeakMap allows garbage collection when requests are done.
* This is necessary because findLocale() only receives the Request object, not the router context.
*/
const requestToLocaleMap = /* @__PURE__ */ new WeakMap();

//#endregion
//#region src/site-context/locale-detection.ts
/**
* Read locale from cookie.
*/
async function readLocaleFromCookie(request, cookie) {
	return readCookieFromRequest(request, cookie);
}
/**
* Get locale object using the locale id or alias.
* 1. Check localeIdOrAlias against each locale's alias; if matched, return that locale.
* 2. Else check against each locale's id; if matched, return that locale.
* 3. If no match, return null (caller should use defaultLocale).
*
* @param localeIdentifier - The locale id or alias to get the locale from. Null is allowed because this may come from
* extrenal sources such as cookies, headers, or query parameters.
* @param locales - The list of locales to search through.
* @returns The locale object if found, otherwise null.
*/
function getLocaleFromIdOrAlias(localeIdentifier, locales) {
	if (!localeIdentifier) return null;
	return locales.find((locale) => locale.alias === localeIdentifier || locale.id === localeIdentifier) ?? null;
}
/**
* Resolve locale using the configured detection order.
* Returns the first valid locale from the first source that yields a valid value.
*/
async function resolveLocale(request, settings, site) {
	const { defaultLocale, localeDetectionConfig, localeCookie } = settings;
	const { supportedLocales } = site;
	let locale = null;
	const requestUrl = new URL(request.url);
	const basePathOffset = process.env.MRT_ENV_BASE_PATH ? process.env.MRT_ENV_BASE_PATH.split("/").filter(Boolean).length : 0;
	const resolvers = {
		path: () => Promise.resolve(lookupFromPath(requestUrl.pathname, localeDetectionConfig.lookupFromPathIndex + basePathOffset)),
		querystring: () => Promise.resolve(requestUrl.searchParams.get(localeDetectionConfig.lookupQuerystring)),
		header: () => Promise.resolve(request.headers.get(localeDetectionConfig.lookupHeader)),
		cookie: async () => readLocaleFromCookie(request, localeCookie)
	};
	for (const method of localeDetectionConfig.order) {
		const resolvedLocale = getLocaleFromIdOrAlias(await resolvers[method]?.(), supportedLocales);
		if (resolvedLocale) return resolvedLocale;
	}
	if (!locale) locale = getLocaleFromIdOrAlias(defaultLocale, supportedLocales);
	if (!locale) throw new Error(`Default locale ${defaultLocale} not found in the list of supported locales for site ${site.id}.`);
	return locale;
}

//#endregion
//#region src/site-context/currency-detection.ts
/**
* Resolve the currency for the current request.
*
* Priority:
* 1. Cookie (user-selected currency, if valid for this site)
* 2. Locale's preferred currency (if valid for this site)
* 3. Site's default currency
*
* @param request - Incoming request
* @param currencyCookie - Cookie instance for reading the currency cookie
* @param site - Resolved site for this request
* @param locale - Resolved locale for this request
* @returns The resolved currency code
*/
async function resolveCurrency(request, currencyCookie, site, locale) {
	const { supportedCurrencies, defaultCurrency } = site;
	if (!supportedCurrencies || supportedCurrencies.length === 0) throw new Error(`Site "${site.id}" must have supportedCurrencies configured.`);
	const cookieValue = await readCookieFromRequest(request, currencyCookie);
	if (typeof cookieValue === "string" && supportedCurrencies.includes(cookieValue)) return cookieValue;
	if (locale.preferredCurrency && supportedCurrencies.includes(locale.preferredCurrency)) return locale.preferredCurrency;
	return defaultCurrency;
}

//#endregion
//#region src/site-context/middleware.ts
const siteContext = createContext$1(null);
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
async function resolveSiteContext(request, settings) {
	const site = await resolveSite(request, settings);
	const locale = await resolveLocale(request, settings, site);
	return {
		site,
		locale,
		currency: await resolveCurrency(request, settings.currencyCookie, site, locale)
	};
}
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
function getSiteContextCookies(context) {
	const siteCtx = context.get(siteContext);
	if (!siteCtx) return null;
	return {
		siteCookie: siteCtx.siteCookie,
		localeCookie: siteCtx.localeCookie,
		currencyCookie: siteCtx.currencyCookie
	};
}
/**
* Helper function to determine if cookies should be set based on:
* 1. Whether caching is enabled for each cookie type
* 2. Whether the resolved value differs from the existing cookie
* 3. Whether cookies were already set by actions/loaders in the response
*
* @param request - Incoming request
* @param response - Response from next()
* @param settings - Site context settings with cookie instances and detection config
* @param site - Resolved site for this request
* @param locale - Resolved locale for this request
* @param currency - Resolved currency for this request
* @returns Object with shouldSetSiteCookie, shouldSetLocaleCookie, and shouldSetCurrencyCookie booleans
*/
async function shouldSetCookies(request, response, settings, site, locale, currency) {
	const cacheSite = settings.siteDetectionConfig.caches?.includes("cookie");
	const cacheLocale = settings.localeDetectionConfig.caches?.includes("cookie");
	const responseSetCookies = response.headers.getSetCookie?.() || [];
	const isSettingSiteCookieInResponse = responseSetCookies.some((cookie) => cookie.startsWith(`${settings.siteCookie.name}=`));
	const isSettingLocaleCookieInResponse = responseSetCookies.some((cookie) => cookie.startsWith(`${settings.localeCookie.name}=`));
	const isSettingCurrencyCookieInResponse = responseSetCookies.some((cookie) => cookie.startsWith(`${settings.currencyCookie.name}=`));
	const requestCookieHeader = request.headers.get("Cookie");
	const [existingSiteCookie, existingLocaleCookie, existingCurrencyCookie] = await Promise.all([
		settings.siteCookie.parse(requestCookieHeader),
		settings.localeCookie.parse(requestCookieHeader),
		settings.currencyCookie.parse(requestCookieHeader)
	]);
	return {
		shouldSetSiteCookie: cacheSite && !isSettingSiteCookieInResponse && existingSiteCookie !== site.id,
		shouldSetLocaleCookie: cacheLocale && !isSettingLocaleCookieInResponse && existingLocaleCookie !== locale.id,
		shouldSetCurrencyCookie: !isSettingCurrencyCookieInResponse && existingCurrencyCookie !== currency
	};
}
/**
* Creates a site context middleware that resolves the current site from
* the request (path, cookie, header, query, or default) and stores the
* result in the router context.
*
* Does not import or read from app config context; the consumer supplies config.
*/
function createSiteContextMiddleware(config) {
	const siteDetectionConfig = {
		...DEFAULT_SITE_DETECTION,
		...config.siteDetectionConfig
	};
	const localeDetectionConfig = {
		...DEFAULT_LOCALE_DETECTION,
		...config.localeDetectionConfig
	};
	const siteCookie = createSiteContextCookie(siteDetectionConfig.lookupCookie, config.cookieOptions);
	const localeCookie = createSiteContextCookie(localeDetectionConfig.lookupCookie, config.cookieOptions);
	const currencyCookie = createCurrencyCookie(config.currencyCookieName ?? DEFAULT_CURRENCY_COOKIE_NAME, config.cookieOptions);
	const settings = {
		...config,
		siteDetectionConfig,
		localeDetectionConfig,
		siteCookie,
		localeCookie,
		currencyCookie
	};
	const siteContextMiddleware = async ({ request, context }, next) => {
		const { site, locale, currency } = await resolveSiteContext(request, settings);
		context.set(siteContext, {
			site,
			locale,
			currency,
			siteCookie: settings.siteCookie,
			localeCookie: settings.localeCookie,
			currencyCookie: settings.currencyCookie
		});
		requestToLocaleMap.set(request, locale.id);
		const response = await next();
		const { shouldSetSiteCookie, shouldSetLocaleCookie, shouldSetCurrencyCookie } = await shouldSetCookies(request, response, settings, site, locale, currency);
		if (!shouldSetSiteCookie && !shouldSetLocaleCookie && !shouldSetCurrencyCookie) return response;
		const cookieDomain = site.cookies?.domain || settings.cookieOptions?.domain;
		const domainOpt = cookieDomain ? { domain: cookieDomain } : {};
		const [siteSetCookie, localeSetCookie, currencySetCookie] = await Promise.all([
			shouldSetSiteCookie ? settings.siteCookie.serialize(site.id, {
				path: "/",
				...domainOpt
			}) : Promise.resolve(null),
			shouldSetLocaleCookie ? settings.localeCookie.serialize(locale.id, {
				path: "/",
				...domainOpt
			}) : Promise.resolve(null),
			shouldSetCurrencyCookie ? settings.currencyCookie.serialize(currency, { ...domainOpt }) : Promise.resolve(null)
		]);
		if (siteSetCookie) response.headers.append("Set-Cookie", siteSetCookie);
		if (localeSetCookie) response.headers.append("Set-Cookie", localeSetCookie);
		if (currencySetCookie) response.headers.append("Set-Cookie", currencySetCookie);
		return response;
	};
	return siteContextMiddleware;
}

//#endregion
export { requestToLocaleMap as a, resolvePrefix as c, useSite as d, siteContext as i, stripPathPrefix as l, getSiteContextCookies as n, buildUrl as o, resolveSiteContext as r, extractPrefixParamValues as s, createSiteContextMiddleware as t, SiteProvider as u };
//# sourceMappingURL=site-context2.js.map