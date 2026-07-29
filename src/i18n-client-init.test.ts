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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Controllable stand-in for the client i18next instance. `initI18next` (mocked
// below) returns this, so the module-scope `i18nextOnClient` in i18n-client-init
// is this object. Tests tweak its behavior per case.
const fakeInstance = vi.hoisted(() => {
    return {
        language: 'en-US',
        // toggled per test to simulate "namespace already in store"
        _hasBundle: false,
        hasResourceBundle: vi.fn(function (this: void) {
            return fakeInstance._hasBundle;
        }),
        // Resolves the loadNamespaces callback on a later tick, modeling the async
        // dynamic-import backend. Overridable per test.
        loadNamespaces: vi.fn((_ns: string | string[], cb?: () => void) => {
            if (cb) setTimeout(cb, 0);
            return Promise.resolve();
        }),
    };
});

vi.mock('@salesforce/storefront-next-runtime/i18n/client', () => ({
    initI18next: vi.fn(() => fakeInstance),
}));

// Import AFTER the mock so the module-scope init picks up the fake instance.
import { i18nextOnClient, whenI18nReady } from './i18n-client-init';

describe('i18n-client-init', () => {
    beforeEach(() => {
        fakeInstance._hasBundle = false;
        fakeInstance.hasResourceBundle.mockClear();
        fakeInstance.loadNamespaces.mockClear();
        fakeInstance.loadNamespaces.mockImplementation((_ns, cb?: () => void) => {
            if (cb) setTimeout(cb, 0);
            return Promise.resolve();
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('exposes the client i18next instance', () => {
        expect(i18nextOnClient).toBe(fakeInstance);
    });

    it('resolves immediately when the initial namespace is already in the store', async () => {
        fakeInstance._hasBundle = true;
        await whenI18nReady();
        // No backend fetch needed — bundle already present.
        expect(fakeInstance.loadNamespaces).not.toHaveBeenCalled();
    });

    it('awaits the backend load, then resolves (the readiness gate)', async () => {
        fakeInstance._hasBundle = false;
        await whenI18nReady();
        expect(fakeInstance.loadNamespaces).toHaveBeenCalledWith('common', expect.any(Function));
    });

    it('resolves even if the backend never calls back (timeout safety net)', async () => {
        vi.useFakeTimers();
        fakeInstance._hasBundle = false;
        // Backend that NEVER resolves — a stuck/failed locale chunk.
        fakeInstance.loadNamespaces.mockImplementation(() => new Promise<void>(() => {}));

        const ready = whenI18nReady();
        let resolved = false;
        void ready.then(() => {
            resolved = true;
        });

        // Before the timeout: still pending.
        await Promise.resolve();
        expect(resolved).toBe(false);

        // After the timeout window: resolved anyway, so hydration is never blocked forever.
        await vi.advanceTimersByTimeAsync(3000);
        await ready;
        expect(resolved).toBe(true);
    });
});
