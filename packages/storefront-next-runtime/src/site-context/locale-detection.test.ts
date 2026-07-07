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
 * This allows us to test the locale detection from cookie using the same approach
 * used by the template app
 */
import { afterEach, describe, it, expect } from 'vitest';
import { DEFAULT_LOCALE_DETECTION, DEFAULT_SITE_DETECTION } from './configs';
import { createSiteContextCookie, createCurrencyCookie } from './cookies';
import { resolveLocale } from './locale-detection';
import type { Locale, SiteSettings, Site } from './types';

// Create cookies using default names for testing
const siteCookie = createSiteContextCookie(DEFAULT_SITE_DETECTION.lookupCookie);
const localeCookie = createSiteContextCookie(DEFAULT_LOCALE_DETECTION.lookupCookie);
const currencyCookie = createCurrencyCookie('currency');

const SITE: Site = {
    id: 'site-us',
    name: 'US',
    defaultLocale: 'en-US',
    supportedLocales: [
        { id: 'en-US', preferredCurrency: 'USD' },
        { id: 'es-US', preferredCurrency: 'USD' },
        { id: 'fr-US', preferredCurrency: 'USD' },
    ],
    supportedCurrencies: ['USD'],
    defaultCurrency: 'USD',
};

function createSettings(overrides: Partial<SiteSettings> = {}): SiteSettings {
    return {
        sites: [],
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

describe('locale-detection', () => {
    const esUSLocale: Locale = { id: 'es-US', preferredCurrency: 'USD' };
    const enUSLocale: Locale = { id: 'en-US', preferredCurrency: 'USD' };

    it('resolves locale from path', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/us/es-US/page');
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(esUSLocale);
    });

    it('resolves locale from header', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/', {
            headers: { 'Accept-Language': 'es-US' }, // Accept-Language is the default header for locale detection
        });
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(esUSLocale);
    });

    it('resolves locale from querystring', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/?lng=es-US');
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(esUSLocale);
    });

    it('resolves locale from cookie', async () => {
        const cookieHeader = await localeCookie.serialize('es-US');
        const request = new Request('https://example.com/', {
            headers: { Cookie: cookieHeader },
        });
        const settings = createSettings();
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(esUSLocale);
    });

    it('falls back to defaultLocale when no source yields a valid locale', async () => {
        const settings = createSettings();
        const request = new Request('https://example.com/');
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(enUSLocale);
    });

    it('throws when defaultLocale is not in site supportedLocales', async () => {
        const settings = createSettings({ defaultLocale: 'fr-FR' });
        const request = new Request('https://example.com/');
        await expect(resolveLocale(request, settings, SITE)).rejects.toThrow(
            'Default locale fr-FR not found in the list of supported locales for site site-us'
        );
    });

    it('falls back to defaultLocale when path segment is not a supported locale', async () => {
        const settings = createSettings({
            localeDetectionConfig: { ...DEFAULT_LOCALE_DETECTION, order: ['path'] },
        });
        const request = new Request('https://example.com/us/fr-FR/page');
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(enUSLocale);
    });

    it('ignores cookie value that is not in supportedLocales and falls back to default', async () => {
        const settings = createSettings({
            localeDetectionConfig: { ...DEFAULT_LOCALE_DETECTION, order: ['cookie', 'path'] },
        });
        const cookieHeader = await localeCookie.serialize('fr-FR');
        const request = new Request('https://example.com/', {
            headers: { Cookie: cookieHeader },
        });
        const locale = await resolveLocale(request, settings, SITE);
        expect(locale).toEqual(enUSLocale);
    });

    describe('with base path (MRT_ENV_BASE_PATH)', () => {
        afterEach(() => {
            delete process.env.MRT_ENV_BASE_PATH;
        });

        it('resolves locale from path when base path is present', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings();
            const request = new Request('https://example.com/shop/us/es-US/page');
            const locale = await resolveLocale(request, settings, SITE);
            expect(locale).toEqual({ id: 'es-US', preferredCurrency: 'USD' });
        });

        it('falls back to default locale when base path is present and path locale is invalid', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings({
                localeDetectionConfig: { ...DEFAULT_LOCALE_DETECTION, order: ['path'] },
            });
            const request = new Request('https://example.com/shop/us/fr-FR/page');
            const locale = await resolveLocale(request, settings, SITE);
            expect(locale).toEqual({ id: 'en-US', preferredCurrency: 'USD' });
        });

        it('does not affect non-path detection methods', async () => {
            process.env.MRT_ENV_BASE_PATH = '/shop';
            const settings = createSettings();
            const request = new Request('https://example.com/shop/?lng=es-US');
            const locale = await resolveLocale(request, settings, SITE);
            expect(locale).toEqual({ id: 'es-US', preferredCurrency: 'USD' });
        });

        it('resolves locale from path when multi-segment base path is present', async () => {
            process.env.MRT_ENV_BASE_PATH = '/region/us';
            const settings = createSettings();
            const request = new Request('https://example.com/region/us/site-us/es-US/page');
            const locale = await resolveLocale(request, settings, SITE);
            expect(locale).toEqual({ id: 'es-US', preferredCurrency: 'USD' });
        });
    });

    it('resolves locale by alias and returns the full Locale object', async () => {
        const siteWithAliases: Site = {
            ...SITE,
            supportedLocales: [
                { id: 'en-US', alias: 'us', preferredCurrency: 'USD' },
                { id: 'es-US', alias: 'es', preferredCurrency: 'USD' },
            ],
        };
        const settings = createSettings({
            localeDetectionConfig: { ...DEFAULT_LOCALE_DETECTION, order: ['querystring'] },
        });
        const request = new Request('https://example.com/?lng=es');
        const locale = await resolveLocale(request, settings, siteWithAliases);
        expect(locale).toEqual({ id: 'es-US', alias: 'es', preferredCurrency: 'USD' });
    });
});
