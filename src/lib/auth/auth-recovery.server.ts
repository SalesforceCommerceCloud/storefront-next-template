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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { createContext } from 'react-router';
import { getBasePath } from '@/lib/utils';
import { matchRecoveryRoute } from '@/lib/auth/recovery-routes.server';
import { createRecoveryErrorResponse } from '@/lib/auth/recovery-error.server';

/** Canonical physical pathname + search, revalidated before recovery. */
export const authRecoveryReturnContext = createContext<string | null>(null);

/** Validate raw routing text before normalization, then use the actual winning route.
 * @environment MRT_ENV_BASE_PATH - Optional deployment basename, e.g. `/site-a`.
 */
export function resolveAuthRecoveryDestination(destination: string, requestUrl: string) {
    function reject(): never {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error
        throw createRecoveryErrorResponse(new Request(requestUrl));
    }
    const rawPath = destination.split(/[?#]/, 1)[0];
    const unsafe = (path: string) =>
        path.includes('\\') ||
        [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    // URL parsing strips raw tabs/newlines and normalizes backslashes/dot segments;
    // inspect the original path as well so normalization cannot hide unsafe input.
    if (/^\s*[\\/]{2}/.test(rawPath) || unsafe(rawPath)) reject();
    const target = URL.parse(destination, requestUrl);
    if (!target || target.origin !== new URL(requestUrl).origin || target.pathname.startsWith('//')) reject();
    let decoded: string;
    let decodedRaw: string;
    try {
        decodedRaw = decodeURIComponent(rawPath);
        decoded = decodeURIComponent(target.pathname);
    } catch {
        reject();
    }
    if (unsafe(decodedRaw)) reject();
    if (/\.data$/i.test(decoded)) reject();
    const basename = getBasePath();
    if (
        basename &&
        target.pathname.toLowerCase() !== basename.toLowerCase() &&
        !target.pathname.toLowerCase().startsWith(`${basename.toLowerCase()}/`)
    )
        target.pathname = basename + target.pathname;
    const routePath = basename ? target.pathname.slice(basename.length) : target.pathname;
    if (routePath.startsWith('//')) reject();
    // Native matchRoutes decodes once. Never feed it our safety-check decoded text.
    const winner = matchRecoveryRoute(target.pathname);
    if (!winner?.metadata.isDocument) reject();
    // A route with only an ErrorBoundary is flagged as a document; never redirect to action/resource endpoints.
    if (/^\/(action|resource)(\/|$)/i.test(routePath)) reject();
    return { destination: target.pathname + target.search, params: winner.params };
}

/** Return a physical document URL after winning-route validation. */
export function validateAuthRecoveryDestination(destination: string, requestUrl: string): string {
    return resolveAuthRecoveryDestination(destination, requestUrl).destination;
}

/** Recognize the compiled recovery endpoint before auth setup. */
export function isAuthRecoveryRequest(request: Request): boolean {
    return matchesEndpoint(request, '/resource/auth-recovery');
}

/** Preferred-store persistence recovery must never replay its POST (set/clear selection or save default store). */
export function isPreferredStoreMutationRequest(request: Request): boolean {
    return (
        request.method === 'POST' &&
        (matchesEndpoint(request, '/action/set-selected-store') ||
            matchesEndpoint(request, '/action/save-default-store'))
    );
}

/** @environment MRT_ENV_BASE_PATH - Optional deployment basename, e.g. `/site-a`; resolved by getBasePath. */
function matchesEndpoint(request: Request, endpoint: string): boolean {
    const pathname = new URL(request.url).pathname;
    // Negative-only shortcut: prefixes and trailing slashes are allowed and escapes are decoded,
    // so only the matcher decides the winning leaf. Malformed escapes fall through to it.
    let decoded: string | null = null;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        // fall through
    }
    if (decoded !== null && !decoded.replace(/\/+$/, '').toLowerCase().endsWith(endpoint)) return false;
    const winner = matchRecoveryRoute(pathname);
    // The SDK wraps routes without changing their authored leaf paths. Match the
    // winning resource leaf, never a flattened optional-prefix pattern or suffix.
    return winner?.metadata.path?.replace(/^\//, '') === endpoint.slice(1);
}
