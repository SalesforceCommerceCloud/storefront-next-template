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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
    isAuthRecoveryRequest,
    isPreferredStoreMutationRequest,
    validateAuthRecoveryDestination,
} from './auth-recovery.server';
const routing = await import('@/lib/auth/recovery-routes.server');
import { setRecoveryManifest } from '@/test-utils/__mocks__/compiled-routes';

beforeEach(() => {
    vi.stubGlobal('window', undefined);
    setRecoveryManifest();
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setRecoveryManifest();
});

it.each([
    '/cart',
    '/search?q=auth-recovery',
    '/resource/auth-recovery-extra',
    '/action/set-selected-store-extra',
    '/p/50%25-off',
    '/c/%E4%BD%A0%E5%A5%BD',
])('skips compiled matching for a definite endpoint miss: %s', (path) => {
    const match = vi.spyOn(routing, 'matchRecoveryRoute');
    expect(isAuthRecoveryRequest(new Request(`https://example.com${path}`))).toBe(false);
    expect(isPreferredStoreMutationRequest(new Request(`https://example.com${path}`, { method: 'POST' }))).toBe(false);
    expect(match).not.toHaveBeenCalled();
});

it.each([
    '/resource/auth-recovery///',
    '/RESOURCE/AUTH-RECOVERY/',
    '/%72esource/auth-recovery',
    '/resource/%61uth-recovery',
])('keeps matching authoritative for endpoint candidates: %s', (path) => {
    const match = vi.spyOn(routing, 'matchRecoveryRoute');
    expect(isAuthRecoveryRequest(new Request(`https://example.com${path}`))).toBe(true);
    expect(match).toHaveBeenCalledOnce();
});

it('falls through to the matcher on malformed escapes instead of throwing', () => {
    const match = vi.spyOn(routing, 'matchRecoveryRoute');
    expect(isAuthRecoveryRequest(new Request('https://example.com/p/%E0%A4%A'))).toBe(false);
    expect(match).toHaveBeenCalledOnce();
});

it('rejects a suffix candidate when the winning route is a category document', () => {
    expect(isAuthRecoveryRequest(new Request('https://example.com/c/resource/auth-recovery'))).toBe(false);
});

it('recognizes prefixed preference writes under a basename', () => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    setRecoveryManifest({ prefix: '/shop/:siteId/:localeId?', excludeRoutes: [] });
    const request = new Request('https://example.com/site-a/shop/global/ACTION/SET-SELECTED-STORE///', {
        method: 'POST',
    });
    expect(isPreferredStoreMutationRequest(request)).toBe(true);
    expect(isPreferredStoreMutationRequest(new Request(request.url))).toBe(false);
});

it('uses semantic document metadata and preserves opaque destination queries', () => {
    expect(
        validateAuthRecoveryDestination(
            '/search?q=50%off&refine=a&refine=b',
            'https://example.com/resource/auth-recovery'
        )
    ).toBe('/search?q=50%off&refine=a&refine=b');
});

it('rejects a double slash exposed after removing the basename', () => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    vi.spyOn(routing, 'matchRecoveryRoute').mockReturnValue({
        metadata: { id: 'document', isDocument: true },
        params: {},
    });
    expect(() =>
        validateAuthRecoveryDestination('/site-a//cart', 'https://example.com/site-a/resource/auth-recovery')
    ).toThrow();
});

it.each([
    '/ca\trt',
    '/category/\\../cart',
    '/category/%09/../cart',
])('rejects raw unsafe text before URL normalization: %s', (path) => {
    expect(() => validateAuthRecoveryDestination(path, 'https://example.com/resource/auth-recovery')).toThrow();
});

it.each([
    '/resource/foo',
    '/action/foo',
    '/site-a/resource/foo',
])('rejects action/resource destinations even when flagged as a document: %s', (path) => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    // An ErrorBoundary-only resource route is flagged `isDocument` by the compiler.
    vi.spyOn(routing, 'matchRecoveryRoute').mockReturnValue({
        metadata: { id: 'error-boundary-only', isDocument: true },
        params: {},
    });
    expect(() => validateAuthRecoveryDestination(path, 'https://example.com/site-a/resource/auth-recovery')).toThrow();
});
