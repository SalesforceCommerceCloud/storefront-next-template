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
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useSyncExternalStore,
} from 'react';
import type { PublicSessionData } from '@/lib/api/types';
import { parseUserTypeCookie, type UserType } from '@/lib/auth/user-type-hint';

/* eslint-disable react-refresh/only-export-components */

export const AuthContext = createContext<PublicSessionData | undefined>(undefined);

// Cookie changes are not observable via an event; the store returns a noop unsubscribe and relies on
// existing re-render triggers to refresh. useSyncExternalStore guarantees the SSR/first-hydration
// snapshot (null) and the post-hydration client snapshot (cookie) can diverge without a
// hydration-mismatch warning — the same mechanism the basket provider uses (`providers/basket.tsx`).
// eslint-disable-next-line @typescript-eslint/no-empty-function
const subscribeUserTypeCookie = () => () => {};
const getServerUserTypeSnapshot = (): UserType | null => null;

/**
 * Provider for public (non-sensitive) auth/session data.
 *
 * In a server-only auth architecture:
 * - Server middleware reads cookies and populates full session data
 * - Root loader extracts only non-sensitive fields (userType, customerId, usid, etc.)
 * - These non-sensitive fields are serialized and sent to the client
 * - AuthProvider makes this data available to components via useAuth()
 *
 * This provider does NOT have access to sensitive data like accessToken or refreshToken.
 * Server actions should use getAuth(context) from auth.server.ts for authenticated operations.
 *
 * ## App-shell caching: client-side userType fallback
 *
 * When a shared, non-personalized app-shell HTML document is served from cache, the loader-baked
 * `userType` in `value` is frozen for the whole cache-TTL window — every shopper who hits that entry
 * sees whatever `userType` was baked in (typically the neutral guest value the caching layer emits).
 *
 * To render the correct header auth state and wishlist-icon path per shopper, the provider overrides
 * `userType` **only** from the JS-readable `__sfdc_usertype` companion cookie (written by the hints
 * middleware) when present:
 *
 *   cookieUserType ? { ...value, userType: cookieUserType } : value
 *
 * The read uses `useSyncExternalStore` with asymmetric snapshots so SSR and the first hydration commit
 * both return `null` (matching server output — no hydration warning), and a post-hydration read then
 * surfaces the visitor's own cookie. On uncached routes the cookie simply confirms the loader value,
 * so this is inert until a route is actually cached. Only `userType` is overridden — `customerId`,
 * `usid`, etc. are never carried in the hint (see the App Shell Caching LLD §8).
 *
 * @param props.siteId - Site id used to resolve the namespaced hint cookie name
 *   (`__sfdc_usertype_{siteId}`), matching how the hints middleware writes it. Passed explicitly
 *   (rather than read from SiteProvider) so this provider stays free of a provider-order coupling —
 *   it is mounted above/without SiteProvider in some contexts. When omitted, the hint fallback is
 *   inert and the loader `value` is used verbatim (the pre-caching behavior).
 */
const AuthProvider = ({
    children,
    value,
    siteId,
}: PropsWithChildren<{ value?: PublicSessionData; siteId?: string }>) => {
    // Per-provider cache for the parsed cookie value. useSyncExternalStore compares successive
    // getSnapshot return values via Object.is; a primitive UserType is compared by value, but the
    // cache still lets us skip re-parsing the cookie header when nothing changed. Ref-scoped (not
    // module scope) so concurrent SSR requests can't observe each other's state.
    const cookieCacheRef = useRef<{ header?: string; siteId?: string; userType: UserType | null }>({
        userType: null,
    });

    // Stable identity across renders: useSyncExternalStore re-subscribes if getSnapshot changes.
    const getClientUserTypeSnapshot = useCallback((): UserType | null => {
        // Without a siteId we cannot resolve the namespaced cookie, so the fallback is inert.
        if (!siteId) return null;
        const header = document.cookie;
        const cache = cookieCacheRef.current;
        // Key the cache on siteId as well as the raw header: the namespaced cookie name is derived from
        // siteId, so under a multi-site client navigation siteId can change while document.cookie stays
        // byte-identical — keying on the header alone would return the value parsed for the old site.
        if (header !== cache.header || siteId !== cache.siteId) {
            cache.header = header;
            cache.siteId = siteId;
            cache.userType = parseUserTypeCookie(header, siteId);
        }
        return cache.userType;
    }, [siteId]);

    const cookieUserType = useSyncExternalStore(
        subscribeUserTypeCookie,
        getClientUserTypeSnapshot,
        getServerUserTypeSnapshot
    );

    // Post-hydration, the cookie hint wins for `userType` only. `{ ...value, userType }` also handles
    // the cached-shell case where `value` is undefined (no per-visitor auth baked in) — the spread of
    // undefined yields `{ userType }`, which is the correct restored state.
    const effectiveValue = useMemo<PublicSessionData | undefined>(
        () => (cookieUserType ? { ...value, userType: cookieUserType } : value),
        [value, cookieUserType]
    );

    return <AuthContext.Provider value={effectiveValue}>{children}</AuthContext.Provider>;
};

/**
 * Hook to access public (non-sensitive) session data.
 *
 * Returns non-sensitive user info: userType, customerId, usid, encUserId, trackingConsent.
 * Does NOT include tokens - those are server-only.
 *
 * @returns PublicSessionData or undefined if not available
 */
export const useAuth = (): PublicSessionData | undefined => {
    return useContext(AuthContext);
};

export default AuthProvider;
