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
import { AUTH_CONTEXT_CHANGED, AUTH_CONTEXT_HEADER, AUTH_CONTEXT_QUERY } from '@/lib/auth/context-binding';

type Recovery = { url: string; contextVersion?: string; code: string };
let recovery: Recovery | null = null;
const listeners = new Set<() => void>();
export const getAuthRecovery = () => (typeof window === 'undefined' ? null : recovery);
export const getServerAuthRecovery = () => null;
export function subscribeAuthRecovery(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
export function clearAuthRecovery() {
    recovery = null;
    listeners.forEach((listener) => listener());
}

/** Observe failure headers without consuming/changing the action outcome, retrying, or fetching on mount. */
export function observeAuthFailures(contextVersion?: string): () => void {
    const original = window.fetch;
    let active = true;
    const observed: typeof fetch = async (input, init) => {
        const response = await original(input, init);
        const code = response.headers.get('x-sfnext-auth-error');
        const destination = response.headers.get('x-sfnext-auth-recovery-url');
        if (active && (code === 'TAOB_REAUTH_REQUIRED' || code === AUTH_CONTEXT_CHANGED) && destination) {
            const requestUrl = new URL(input instanceof Request ? input.url : String(input), window.location.href);
            const next = new URL(destination, window.location.origin);
            if (
                requestUrl.origin === window.location.origin &&
                next.origin === window.location.origin &&
                !/\/(action|resource)(\/|$)/.test(next.pathname)
            ) {
                const headers = new Headers(input instanceof Request ? input.headers : undefined);
                new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
                const requestedVersion =
                    headers.get(AUTH_CONTEXT_HEADER) ?? requestUrl.searchParams.get(AUTH_CONTEXT_QUERY) ?? undefined;
                if (contextVersion && requestedVersion && contextVersion !== requestedVersion) return response;
                recovery = { url: `${next.pathname}${next.search}`, code, contextVersion: requestedVersion };
                listeners.forEach((listener) => listener());
            }
        }
        return response;
    };
    window.fetch = observed;
    return () => {
        active = false;
        if (window.fetch === observed) window.fetch = original;
    };
}
