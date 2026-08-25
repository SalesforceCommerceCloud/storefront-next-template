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
import { forwardRef, type ForwardedRef } from 'react';
import {
    Link as RouterLink,
    NavLink as RouterNavLink,
    createPath,
    type LinkProps as RouterLinkProps,
    type NavLinkProps as RouterNavLinkProps,
    type To,
    useResolvedPath,
} from 'react-router';
import { buildUrl, resolvePrefix, stripPathPrefix, useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { appendSuffix, findLegacyRoute } from '@/middlewares/legacy-routes';

/** Resolved navigation target plus whether it must bypass client-side routing. */
type ResolvedTarget = { to: To; reloadDocument: boolean };

type UrlParts = { pathname: string; search: string; hash: string };

type ForwardedLinkProps = RouterLinkProps & { forwardedRef: ForwardedRef<HTMLAnchorElement>; resolvedPath?: UrlParts };

type ForwardedNavLinkProps = RouterNavLinkProps & {
    forwardedRef: ForwardedRef<HTMLAnchorElement>;
    resolvedPath?: UrlParts;
};

/** Converts either React Router `To` shape to a URL string for site-context normalization. */
function toUrlString(to: To): string {
    return typeof to === 'string' ? to : createPath(to);
}

/** Splits a URL into React Router's `To` object fields. */
function splitUrl(url: string): UrlParts {
    const hashIndex = url.indexOf('#');
    const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
    const urlWithoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const searchIndex = urlWithoutHash.indexOf('?');
    return {
        pathname: searchIndex === -1 ? urlWithoutHash : urlWithoutHash.slice(0, searchIndex),
        search: searchIndex === -1 ? '' : urlWithoutHash.slice(searchIndex),
        hash,
    };
}

/** Rebuilds an object target while retaining any non-URL React Router fields. */
function withUrlParts(to: Exclude<To, string>, parts: UrlParts): To {
    return { ...to, ...parts };
}

/** Whether a current-route search update must be resolved before applying configured URL context. */
function isSearchOnlyTarget(to: To): boolean {
    if (typeof to === 'string') {
        const { pathname, search } = splitUrl(to);
        return !pathname && Boolean(search);
    }
    return !to.pathname && Boolean(to.search);
}

/**
 * Resolve a `<Link to>` for the current site context, and decide whether the navigation must be a
 * full document load.
 *
 * Two cases:
 *
 * 1. **Legacy route (hybrid mode).** If `to` matches a configured `hybrid.legacyRoutes` pattern,
 *    the destination is owned by the legacy backend (SFRA / SiteGenesis), not React Router. We
 *    hand off with a real browser navigation so the CDN routes it to the legacy backend.
 *    `reloadDocument: true` makes React Router render a plain `<a>` and skip client-side routing —
 *    so it never starts a client navigation, never lazy-imports the target route chunk, and never
 *    races its own failed-chunk reload. (That race strands Safari on the current page: RR begins
 *    importing the target route module, the full-page redirect aborts the import, and RR's "Error
 *    loading route module, reloading page" recovery wins — reloading the page the user was already
 *    on. `legacy-routes.client.ts` stays as a backstop for programmatic `navigate()` calls, but
 *    link clicks are resolved here, before RR ever engages.)
 *
 *    The href is the site-aware `buildUrl` output (with the route's `suffix` like `.html`
 *    appended to its pathname), so the legacy backend receives the same site/locale-prefixed
 *    URL shape as the rest of the storefront.
 *
 * 2. **Storefront Next route (default).** Prefix `to` with the active site/locale via `buildUrl`
 *    and let React Router handle it client-side, exactly as before.
 *
 * String destinations and object destinations with rooted pathnames are normalized through
 * `buildUrl`. Search-only targets are first resolved by React Router, then normalized so URL
 * context carried in configured search params is retained. Empty, hash-only, and relative object
 * targets retain React Router's native semantics.
 */
function useResolvedTarget(to: To, resolvedPath?: UrlParts): ResolvedTarget {
    const { site } = useSite();
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();

    // Without a site context, behave like React Router's Link (no transform, no reload).
    if (!site) {
        return { to, reloadDocument: false };
    }

    // React Router resolves relative object targets against the current route. Prefixing them
    // would corrupt paths such as `../cart`.
    if (typeof to !== 'string' && to.pathname && !to.pathname.startsWith('/')) {
        return { to, reloadDocument: false };
    }

    const params = { siteId: siteRef, localeId: localeRef };
    const isPathless = typeof to === 'string' ? !splitUrl(to).pathname : !to.pathname;

    if (isPathless) {
        // Pathless destinations update the current route; they are not authored home paths and
        // must never match a legacy `/` route. Empty and hash-only values pass through unchanged.
        // Search-only values are resolved by the dedicated wrapper component before reaching this
        // hook, then normalized so query-based site/locale context is retained.
        if (!resolvedPath) {
            return { to, reloadDocument: false };
        }
        const resolvedUrl = buildUrl({ to: createPath(resolvedPath), urlConfig: config.url, params });
        const resolvedUrlParts = splitUrl(resolvedUrl);
        return {
            to: typeof to === 'string' ? resolvedUrl : withUrlParts(to, resolvedUrlParts),
            reloadDocument: false,
        };
    }

    const url = buildUrl({ to: toUrlString(to), urlConfig: config.url, params });
    const urlParts = splitUrl(url);
    const normalizedTo = typeof to === 'string' ? url : withUrlParts(to, urlParts);

    // Legacy matching operates on the bare functional path. Strip only the resolved, concrete
    // prefix after buildUrl has normalized the target; wildcard patterns never consume segments
    // from an authored bare path.
    const hybrid = config.hybrid;
    if (hybrid?.enabled && hybrid.legacyRoutes?.length) {
        const prefix = resolvePrefix({ prefix: config.url?.prefix ?? '', params });
        const barePathname = stripPathPrefix({ pathname: urlParts.pathname, prefix }) || '/';
        const matchedRoute = findLegacyRoute(barePathname, hybrid.legacyRoutes);
        if (matchedRoute) {
            const legacyUrlParts = { ...urlParts, pathname: appendSuffix(urlParts.pathname, matchedRoute.suffix) };
            return {
                to:
                    typeof to === 'string'
                        ? `${legacyUrlParts.pathname}${legacyUrlParts.search}${legacyUrlParts.hash}`
                        : withUrlParts(to, legacyUrlParts),
                reloadDocument: true,
            };
        }
    }

    // Storefront Next route → site-context-prefixed, client-side navigation.
    return { to: normalizedTo, reloadDocument: false };
}

function ResolvedLink({
    to: authoredTo,
    reloadDocument: requestedReloadDocument,
    forwardedRef,
    resolvedPath,
    ...rest
}: ForwardedLinkProps) {
    const { to, reloadDocument } = useResolvedTarget(authoredTo, resolvedPath);
    return (
        <RouterLink ref={forwardedRef} to={to} reloadDocument={requestedReloadDocument || reloadDocument} {...rest} />
    );
}

function SearchOnlyLink(props: ForwardedLinkProps) {
    const resolvedPath = useResolvedPath(props.to);
    return <ResolvedLink {...props} resolvedPath={resolvedPath} />;
}

function ResolvedNavLink({
    to: authoredTo,
    reloadDocument: requestedReloadDocument,
    forwardedRef,
    resolvedPath,
    ...rest
}: ForwardedNavLinkProps) {
    const { to, reloadDocument } = useResolvedTarget(authoredTo, resolvedPath);
    return (
        <RouterNavLink
            ref={forwardedRef}
            to={to}
            reloadDocument={requestedReloadDocument || reloadDocument}
            {...rest}
        />
    );
}

function SearchOnlyNavLink(props: ForwardedNavLinkProps) {
    const resolvedPath = useResolvedPath(props.to);
    return <ResolvedNavLink {...props} resolvedPath={resolvedPath} />;
}

/**
 * Site-context-aware <Link>. Drop-in replacement for React Router's <Link>.
 * Automatically prepends URL prefix and appends search params from Url config. For configured
 * hybrid legacy routes it forces a full-document navigation (see {@link useResolvedTarget}).
 * When no SiteProvider is mounted, behaves identically to React Router's Link.
 */
export const Link = forwardRef<HTMLAnchorElement, RouterLinkProps>(function Link(props, ref) {
    const forwardedProps = { ...props, forwardedRef: ref };
    return isSearchOnlyTarget(props.to) ? <SearchOnlyLink {...forwardedProps} /> : <ResolvedLink {...forwardedProps} />;
});

/**
 * Site-context-aware <NavLink>. Drop-in replacement for React Router's <NavLink>.
 * Inherits all NavLink functionality (active class, aria-current).
 */
export const NavLink = forwardRef<HTMLAnchorElement, RouterNavLinkProps>(function NavLink(props, ref) {
    const forwardedProps = { ...props, forwardedRef: ref };
    return isSearchOnlyTarget(props.to) ? (
        <SearchOnlyNavLink {...forwardedProps} />
    ) : (
        <ResolvedNavLink {...forwardedProps} />
    );
});
