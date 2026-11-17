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
import { afterEach, expect, it, vi } from 'vitest';
import { setRecoveryManifest } from '@/test-utils/__mocks__/compiled-routes';
import { matchRecoveryRoute } from '@/lib/auth/recovery-routes.server';

const basename = vi.hoisted(() => ({ value: '' }));
vi.mock('@/lib/utils', () => ({ getBasePath: () => basename.value }));
afterEach(() => {
    basename.value = '';
    setRecoveryManifest();
});

it('matches the root homepage and semantic document/resource metadata', () => {
    setRecoveryManifest();
    expect(matchRecoveryRoute('/')?.metadata).toMatchObject({ id: 'home--root-duplicate', isDocument: true });
    expect(matchRecoveryRoute('/RefArch/en-US/error-page')?.metadata.isDocument).toBe(true);
    expect(matchRecoveryRoute('/resource/basket')?.metadata.isDocument).toBe(false);
    expect(matchRecoveryRoute('/RefArch/en-US/p/a%2Fb')?.params['*']).toBe('a/b');
});

it('resets cached fixture trees and reads the deployment basename per call', () => {
    const first = setRecoveryManifest();
    const firstRoutes = first.routes;
    expect(matchRecoveryRoute('/RefArch/cart')?.metadata.isDocument).toBe(true);
    setRecoveryManifest({ prefix: '/' });
    expect(first.routes).not.toBe(firstRoutes);
    expect(matchRecoveryRoute('/cart')?.metadata.isDocument).toBe(true);
    expect(matchRecoveryRoute('/RefArch/cart')).toBeNull();
    basename.value = '/deployment';
    expect(matchRecoveryRoute('/deployment/cart')?.metadata.isDocument).toBe(true);
    expect(matchRecoveryRoute('/cart')).toBeNull();
});
