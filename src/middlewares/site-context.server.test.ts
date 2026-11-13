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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type MiddlewareFunction, RouterContextProvider } from 'react-router';

// Capture the SiteConfig the template middleware builds and hands to the SDK,
// and short-circuit the real SDK middleware with a passthrough.
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    createSiteContextMiddleware: vi.fn(() => (_args: unknown, next: () => Promise<Response>) => next()),
}));
vi.mock('@salesforce/storefront-next-runtime/config', () => ({ getConfig: vi.fn() }));
vi.mock('@/lib/utils', () => ({ getBasePath: vi.fn(() => '') }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { siteContextMiddleware } from './site-context.server';
import { createSiteContextMiddleware, type PreviewOptions } from '@salesforce/storefront-next-runtime/site-context';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getBasePath } from '@/lib/utils';

type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const baseConfig = {
    commerce: { sites: [{ id: 'RefArch', defaultLocale: 'en-US', supportedLocales: [{ id: 'en-US' }] }] },
    defaultSiteId: 'RefArch',
};

async function runWith(configOverrides: Record<string, unknown>) {
    vi.mocked(getConfig).mockReturnValue({ ...baseConfig, ...configOverrides } as never);
    const next = vi.fn().mockResolvedValue(new Response('ok')) as unknown as MiddlewareNext;
    await siteContextMiddleware(
        {
            request: new Request('https://example.com/'),
            url: new URL('https://example.com/'),
            context: new RouterContextProvider(),
            params: {},
            pattern: '',
        } as Parameters<MiddlewareFunction<Response>>[0],
        next
    );
    return vi.mocked(createSiteContextMiddleware).mock.calls[0][0];
}

describe('siteContextMiddleware cookie domain', () => {
    beforeEach(() => {
        vi.mocked(createSiteContextMiddleware).mockClear();
    });

    it('feeds the global app.cookies.domain into the SDK cookieOptions', async () => {
        const config = await runWith({ cookies: { domain: '.global.com' } });
        expect(config.cookieOptions).toEqual({ domain: '.global.com' });
    });

    it('uses app.cookies.domain as the sole domain source, preserving other cookieOptions attributes', async () => {
        const config = await runWith({
            cookies: { domain: '.global.com' },
            siteContext: { cookieOptions: { domain: '.stale.com', httpOnly: true } },
        });
        // The global knob is the only domain source — a stale cookieOptions.domain is overridden,
        // so site-context cookies share the same domain as the auth cookies. Other attributes (httpOnly) survive.
        expect(config.cookieOptions).toEqual({ domain: '.global.com', httpOnly: true });
    });

    it('ignores a stray cookieOptions.domain when no global knob is set (never diverges from auth cookies)', async () => {
        const config = await runWith({
            // no app.cookies.domain — host-only is the default
            siteContext: { cookieOptions: { domain: '.legacy.com', httpOnly: true } },
        });
        // domain is dropped; only the non-domain attribute survives, matching the auth family (host-only).
        expect(config.cookieOptions).toEqual({ httpOnly: true });
        expect(config.cookieOptions?.domain).toBeUndefined();
    });

    it('omits domain entirely when neither is set (host-only)', async () => {
        const config = await runWith({});
        expect(config.cookieOptions?.domain).toBeUndefined();
    });
});

describe('siteContextMiddleware preview options', () => {
    beforeEach(() => {
        vi.mocked(createSiteContextMiddleware).mockClear();
        vi.mocked(getBasePath).mockReturnValue('');
    });

    it('passes preview options to the site context middleware', async () => {
        vi.mocked(getBasePath).mockReturnValue('/shop');

        await runWith({ url: { prefix: '/:siteId/:localeId', search: '?lng=:localeId' } });

        const options = vi.mocked(createSiteContextMiddleware).mock.calls[0][1] as PreviewOptions;
        expect(options).toEqual({
            urlConfig: { prefix: '/:siteId/:localeId', search: '?lng=:localeId' },
            basePath: '/shop',
        });
    });
});
