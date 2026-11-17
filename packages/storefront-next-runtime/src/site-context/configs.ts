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

import type { DetectionConfig } from './types';

export const DEFAULT_CURRENCY_COOKIE_NAME = 'currency';

/**
 * Default site detection configuration
 */
export const DEFAULT_SITE_DETECTION: Required<DetectionConfig> = {
    order: ['path', 'querystring', 'cookie', 'header'],
    lookupFromPathIndex: 0,
    lookupQuerystring: 'site',
    lookupCookie: 'site_id',
    lookupHeader: 'X-Site-Id',
    caches: ['cookie'],
};

/**
 * Default locale detection configuration
 */
export const DEFAULT_LOCALE_DETECTION: Required<DetectionConfig> = {
    order: ['path', 'querystring', 'cookie', 'header'],
    lookupFromPathIndex: 1,
    lookupQuerystring: 'lng',
    lookupCookie: 'lng',
    lookupHeader: 'Accept-Language',
    caches: ['cookie'],
};

/** Effective site detection options, using the middleware's shallow-merge contract. */
export function resolveSiteDetectionConfig(config?: DetectionConfig): Required<DetectionConfig> {
    const resolved = { ...DEFAULT_SITE_DETECTION, ...config };
    return { ...resolved, order: resolved.order?.slice(), caches: resolved.caches?.slice() };
}

/** Effective locale detection options, using the middleware's shallow-merge contract. */
export function resolveLocaleDetectionConfig(config?: DetectionConfig): Required<DetectionConfig> {
    const resolved = { ...DEFAULT_LOCALE_DETECTION, ...config };
    return { ...resolved, order: resolved.order?.slice(), caches: resolved.caches?.slice() };
}
