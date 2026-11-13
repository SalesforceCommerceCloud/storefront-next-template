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

import type { Cookie, CookieOptions } from 'react-router';
import type { Locale as BaseLocale, Site as BaseSite, Url } from '../config/types';

// extended Site/Locale to use for site context feature.
export type Locale = BaseLocale & {
    alias?: string;
};

export type Site = Omit<BaseSite, 'supportedLocales'> & {
    supportedLocales: Locale[];
};

export type SiteContext = {
    site: Site;
    locale: Locale;
    currency: string;
    siteCookie: Cookie;
    localeCookie: Cookie;
    currencyCookie: Cookie;
};

/**
 * Configuration passed into the site context middleware
 * Configured by the consumer
 */
export type SiteConfig = {
    sites: Site[];
    defaultSiteId: string;
    defaultLocale: string;
    siteDetectionConfig?: DetectionConfig;
    localeDetectionConfig?: DetectionConfig;
    currencyCookieName?: string;
    cookieOptions?: CookieOptions;
};

/**
 * URL configuration for Page Designer storefront handoffs.
 *
 * Providing these options enables handoff handling in EDIT/PREVIEW.
 * The site comes from the request's `__siteId` parameter; these options
 * define how its canonical URL is built.
 */
export type PreviewOptions = {
    /** URL prefix and search configuration for the redirect destination. */
    urlConfig?: Url;
    /** Application base path for the redirect destination; defaults to `/`. */
    basePath?: string;
};

/**
 * Resolved settings used by site/locale/currency resolution (all detection options have values).
 */
export type SiteSettings = SiteConfig & {
    siteDetectionConfig: Required<DetectionConfig>;
    localeDetectionConfig: Required<DetectionConfig>;
    siteCookie: Cookie;
    localeCookie: Cookie;
    currencyCookie: Cookie;
};

/** Detection method identifier (used for both site and locale detection) */
export type DetectionMethod = 'path' | 'querystring' | 'cookie' | 'header';

// Detection configuration type (all fields optional with sensible defaults)
export type DetectionConfig = {
    order: DetectionMethod[];
    lookupFromPathIndex?: number;
    lookupQuerystring?: string;
    lookupCookie?: string;
    lookupHeader?: string;
    caches?: Array<'cookie'>;
};
