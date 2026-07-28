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
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/toast';
import { useAuth } from '@/providers/auth';
import { usePasskeyRegistrationContext } from '@/providers/passkey-registration';
import { resourceRoutes, routes } from '@/route-paths';
import type { PasskeyStatusData } from '@/routes/resource.passkey-status';
import { clearSessionJSONItem, getSessionJSONItem, setSessionJSONItem } from '@/lib/utils';
import { isPasskeyRegistrationSupported } from '@/lib/auth/webauthn';

// Session storage key guarding the passkey upsell toast to once per browser session —
// without it, a page refresh or re-navigation to the home page would re-fire it every time.
const PASSKEY_UPSELL_SHOWN_KEY = 'passkeyUpsellShown';

// Stable id so the toast can be dismissed by identity (e.g. on logout, while it's still
// showing) instead of clearing whatever sonner happens to have queued.
const PASSKEY_UPSELL_TOAST_ID = 'passkey-upsell-toast';

/**
 * On mount, if the user is a registered shopper with no passkeys yet and the browser
 * supports WebAuthn platform authenticators, fires an 8-second toast prompting them
 * to create a passkey. Shown at most once per browser session.
 *
 * Passkey status is read with a plain `fetch('/resource/passkey-status')` — NOT
 * `useFetcher` — and the toast fires from that fetch's own `.then()`. React Router commits
 * a fetcher's resolved state inside a root-wide `React.startTransition`; when a sibling
 * Suspense boundary elsewhere in the tree stays pending (e.g. a slow deferred home-page
 * loader), React withholds the whole transition's commit, so a `useEffect` keyed on
 * `fetcher.data` never re-runs and the toast never fires. Firing from the fetch promise's
 * microtask sidesteps that transition lane entirely. A bare GET to the resource route
 * returns plain JSON (`{ hasPasskey }`), so the body is read with `response.json()`.
 *
 * The fire is additionally gated on not being on `/checkout`: the checkout "create account
 * for later use" flow logs the shopper in via a non-navigating OTP fetcher — root
 * revalidates `userType` to `registered` while they're still on /checkout, before the order
 * is placed. Firing there would show the upsell mid-checkout instead of on order
 * confirmation, so we hold off and re-attempt the fire (from the cached status) once the
 * pathname changes. The status fetch itself stays keyed on identity only, so navigation
 * doesn't trigger a redundant re-fetch on every page.
 */
export function usePasskeyRegistration() {
    const { t } = useTranslation('account');
    const { openModal } = usePasskeyRegistrationContext();
    const auth = useAuth();
    const location = useLocation();
    const firedRef = useRef(false);
    // Cached passkey-status response, so the fire can be re-attempted on navigation (e.g.
    // leaving /checkout) without issuing another GET.
    const statusRef = useRef<PasskeyStatusData | null>(null);

    // Attempts to fire the upsell toast, applying every gate. Held in a ref and refreshed
    // each render so both the fetch microtask and the navigation effect below call the latest
    // closure (current auth/location) without either having to list it as a dependency — which
    // would otherwise re-run the identity-keyed fetch effect on every navigation.
    const tryFireRef = useRef<() => void>(() => undefined);
    tryFireRef.current = () => {
        if (firedRef.current) return;
        // Guests also carry a non-empty `encUserId` (their own anonymous-login token), so this
        // must gate on `userType === 'registered'` explicitly, not just on `encUserId`.
        if (auth?.userType !== 'registered' || !auth.encUserId) return;
        // Hold the upsell until the shopper has left checkout (see the hook doc comment).
        if (location.pathname.endsWith(routes.checkout)) return;
        const data = statusRef.current;
        // Skip on `error: true` — an API failure means passkey absence isn't confirmed, and
        // upselling a user who already has a passkey would be worse than skipping.
        if (!data || data.hasPasskey !== false || data.error) return;
        // Skip the upsell on browsers that can't complete registration (Safari 17,
        // Chrome <129) — accepting the toast there would always fail.
        if (!isPasskeyRegistrationSupported()) return;
        if (getSessionJSONItem<boolean>(PASSKEY_UPSELL_SHOWN_KEY)) return;

        firedRef.current = true;
        setSessionJSONItem(PASSKEY_UPSELL_SHOWN_KEY, true);

        toast(t('passkeys.registerToastTitle'), {
            id: PASSKEY_UPSELL_TOAST_ID,
            description: t('passkeys.registerToastDescription'),
            position: 'top-center',
            duration: 8000,
            closeButton: true,
            className: 'passkey-upsell-toast',
            action: {
                label: t('passkeys.registerToastAction'),
                onClick: () => openModal(auth.encUserId as string),
            },
        });
    };

    // Clear the upsell gate once the user is no longer registered (e.g. logout) so a
    // future sign-in starts with a fresh chance to see the toast. Also dismiss the toast
    // itself — logout is a client-side navigation (the header's <Form> submits without a
    // full reload), so a toast already showing when the user logs out would otherwise keep
    // inviting a signed-out guest to "Create Passkey" for the rest of its duration.
    useEffect(() => {
        if (auth?.userType === 'registered') return;
        clearSessionJSONItem(PASSKEY_UPSELL_SHOWN_KEY);
        toast.dismiss(PASSKEY_UPSELL_TOAST_ID);
        // Without this, a later registration in the same tab would never re-fire the
        // toast — the ref stays true for the lifetime of the mount.
        firedRef.current = false;
        // Drop the previous registered user's cached status so it can't upsell the next one.
        statusRef.current = null;
    }, [auth?.userType]);

    // Load passkey status for a registered shopper and attempt the fire. Keyed on identity
    // only (the GET is idempotent and the fire-time gates keep the toast to once per session),
    // so ordinary navigation doesn't re-fetch.
    useEffect(() => {
        if (auth?.userType !== 'registered' || !auth.encUserId) return;

        // Guards a fire from a fetch that resolves after this mount is torn down
        // (e.g. logout mid-flight) — firing then would prompt a signed-out guest.
        let cancelled = false;

        void fetch(resourceRoutes.passkeyStatus, { headers: { Accept: 'application/json' } })
            .then((response) => (response.ok ? (response.json() as Promise<PasskeyStatusData>) : null))
            .then((data) => {
                if (cancelled || !data) return;
                statusRef.current = data;
                tryFireRef.current();
            })
            .catch(() => {
                // Status unknown — never block the app or upsell on a failed check.
            });

        return () => {
            cancelled = true;
        };
    }, [auth?.userType, auth?.encUserId]);

    // Re-attempt the fire when the pathname changes (e.g. the shopper leaves /checkout for
    // order confirmation) using the already-fetched status — no additional network call.
    useEffect(() => {
        tryFireRef.current();
    }, [location.pathname]);
}
