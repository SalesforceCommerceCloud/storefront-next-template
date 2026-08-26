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

/**
 * Runtime environment detection.
 *
 * `BUNDLE_ID` is the single signal that distinguishes a deployed (Managed
 * Runtime) environment from local development. Managed Runtime always provides
 * a real, non-'local' bundle ID through `process.env.BUNDLE_ID` during SSR and
 * `window._BUNDLE_ID` in the browser; local `pnpm dev` leaves it unset and
 * `pnpm preview` uses 'local'. Asset path resolution already keys off it, so a
 * deployment that failed to set it would be broken in other ways too.
 *
 * This is the canonical home for that check. It gates every behavior that must
 * differ between plain-HTTP loopback (local) and a real HTTPS deployment:
 * - HSTS emission and `upgrade-insecure-requests` (see `security/middleware`)
 * - the dev-only HMR-websocket `connect-src` relaxation
 * - the `Secure` cookie attribute (see the template's `getCookieConfig` and
 *   `site-context/cookies`)
 *
 * Crucially it is NOT `NODE_ENV === 'production'`: `pnpm preview` runs a
 * production build (`NODE_ENV=production`) but still serves plain HTTP over
 * `localhost`, so a `NODE_ENV` gate would wrongly mark `Secure` / send HSTS
 * there. `BUNDLE_ID` answers the question that actually matters — "is this
 * served over real TLS?" — because real TLS only exists on Managed Runtime.
 */

/** Sentinel `BUNDLE_ID` value used for local dev/preview (never a deployed bundle). */
const LOCAL_BUNDLE_ID = 'local';

/**
 * Whether the app is running on a deployed Managed Runtime environment.
 *
 * Reads at call time so tests, per-request SSR logic, and browser code see the
 * live value:
 * - `process.env.BUNDLE_ID` during SSR.
 * - `window._BUNDLE_ID` in the browser, injected before application scripts by
 *   the Storefront Next Scripts integration.
 *
 * A real bundle ID (e.g. `'42'`) identifies a deployed environment; unset,
 * empty, or `'local'` identifies local `pnpm dev` / `pnpm preview`.
 *
 * @returns `true` when `BUNDLE_ID` is set and not `'local'` (deployed, real
 * HTTPS); `false` for local development and `pnpm preview`.
 */
export function isRemote(): boolean {
    const id = typeof window === 'undefined' ? process.env.BUNDLE_ID : (window as { _BUNDLE_ID?: string })._BUNDLE_ID;
    return Boolean(id) && id !== LOCAL_BUNDLE_ID;
}
