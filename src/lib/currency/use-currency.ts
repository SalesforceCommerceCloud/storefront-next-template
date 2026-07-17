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

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { parseCurrencyCookie, validateCurrency } from './cookie';

// Cookies emit no events; noop unsubscribe. Re-reads ride other re-renders.
const subscribe = () => () => undefined;
// Server + first hydration commit return null → the loader currency, matching
// the (possibly cached) SSR HTML, so no hydration-mismatch warning is emitted.
const getServerSnapshot = (): string | null => null;

/**
 * Return the shopper's currency, preferring the JS-readable currency cookie
 * over the loader value once it can be read, and falling back to the loader
 * value otherwise. This corrects a cached shell's frozen currency. Called once
 * in the root to seed the site provider; components read `useSite().currency`.
 *
 * A hook (not a plain function) because `useSyncExternalStore` is what lets the
 * client read the cookie after hydration without a mismatch — a render-time
 * `document.cookie` read would break SSR and flicker on hydration.
 */
export function useCurrency(loaderCurrency: string, supportedCurrencies: string[], cookieName: string): string {
    // Cache the parse keyed on the raw cookie header (and cookie name) so re-renders
    // don't re-run the regex/atob when neither has changed.
    const cacheRef = useRef<{ header?: string; cookieName?: string; value: string | null }>({ value: null });

    const getSnapshot = useCallback((): string | null => {
        // Without a cookie name there's nothing to read — fall back to the loader currency
        // rather than letting a best-effort restore crash the app shell.
        if (!cookieName) {
            return null;
        }
        const header = document.cookie;
        const cache = cacheRef.current;
        if (header !== cache.header || cookieName !== cache.cookieName) {
            cache.header = header;
            cache.cookieName = cookieName;
            cache.value = parseCurrencyCookie(header, cookieName);
        }
        return cache.value;
    }, [cookieName]);

    const cookieValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return validateCurrency(cookieValue, supportedCurrencies) ?? loaderCurrency;
}
