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
import { resolveLocaleDetectionConfig } from '@salesforce/storefront-next-runtime/site-context';
import resources from '@/locales';
import { parseCookie } from '@/lib/cookie';
import { getBasePath } from '@/lib/utils';
import type { AppConfig } from '@/types/config';

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"']/g,
        (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character
    );
}

/** A standalone rejection document: site-context can reject before i18n and auth run.
 * @environment MRT_ENV_BASE_PATH - Optional deployment basename, e.g. `/site-a`; scopes the home link.
 */
export function createRecoveryErrorResponse(request: Request, config?: AppConfig, status: 400 | 409 = 400): Response {
    const supported = config?.commerce.sites.flatMap((site) => site.supportedLocales.map((locale) => locale.id)) ?? [
        'en-GB',
    ];
    const resolveLanguage = (reference: unknown) => {
        const matches = supported.filter(
            (locale) => locale === reference || config?.localeAliasMap?.[locale] === reference
        );
        const unique = [...new Set(matches)];
        return unique.length === 1 ? unique[0] : undefined;
    };
    const detection = resolveLocaleDetectionConfig(config?.localeDetectionConfig);
    const query = new URL(request.url).searchParams;
    // Invalid explicit locale must not be replaced with a stale cookie preference.
    const explicit = query.getAll(detection.lookupQuerystring);
    const requested = explicit.length
        ? explicit.length === 1
            ? resolveLanguage(explicit[0])
            : undefined
        : resolveLanguage(parseCookie(request.headers.get('Cookie') ?? '', detection.lookupCookie));
    const defaultSite = config?.commerce.sites.find((site) => site.id === config.defaultSiteId);
    const preferred = requested ?? defaultSite?.defaultLocale ?? config?.i18n.fallbackLng ?? 'en-GB';
    const language = Object.hasOwn(resources, preferred) ? preferred : (config?.i18n.fallbackLng ?? 'en-GB');
    const selected = resources[language as keyof typeof resources];
    const candidate = selected?.routeError;
    // Keep the document and its language together; partial bundles must not mix languages.
    const complete =
        candidate &&
        [candidate.defaultTitle, candidate.defaultDescription, candidate.goToHomepage].every(
            (value) => typeof value === 'string' && value.trim().length > 0
        );
    const localized = complete ? candidate : resources['en-GB'].routeError;
    const lang = complete ? language : 'en-GB';
    const title = escapeHtml(localized.defaultTitle);
    const message = escapeHtml(localized.defaultDescription);
    const home = escapeHtml(localized.goToHomepage);
    return new Response(
        `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p><a href="${escapeHtml(`${getBasePath()}/`)}">${home}</a></main></body></html>`,
        {
            status,
            headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' },
        }
    );
}
