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
import { getLoginPreferencesLazy, type LoginPreferences } from '@salesforce/storefront-next-runtime/data-store';

/** Storefront default when login preferences are unavailable: passwordless/email-verification flows off. */
export const LOGIN_PREFERENCES_FALLBACK: Readonly<LoginPreferences> = Object.freeze({
    emailVerificationEnabled: false,
});

/**
 * Read login preferences for the current site. Backed by the lazy data-store middleware
 * (`loginPreferencesMiddlewareLazy`), so the DynamoDB read fires only on routes that call this —
 * not on every request. Coalesces the SDK getter's `null` (middleware absent, entry missing, or
 * fallback-mode data-store outage) to empty preferences, leaving `emailVerificationEnabled`
 * `undefined`.
 *
 * `undefined` (not `false`) is deliberate: a site that never published a `login-preferences` entry
 * must behave as "unset", not "explicitly disabled". The checkout create-account gate compares
 * `emailVerificationEnabled === false`, so coalescing a missing entry to `false` would wrongly hide
 * the create-account checkbox. Callers that want a hard "off" default on a genuine read failure
 * apply {@link LOGIN_PREFERENCES_FALLBACK} themselves (see the throw-mode `.catch` in the checkout
 * loader).
 *
 * @param context - Router context provider
 * @returns Login preferences; `emailVerificationEnabled` is `undefined` when unavailable
 */
export async function getLoginPreferences(context: Readonly<RouterContextProvider>): Promise<LoginPreferences> {
    return (await getLoginPreferencesLazy(context)) ?? Object.freeze({});
}
