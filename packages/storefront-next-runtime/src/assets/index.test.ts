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
import { getClientBundlePath } from './index';

const originalBundleId = process.env.BUNDLE_ID;
const originalBasePath = process.env.MRT_ENV_BASE_PATH;

afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBundleId === undefined) delete process.env.BUNDLE_ID;
    else process.env.BUNDLE_ID = originalBundleId;
    if (originalBasePath === undefined) delete process.env.MRT_ENV_BASE_PATH;
    else process.env.MRT_ENV_BASE_PATH = originalBasePath;
});

describe('getClientBundlePath', () => {
    it('defaults to the local bundle on the server', () => {
        vi.stubGlobal('window', undefined);
        delete process.env.BUNDLE_ID;
        delete process.env.MRT_ENV_BASE_PATH;
        expect(getClientBundlePath()).toBe('/mobify/bundle/local/client/');
    });

    it('uses the server bundle ID and validated MRT base path', () => {
        vi.stubGlobal('window', undefined);
        process.env.BUNDLE_ID = '140';
        process.env.MRT_ENV_BASE_PATH = ' /shop ';
        expect(getClientBundlePath()).toBe('/shop/mobify/bundle/140/client/');
    });

    it('rejects an invalid server base path', () => {
        vi.stubGlobal('window', undefined);
        process.env.MRT_ENV_BASE_PATH = '/shop/nested';
        expect(() => getClientBundlePath()).toThrow('Invalid base path');
    });

    it('uses the authoritative injected browser path and normalizes its trailing slash', () => {
        vi.stubGlobal('window', { _BUNDLE_PATH: '/shop/mobify/bundle/60/client' });
        expect(getClientBundlePath()).toBe('/shop/mobify/bundle/60/client/');

        vi.stubGlobal('window', { _BUNDLE_PATH: '/shop/mobify/bundle/60/client/' });
        expect(getClientBundlePath()).toBe('/shop/mobify/bundle/60/client/');
    });

    it('falls back to injected browser base path and bundle ID', () => {
        vi.stubGlobal('window', { _BASE_PATH: '/shop', _BUNDLE_ID: '60' });
        expect(getClientBundlePath()).toBe('/shop/mobify/bundle/60/client/');
    });

    it('defaults to the local bundle when browser configuration is absent', () => {
        vi.stubGlobal('window', {});
        expect(getClientBundlePath()).toBe('/mobify/bundle/local/client/');
    });
});
