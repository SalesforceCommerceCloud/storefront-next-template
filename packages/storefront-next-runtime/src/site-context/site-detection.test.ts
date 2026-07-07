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

/**
 * @vitest-environment jsdom
 * Use jsdom so the Cookie request header is available (happy-dom strips it per Fetch spec).
 * This allows us to test the site detection from cookie using the same approach
 * used by the template app
 */
import { afterEach, describe, it, expect } from 'vitest';
import { DEFAULT_SITE_DETECTION, DEFAULT_LOCALE_DETECTION } from './configs';
import { createSiteContextCookie, createCurrencyCookie } from './cookies';
import { resolveSite } from './site-detection';
import type { SiteSettings, Site } from './types';

// Create cookies using default names for testing
const siteCookie = createSiteContextCookie(DEFAULT_SITE_DETECTION.lookupCookie);
const localeCookie = createSiteContextCookie(DEFAULT_LOCALE_DETECTION.lookupCookie);
const currencyCookie = createCurrencyCookie('currency');

const SITES: Site[] = [
    {
        id: 'site-us',
        name: 'US',
        alias: 'us',
        defaultLocale: 'en-US',
        supportedLocales: [
            { id: 'en-US', preferredCurrency: 'USD' },
            { id: 'es-US', preferredCurrency: 'USD' },
        ],
        supportedCurrencies: ['USD'],
        defaultCurrency: 'USD',
    },
    {
        id: 'site-mx',
        name: 'Mexico',
        alias: 'mx',
        defaultLocale: 'es-MX',
        supportedLocales: [
            { id: 'es-MX', preferredCurrency: 'MXN' },
            { id: 'en-MX', preferredCurrency: 'MXN' },
        ],
        supportedCurrencies: ['MXN'],
        defaultCurrency: 'MXN',
    },
];

function createSettings(overrides: Partial<SiteSettings> = {}): SiteSettings {
    return {
        sites: SITES,
        defaultSiteId: 'site-us',
        defaultLocale: 'en-US',
        siteDetectionConfig: DEFAULT_SITE_DETECTION,
        localeDetectionConfig: DEFAULT_LOCALE_DETECTION,
        siteCookie,
        localeCookie,
        currencyCookie,
        ...overrides,
    };
}

describe('site-detection', () => {
    it('resolves site from path', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/site-mx/en-MX/page');
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-mx');
    });

    it('resolves site by alias from path', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/us/foo');
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-us');
    });

    it('resolves site from header', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/', {
            headers: { 'X-Site-Id': 'site-mx' },
        });
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-mx');
    });

    it('resolves site from querystring', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/?site=site-mx');
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-mx');
    });

    it('resolves site from cookie', async () => {
        const cookieHeader = await siteCookie.serialize('site-mx');
        const request = new Request('https://example.com/', {
            headers: { Cookie: cookieHeader },
        });
        const settings = createSettings();
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-mx');
    });

    it('falls back to defaultSiteId when no source yields a valid site', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/');
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-us');
    });

    it('throws when defaultSiteId is not in sites', async () => {
        const settings = createSettings({ defaultSiteId: 'nonexistent' });
        const request = new Request('https://example.com/');
        await expect(resolveSite(request, settings)).rejects.toThrow('Default site nonexistent not found');
    });

    it('falls back to default when path segment is not a valid site id or alias', async () => {
        const settings = createSettings({
            siteDetectionConfig: { ...DEFAULT_SITE_DETECTION, order: ['path'] },
        });
        const request = new Request('https://example.com/unknown/segment');
        const site = await resolveSite(request, settings);
        expect(site.id).toBe('site-us');
    });

    describe('with base path (MRT_ENV_BASE_PATH)', () => {
        afterEach(() => {
            delete process.env.MRT_ENV_BASE_PATH;
        });

        it('resolves site from path when base path is present', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings();
            const request = new Request('https://example.com/shop/site-mx/en-MX/page');
            const site = await resolveSite(request, settings);
            expect(site.id).toBe('site-mx');
        });

        it('resolves site by alias from path when base path is present', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings();
            const request = new Request('https://example.com/shop/mx/es-MX/page');
            const site = await resolveSite(request, settings);
            expect(site.id).toBe('site-mx');
        });

        it('falls back to default when base path is present and no valid site in path', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings({
                siteDetectionConfig: { ...DEFAULT_SITE_DETECTION, order: ['path'] },
            });
            const request = new Request('https://example.com/shop/unknown/segment');
            const site = await resolveSite(request, settings);
            expect(site.id).toBe('site-us');
        });

        it('does not affect non-path detection methods', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings();
            const request = new Request('https://example.com/shop/?site=site-mx');
            const site = await resolveSite(request, settings);
            expect(site.id).toBe('site-mx');
        });

        it('resolves site from path when multi-segment base path is present', async () => {
            process.env.MRT_ENV_BASE_PATH = '/region/us';
            const settings = createSettings();
            const request = new Request('https://example.com/region/us/site-mx/en-MX/page');
            const site = await resolveSite(request, settings);
            expect(site.id).toBe('site-mx');
        });

        it('resolves site by alias from path when multi-segment base path is present', async () => {
            process.env.MRT_ENV_BASE_PATH = '/region/us';
            const settings = createSettings();
            const request = new Request('https://example.com/region/us/mx/es-MX/page');
            const site = await resolveSite(request, settings);
            expect(site.id).toBe('site-mx');
        });
    });
});
