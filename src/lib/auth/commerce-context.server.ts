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
import type { ConfirmedContextChangeRequired } from '@/scapi';

const invalidators = new WeakMap<Readonly<RouterContextProvider>, Set<() => void>>();

/** Register request-local commerce snapshots that must be discarded on an auth change. */
export function onAuthenticationChange(context: Readonly<RouterContextProvider>, invalidate: () => void): void {
    let listeners = invalidators.get(context);
    if (!listeners) {
        listeners = new Set();
        invalidators.set(context, listeners);
    }
    listeners.add(invalidate);
}

/** Clear snapshots synchronously before any consumer can read under the new credential. */
export function invalidateAuthenticatedCommerce(context: Readonly<RouterContextProvider>): void {
    for (const invalidate of invalidators.get(context) ?? []) invalidate();
}

/** Public failure/handoff from authentication-dependent commerce reconciliation. */
export class CommerceContextError extends Error {
    readonly change?: ConfirmedContextChangeRequired<unknown>;
    constructor(
        readonly code: string,
        readonly status = 400,
        options?: ErrorOptions & { change?: ConfirmedContextChangeRequired<unknown> }
    ) {
        super(code, options);
        this.change = options?.change;
    }
}

export function commerceContextErrorResponse(
    error: CommerceContextError,
    recovery?: { retryUrl: string; logoutAction: string }
): Response {
    const failure = error.change ?? { success: false, code: error.code };
    return Response.json(
        {
            ...failure,
            ...(recovery ? { recovery } : {}),
        },
        {
            status: error.status,
            headers: { 'Cache-Control': 'private, no-store' },
        }
    );
}
