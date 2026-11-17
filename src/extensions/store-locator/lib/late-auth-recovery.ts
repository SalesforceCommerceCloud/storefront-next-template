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

/**
 * Recovery from a late 401 on the streamed selected-store read.
 *
 * The read settles after the response head is sent, so the auth middleware cannot refresh the token in
 * that request. The client retries once with this flag cookie set; the root loader then awaits the read,
 * which lets the middleware see the 401 and redirect with fresh cookies.
 *
 * Client-only: this module holds mutable singleton state. Never import the stateful exports from loaders
 * or `.server` code (the server would share the state across requests); only `STORE_RECOVER_COOKIE` is
 * safe there.
 */

/** Short-lived, non-httpOnly flag set by the client for the single retry. */
export const STORE_RECOVER_COOKIE = 'sfnext-store-recover';

type Phase = 'idle' | 'recovering' | 'failed';
let phase: Phase = 'idle';
const listeners = new Set<() => void>();

function setPhase(next: Phase): void {
    if (phase === next) return;
    phase = next;
    listeners.forEach((listener) => listener());
}

export const subscribeLateAuthRecovery = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** `recovering` shows a loading state; `failed` means the single retry ran and is terminal for this page session. */
export const getLateAuthRecoveryPhase = (): Phase => phase;

/** Retry once per page session. Returns false when a retry already ran or is running. */
export async function startLateAuthRecovery(revalidate: () => Promise<void>): Promise<boolean> {
    if (phase !== 'idle' || typeof document === 'undefined') return false;
    setPhase('recovering');
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${STORE_RECOVER_COOKIE}=1; Path=/; Max-Age=60; SameSite=Lax${secure}`;
    try {
        await revalidate();
    } finally {
        document.cookie = `${STORE_RECOVER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
        // One retry per page session, whatever the outcome (also when `revalidate` throws, e.g. a flaky network).
        // Dependent reads (pickup inventory) can 401 later; a reset here would let them start a second retry.
        setPhase('failed');
    }
    return true;
}
