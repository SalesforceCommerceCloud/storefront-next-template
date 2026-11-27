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
import { useCallback, useEffect, useRef } from 'react';
import { useFetchers, useNavigation, useRevalidator } from 'react-router';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useAuthFetcher } from '@/hooks/use-auth-fetcher';
import { useAuth } from '@/providers/auth';
import { useBasket, useBasketRefreshPublisher } from '@/providers/basket';
import { parseBasketCookie } from '@/lib/basket/cookie';
import type { BasketRefreshResult } from '@/lib/basket/refresh';
import { resourceRoutes } from '@/route-paths';

const FETCHER_KEY = 'hybrid-basket-refresh';
const cookieRevision = () => JSON.stringify(parseBasketCookie(document.cookie));

type Flight = {
    context: string;
    cookie: string;
    current: ReturnType<typeof useBasket>;
    epoch: number;
    previousData: unknown;
    loading: boolean;
};

/**
 * Refresh an existing hybrid basket on entry/return, independently of cookie change signals.
 * The caller mounts this once under the root providers only when hybrid mode is enabled.
 * Publication is client-controlled so a discarded read cannot regress the basket cookie.
 */
export function useHybridBasketRefresh(): void {
    const fetcher = useAuthFetcher<BasketRefreshResult>({ key: FETCHER_KEY });
    const fetchers = useFetchers();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const site = useSite();
    const auth = useAuth();
    const current = useBasket();
    const publish = useBasketRefreshPublisher();
    const context = JSON.stringify([
        site.site.id,
        site.locale.id,
        site.currency,
        auth?.authContextVersion,
        auth?.customerId,
        auth?.usid,
    ]);
    const busy =
        navigation.state !== 'idle' ||
        revalidator.state !== 'idle' ||
        fetchers.some((f) => f.key !== FETCHER_KEY && f.state !== 'idle');
    const pending = useRef(true);
    const flight = useRef<Flight | null>(null);
    const epoch = useRef(0);
    const away = useRef(false);
    const previous = useRef({ busy, context });
    const latest = useRef({ busy, context, current, fetcher, publish });

    useEffect(() => {
        latest.current = { busy, context, current, fetcher, publish };
        if ((!previous.current.busy && busy) || previous.current.context !== context) epoch.current++;
        if (previous.current.context !== context) pending.current = true;
        previous.current = { busy, context };
    });

    const run = useCallback(() => {
        const live = latest.current;
        if (!pending.current || flight.current || live.busy || away.current || document.visibilityState === 'hidden')
            return;
        pending.current = false;
        const snapshot = parseBasketCookie(document.cookie);
        if (!snapshot?.basketId) return;
        flight.current = {
            context: live.context,
            cookie: cookieRevision(),
            current: live.current,
            epoch: epoch.current,
            previousData: live.fetcher.data,
            loading: false,
        };
        // The route's clientLoader converts recoverable transport failures into a completed unsuccessful read.
        void live.fetcher.load(resourceRoutes.basketRefresh);
    }, []);

    useEffect(() => {
        // StrictMode replay and the focus/visibility pair share a single dispatch.
        const timer = window.setTimeout(run, 0);
        return () => window.clearTimeout(timer);
    });

    useEffect(() => {
        const request = flight.current;
        if (!request) return;
        if (fetcher.state !== 'idle') {
            request.loading = true;
            return;
        }
        // A discarded redirect can settle without new data, including undefined on the first read.
        if (!request.loading && fetcher.data === request.previousData) return;
        flight.current = null;
        if (
            request.context !== context ||
            request.epoch !== epoch.current ||
            busy ||
            request.cookie !== cookieRevision() ||
            request.current !== current
        ) {
            // The endpoint has not written Set-Cookie. Discard without changing any persisted state,
            // then check again after the newer mutation/navigation has settled.
            pending.current = true;
            return;
        }
        const result = fetcher.data;
        if (result?.success && result.basketId === parseBasketCookie(document.cookie)?.basketId) publish?.(result);
    }, [fetcher.state, fetcher.data, context, busy, current, publish]);

    useEffect(() => {
        let timer: number | undefined;
        away.current = document.visibilityState === 'hidden';
        const onAway = () => {
            if (away.current) return;
            away.current = true;
            if (flight.current) {
                // An external mutation may happen while away, after the current read was taken.
                epoch.current++;
                pending.current = true;
            }
        };
        const onReturn = () => {
            if (document.visibilityState === 'hidden') {
                onAway();
                return;
            }
            away.current = false;
            if (flight.current) return;
            pending.current = true;
            window.clearTimeout(timer);
            timer = window.setTimeout(run, 0);
        };
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) onReturn();
        };
        document.addEventListener('visibilitychange', onReturn);
        window.addEventListener('focus', onReturn);
        window.addEventListener('blur', onAway);
        window.addEventListener('pageshow', onPageShow);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onReturn);
            window.removeEventListener('focus', onReturn);
            window.removeEventListener('blur', onAway);
            window.removeEventListener('pageshow', onPageShow);
        };
    }, [run]);
}

/** Root-only leaf: fetcher transitions do not rerender the application shell. */
export function HybridBasketReconciler(): null {
    useHybridBasketRefresh();
    return null;
}
