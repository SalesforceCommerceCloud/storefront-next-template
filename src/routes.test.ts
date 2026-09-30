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
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

describe('routes.ts', () => {
    let originalReactRouterAppDirectory: string;

    beforeEach(() => {
        originalReactRouterAppDirectory = globalThis.__reactRouterAppDirectory;
        globalThis.__reactRouterAppDirectory = __dirname;
    });

    afterEach(() => {
        globalThis.__reactRouterAppDirectory = originalReactRouterAppDirectory;
    });

    it('should export the routes object', async () => {
        const { default: routes } = await import('./routes');
        const resolvedRoutes = await routes;

        // With site context URL prefix configured, routes are wrapped under a site-context-wrapper
        const wrapper = resolvedRoutes.find((r: any) => r.id === 'site-context-wrapper');
        expect(wrapper).toBeDefined();
        expect(wrapper?.children).toBeDefined();

        const wrappedRoutes = wrapper?.children ?? [];

        // Find the `_app` layout route (pathless layout) inside the wrapper
        const defaultLayout = wrappedRoutes.find((r: any) => r.id === 'routes/_app');
        expect(defaultLayout).toBeDefined();
        expect(defaultLayout?.file).toBe('routes/_app.tsx');
        expect(defaultLayout?.children).toBeDefined();

        // Check some child routes that should be nested under the `_app` layout
        expect(defaultLayout?.children).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'routes/_app._index',
                    index: true,
                    path: undefined,
                }),
                expect.objectContaining({
                    id: 'routes/_app.c.$',
                    path: 'c/*',
                }),
                expect.objectContaining({
                    id: 'routes/_app.p.$',
                    path: 'p/*',
                }),
                expect.objectContaining({
                    id: 'routes/_app.cart',
                    path: 'cart',
                }),
            ])
        );

        // Find the _checkout layout route (minimal header/footer) inside the wrapper
        const checkoutLayout = wrappedRoutes.find((r: any) => r.id === 'routes/_checkout');
        expect(checkoutLayout).toBeDefined();
        expect(checkoutLayout?.file).toBe('routes/_checkout.tsx');
        expect(checkoutLayout?.children).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'routes/_checkout.checkout',
                    path: 'checkout',
                }),
            ])
        );

        // Find the _empty layout route (pathless layout) inside the wrapper
        const emptyLayout = wrappedRoutes.find((r: any) => r.id === 'routes/_empty');
        expect(emptyLayout).toBeDefined();
        expect(emptyLayout?.file).toBe('routes/_empty.tsx');
        expect(emptyLayout?.children).toBeDefined();

        // Check some child routes that should be nested under the `_empty` layout
        expect(emptyLayout?.children).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'routes/_empty.signup',
                    path: 'signup',
                }),
                expect.objectContaining({
                    id: 'routes/_empty.login',
                    path: 'login',
                }),
                expect.objectContaining({
                    id: 'routes/_empty.logout',
                    path: 'logout',
                }),
            ])
        );

        // Verify root index route is duplicated at the top level for homepage access at '/'
        const rootDuplicate = resolvedRoutes.find((r: any) => r.id === 'routes/_app--root-duplicate');
        expect(rootDuplicate).toBeDefined();
    });
});
