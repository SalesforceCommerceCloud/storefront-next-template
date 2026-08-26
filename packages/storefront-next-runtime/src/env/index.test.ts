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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRemote } from './index';

describe('isRemote', () => {
    const origBundleId = process.env.BUNDLE_ID;

    afterEach(() => {
        vi.unstubAllGlobals();
        if (origBundleId === undefined) {
            delete process.env.BUNDLE_ID;
        } else {
            process.env.BUNDLE_ID = origBundleId;
        }
    });

    it('returns false on the server when BUNDLE_ID is unset (local dev)', () => {
        vi.stubGlobal('window', undefined);
        delete process.env.BUNDLE_ID;
        expect(isRemote()).toBe(false);
    });

    it('returns false on the server when BUNDLE_ID is empty', () => {
        vi.stubGlobal('window', undefined);
        process.env.BUNDLE_ID = '';
        expect(isRemote()).toBe(false);
    });

    it("returns false on the server when BUNDLE_ID is 'local' (pnpm preview)", () => {
        vi.stubGlobal('window', undefined);
        process.env.BUNDLE_ID = 'local';
        expect(isRemote()).toBe(false);
    });

    it('returns true on the server when BUNDLE_ID is a real deployed bundle id', () => {
        vi.stubGlobal('window', undefined);
        process.env.BUNDLE_ID = '42';
        expect(isRemote()).toBe(true);
    });

    it('reads the server BUNDLE_ID at call time, not import time', () => {
        vi.stubGlobal('window', undefined);
        delete process.env.BUNDLE_ID;
        expect(isRemote()).toBe(false);
        process.env.BUNDLE_ID = 'abc123';
        expect(isRemote()).toBe(true);
    });

    it('returns true in the browser when the injected bundle ID is remote', () => {
        vi.stubGlobal('window', { _BUNDLE_ID: '42' });
        delete process.env.BUNDLE_ID;
        expect(isRemote()).toBe(true);
    });

    it('returns false in the browser when the injected bundle ID is local or absent', () => {
        process.env.BUNDLE_ID = 'server-bundle-must-not-leak-into-browser';
        vi.stubGlobal('window', { _BUNDLE_ID: 'local' });
        expect(isRemote()).toBe(false);
        vi.stubGlobal('window', {});
        expect(isRemote()).toBe(false);
    });

    it('reads the injected browser bundle ID at call time', () => {
        const browserWindow: { _BUNDLE_ID?: string } = {};
        vi.stubGlobal('window', browserWindow);
        expect(isRemote()).toBe(false);
        browserWindow._BUNDLE_ID = 'abc123';
        expect(isRemote()).toBe(true);
    });
});
