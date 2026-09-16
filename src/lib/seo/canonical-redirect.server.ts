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
import { redirect } from 'react-router';

/**
 * Converge a trailing-slash path variant onto its slash-free canonical form with
 * a 301, preserving the query string. Called from the loader so a client
 * navigation (the `.data` request) and a full document request converge
 * identically. Loop-safe by construction: the redirect target has no trailing
 * slash, so it never re-triggers this guard. Root "/" is exempt.
 *
 * Path-only on purpose. Query-parameter deduplication belongs to the canonical
 * `<link>` tag (which strips non-content params), not a redirect — a 301 that
 * stripped tracking params would run before any client analytics and destroy
 * campaign attribution.
 *
 * Precondition: callers mount this on segment-prefixed routes (`/product`,
 * `/category`, `/search`), so `pathname` is always a single-slash same-origin
 * path. Do not call it from a root or splat route without first rejecting
 * protocol-relative paths (a leading `//host` or `/\host`) — those would turn
 * the `redirect` Location into an off-origin open redirect.
 */
export function redirectToCanonicalPath(requestUrl: URL): void {
    const { pathname } = requestUrl;
    if (pathname.length > 1 && pathname.endsWith('/')) {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- redirect() returns a Response; React Router expects it thrown.
        throw redirect(`${pathname.replace(/\/+$/, '')}${requestUrl.search}`, 301);
    }
}
