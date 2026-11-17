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
import { createCookie } from 'react-router';
import resources from '@/locales';
import { mockConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
import { createRecoveryErrorResponse } from './recovery-error.server';

beforeEach(() => vi.stubGlobal('window', undefined));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

const config: AppConfig = {
    ...mockConfig,
    localeAliasMap: { 'it-IT': 'italiano' },
    localeDetectionConfig: {
        ...mockConfig.localeDetectionConfig,
        order: ['querystring', 'cookie'],
        lookupQuerystring: 'language',
        lookupCookie: 'language_cookie',
    },
};

const bundledLocales = [
    'da-DK',
    'de-DE',
    'en-GB',
    'en-US',
    'es-ES',
    'fi-FI',
    'fr-FR',
    'it-IT',
    'ja-JP',
    'ko-KR',
    'nb-NO',
    'nl-NL',
    'pl-PL',
    'pt-PT',
    'sv-SE',
    'zh-CN',
    'zh-TW',
] as const;

it('covers every bundled locale', () => {
    expect([...bundledLocales].sort()).toEqual(Object.keys(resources).sort());
});

it.each(bundledLocales)('has complete rejection translations in the active bundle for %s', (locale) => {
    const copy = resources[locale].routeError;
    expect(copy).toBeDefined();
    for (const key of ['defaultTitle', 'defaultDescription', 'goToHomepage'] as const) {
        expect(copy[key]).toBeTypeOf('string');
        expect(copy[key].trim()).not.toBe('');
    }
});

it.each(bundledLocales)('renders translated rejection copy with matching lang for %s', async (locale) => {
    const { defaultTitle: title, defaultDescription: message, goToHomepage: home } = resources[locale].routeError;
    const localeConfig = {
        ...config,
        commerce: {
            ...config.commerce,
            sites: config.commerce.sites.map((site) => ({
                ...site,
                supportedLocales: [{ id: locale, preferredCurrency: site.defaultCurrency }],
            })),
        },
    };
    for (const status of [400, 409] as const) {
        const response = createRecoveryErrorResponse(
            new Request(`https://example.com/resource/auth-recovery?language=${locale}`),
            localeConfig,
            status
        );
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        expect(doc.documentElement.lang).toBe(locale);
        expect(doc.title).toBe(title);
        expect(doc.querySelector('main h1')?.textContent).toBe(title);
        expect(doc.querySelector('main p')?.textContent).toBe(message);
        expect(doc.querySelector('main a')?.textContent).toBe(home);
        expect(doc.querySelector('script')).toBeNull();
        expect(response.status).toBe(status);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.getSetCookie()).toEqual([]);
    }
});

it.each([
    undefined,
    null,
    {},
    { defaultTitle: 'Deutscher Titel' },
    { defaultDescription: 'Deutsche Beschreibung', goToHomepage: 'Startseite' },
    { defaultTitle: 'Deutscher Titel', goToHomepage: 'Startseite' },
    { defaultTitle: 'Deutscher Titel', defaultDescription: 'Deutsche Beschreibung' },
    { defaultTitle: '', defaultDescription: 'Deutsche Beschreibung', goToHomepage: 'Startseite' },
])('falls back as an entire language bundle when routeError is absent or partial: %j', async (routeError) => {
    const fallbackCopy = resources['en-GB'].routeError;
    const original = resources['de-DE'];
    const selected = { ...original };
    if (routeError === undefined) {
        Reflect.deleteProperty(selected, 'routeError');
    } else {
        Reflect.set(selected, 'routeError', routeError);
    }
    Reflect.set(resources, 'de-DE', selected);
    try {
        for (const status of [400, 409] as const) {
            const response = createRecoveryErrorResponse(
                new Request('https://example.com/resource/auth-recovery?language=de-DE'),
                {
                    ...config,
                    commerce: {
                        ...config.commerce,
                        sites: config.commerce.sites.map((site) => ({
                            ...site,
                            supportedLocales: [{ id: 'de-DE', preferredCurrency: site.defaultCurrency }],
                        })),
                    },
                },
                status
            );
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            expect(doc.documentElement.lang).toBe('en-GB');
            expect(doc.title).toBe(fallbackCopy.defaultTitle);
            expect(doc.querySelector('main h1')?.textContent).toBe(fallbackCopy.defaultTitle);
            expect(doc.querySelector('main p')?.textContent).toBe(fallbackCopy.defaultDescription);
            expect(doc.querySelector('main a')?.textContent).toBe(fallbackCopy.goToHomepage);
            expect(doc.querySelector('script')).toBeNull();
            expect(response.status).toBe(status);
            expect(response.headers.get('Cache-Control')).toBe('no-store');
            expect(response.headers.getSetCookie()).toEqual([]);
        }
    } finally {
        Reflect.set(resources, 'de-DE', original);
    }
});

it.each([400, 409] as const)('renders a localized accessible no-store %s before i18n/auth', async (status) => {
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-a');
    const response = createRecoveryErrorResponse(
        new Request('https://example.com/resource/auth-recovery?language=italiano'),
        config,
        status
    );
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('Location')).toBeNull();
    expect(doc.documentElement.lang).toBe('it-IT');
    expect(doc.querySelector('main h1')?.textContent).toBe(resources['it-IT'].routeError.defaultTitle);
    expect(doc.querySelector('main p')?.textContent).toBe(resources['it-IT'].routeError.defaultDescription);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('/site-a/');
    expect(doc.querySelector('a')?.textContent).toBe(resources['it-IT'].routeError.goToHomepage);
    expect(doc.querySelector('script')).toBeNull();
});

it.each([
    'unknown',
    '%ZZ',
    'italiano&language=it-IT',
])('uses the default locale for invalid explicit language %s despite cookies', async (language) => {
    const cookie = (await createCookie('language_cookie').serialize('it-IT')).split(';')[0];
    const response = createRecoveryErrorResponse(
        new Request(`https://example.com/resource/auth-recovery?language=${language}`, { headers: { Cookie: cookie } }),
        config,
        400
    );
    expect(await response.text()).toContain('lang="en-GB"');
});

it('uses a valid configured locale cookie when no explicit locale is present', async () => {
    const cookie = (await createCookie('language_cookie').serialize('it-IT')).split(';')[0];
    const response = createRecoveryErrorResponse(
        new Request('https://example.com/resource/auth-recovery', { headers: { Cookie: cookie } }),
        config,
        400
    );
    expect(await response.text()).toContain('lang="it-IT"');
});

it('escapes localized text and the deployment home link', async () => {
    const original = resources['en-GB'].routeError.defaultTitle;
    resources['en-GB'].routeError.defaultTitle = '<script>bad</script>';
    vi.stubEnv('MRT_ENV_BASE_PATH', '/site-"bad');
    const response = createRecoveryErrorResponse(
        new Request('https://example.com/resource/auth-recovery'),
        config,
        400
    );
    const html = await response.text();
    resources['en-GB'].routeError.defaultTitle = original;
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('/site-"bad/');
});
