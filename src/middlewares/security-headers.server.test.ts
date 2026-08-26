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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import { securityHeadersMiddleware } from './security-headers.server';
import { securityContext } from '@salesforce/storefront-next-runtime/security';

type Args = Parameters<MiddlewareFunction<Response>>[0];
type Next = Parameters<MiddlewareFunction<Response>>[1];

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: () => ({ security: { headers: {} } }),
}));

function makeArgs(): { args: Args; context: RouterContextProvider } {
    const store = new Map<unknown, unknown>();
    const context = {
        get: (k: unknown) => store.get(k),
        set: (k: unknown, v: unknown) => store.set(k, v),
    } as unknown as RouterContextProvider;
    return {
        args: {
            request: new Request('http://localhost/'),
            url: new URL('http://localhost/'),
            context,
            params: {},
            pattern: '',
        } as Args,
        context,
    };
}

/**
 * The RR middleware return type is `Promise<void | Response>`. In every
 * test here we drive it with a `next()` that resolves to `Response`, so
 * we narrow the result for ergonomic header assertions.
 */
async function run(mw: MiddlewareFunction<Response>, args: Args, next: Next): Promise<Response> {
    return (await mw(args, next)) as Response;
}

describe('securityHeadersMiddleware (template wiring)', () => {
    const origBundle = process.env.BUNDLE_ID;

    beforeEach(() => {
        // This middleware is server-only. The package-level test environment is
        // JSDOM, so model the production runtime explicitly now that isRemote()
        // also supports browsers.
        vi.stubGlobal('window', undefined);
        process.env.BUNDLE_ID = 'abc123';
        // The template middleware caches its inner factory on first call;
        // reset so each test sees a fresh boot path with the current env.
        vi.resetModules();
    });

    afterEach(() => {
        process.env.BUNDLE_ID = origBundle;
        vi.unstubAllGlobals();
    });

    it('sets all six headers on a real request through the template middleware', async () => {
        const { args } = makeArgs();
        const res = await run(securityHeadersMiddleware, args, (() =>
            Promise.resolve(new Response('ok'))) as unknown as Next);
        expect(res.headers.get('content-security-policy')).not.toBeNull();
        expect(res.headers.get('strict-transport-security')).not.toBeNull();
        expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
        expect(res.headers.get('permissions-policy')).not.toBeNull();
    });

    it('exposes a nonce in context that matches the CSP header nonce', async () => {
        const { args, context } = makeArgs();
        let observed: string | null = null;
        const res = await run(securityHeadersMiddleware, args, (() => {
            observed = context.get(securityContext)?.nonce ?? null;
            return Promise.resolve(new Response('ok'));
        }) as unknown as Next);
        expect(observed).toMatch(/^[A-Za-z0-9+/=]{24}$/);
        const csp = res.headers.get('content-security-policy');
        if (csp === null) throw new Error('Expected CSP header to be set');
        expect(csp).toContain(`'nonce-${observed}'`);
    });

    it('honors env-var override of csp.reportOnly', async () => {
        // Re-mock getConfig with the env-overridden shape and dynamic-import
        // a fresh module instance so the lazy `middleware` cache reads it.
        // `vi.resetModules()` in beforeEach clears the module registry, so
        // this dynamic import is independent of the static import at the top
        // of the file. If you add a fourth test, keep this pattern OR move
        // the static import to also be dynamic for symmetry — mixing the two
        // styles silently shares state across tests.
        vi.doMock('@salesforce/storefront-next-runtime/config', () => ({
            getConfig: () => ({ security: { headers: { csp: { reportOnly: true } } } }),
        }));
        const { securityHeadersMiddleware: mw } = await import('./security-headers.server');
        const { args } = makeArgs();
        const res = await run(mw, args, (() => Promise.resolve(new Response('ok'))) as unknown as Next);
        expect(res.headers.get('content-security-policy')).toBeNull();
        expect(res.headers.get('content-security-policy-report-only')).not.toBeNull();
    });

    it('config.server.ts ships populated security.headers so PUBLIC__ env-var overrides validate (regression: empty headers: {} bug)', async () => {
        // This guards against a regression where config.server.ts ships
        // `headers: {}` instead of the populated default shape. With an empty
        // headers object, mergeEnvConfig's extractValidPaths only emits
        // `app__security__headers` as a leaf and silently drops sub-path
        // overrides like `PUBLIC__app__security__headers__csp__reportOnly`.
        //
        // The fix is in config.server.ts: `headers: defaultSecurityHeaders`
        // (not `headers: {}`).
        //
        // We import the actual `config.server.ts` and assert that the
        // shipped `security.headers` shape contains nested keys — making
        // sub-path env-var overrides valid targets for `mergeEnvConfig`.
        // If anyone reverts to `headers: {}`, this test fails.
        //
        // The top-level vi.mock at line 24 stubs `@/...runtime/config` to
        // expose only `getConfig`, but config.server.ts needs `defineConfig`.
        // Partial-mock the real config module so config.server.ts loads.
        vi.doMock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
            const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
            return { ...actual, getConfig: () => ({ security: { headers: {} } }) };
        });
        const configModule = (await import('../../config.server')) as unknown as {
            default: { app: { security: { headers: Record<string, unknown> } } };
        };
        const headers = configModule.default.app.security.headers;
        // The empty-object bug ships `{}`; the fix populates default keys.
        expect(Object.keys(headers).length).toBeGreaterThan(0);
        // Nested CSP shape must be present — otherwise the env-var path
        // `PUBLIC__app__security__headers__csp__reportOnly` would be
        // rejected by mergeEnvConfig's path validation.
        expect(headers.csp).toMatchObject({ reportOnly: expect.any(Boolean) });
    });
});
