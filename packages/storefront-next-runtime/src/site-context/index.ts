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
export { SiteProvider, useSite, type SiteContextValue } from './site-context';
export { applyUrlConfig } from './apply-url-config';
export { buildUrl, resolvePrefix, stripPathPrefix, extractPrefixParamValues } from './build-url';

export { createSiteContextMiddleware, resolveSiteContext, siteContext, getSiteContextCookies } from './middleware';
export type { ResolvedSiteContext } from './middleware';
export { requestToLocaleMap } from './cookies';
export type {
    SiteConfig,
    SiteContext,
    SiteSettings,
    Site,
    Locale,
    DetectionConfig,
    PreviewOptions,
} from './types';
