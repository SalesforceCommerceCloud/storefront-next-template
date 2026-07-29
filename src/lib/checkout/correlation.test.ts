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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCheckoutCorrelationId, getOrCreateCheckoutCorrelationId } from './correlation';

/** Matches middleware validator `/^[A-Za-z0-9._-]{1,128}$/`. */
const VALID_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

describe('lib/checkout/correlation', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        sessionStorage.clear();
    });

    it('mints and persists a correlation id in sessionStorage', () => {
        const id = getOrCreateCheckoutCorrelationId();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(sessionStorage.getItem('checkoutCorrelationId')).toBe(id);
        expect(getOrCreateCheckoutCorrelationId()).toBe(id);
    });

    it('returns a transient UUID when sessionStorage throws', () => {
        const getItem = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });

        try {
            const id = getOrCreateCheckoutCorrelationId();

            expect(getItem).toHaveBeenCalled();
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        } finally {
            getItem.mockRestore();
        }
    });

    it('returns a non-empty valid id when crypto.randomUUID throws', () => {
        const randomUUID = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
            throw new Error('randomUUID unavailable');
        });

        try {
            let id: string | undefined;
            expect(() => {
                id = getOrCreateCheckoutCorrelationId();
            }).not.toThrow();

            expect(id).toBeTruthy();
            expect(id).toMatch(VALID_CORRELATION_ID);
            expect(sessionStorage.getItem('checkoutCorrelationId')).toBe(id);
        } finally {
            randomUUID.mockRestore();
        }
    });

    it('reuses the same transient id when sessionStorage throws repeatedly', () => {
        const getItem = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });

        try {
            const first = getOrCreateCheckoutCorrelationId();
            const second = getOrCreateCheckoutCorrelationId();

            expect(first).toBe(second);
            expect(first).toMatch(VALID_CORRELATION_ID);
        } finally {
            getItem.mockRestore();
        }
    });

    it('mints a fresh transient id after clear when sessionStorage throws', () => {
        const getItem = vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });
        const removeItem = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });

        try {
            const first = getOrCreateCheckoutCorrelationId();
            clearCheckoutCorrelationId();
            const second = getOrCreateCheckoutCorrelationId();

            expect(first).not.toBe(second);
            expect(second).toMatch(VALID_CORRELATION_ID);
        } finally {
            getItem.mockRestore();
            removeItem.mockRestore();
        }
    });

    it('returns a fresh id on each SSR call when sessionStorage is undefined', () => {
        const original = globalThis.sessionStorage;
        // @ts-expect-error — simulate SSR / non-browser environment
        delete globalThis.sessionStorage;

        try {
            const first = getOrCreateCheckoutCorrelationId();
            const second = getOrCreateCheckoutCorrelationId();

            expect(first).not.toBe(second);
            expect(first).toMatch(VALID_CORRELATION_ID);
            expect(second).toMatch(VALID_CORRELATION_ID);
        } finally {
            Object.defineProperty(globalThis, 'sessionStorage', {
                value: original,
                configurable: true,
                writable: true,
            });
        }
    });

    it('clearCheckoutCorrelationId swallows sessionStorage errors', () => {
        const removeItem = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });

        try {
            expect(() => clearCheckoutCorrelationId()).not.toThrow();
        } finally {
            removeItem.mockRestore();
        }
    });
});
