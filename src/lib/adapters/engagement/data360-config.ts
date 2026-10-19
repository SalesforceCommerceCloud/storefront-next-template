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

import type { EngagementAdapterConfig } from './types';

export type Data360Config = EngagementAdapterConfig & {
    /** Data 360 app source id (from the provisioned Website connector). */
    appSourceId: string;
    /** Data 360 tenant id; forms the `{tenantId}.c360a.salesforce.com` host. */
    tenantId: string;
    /** SFCC site id — used as `siteId`/`internalOrganizationId` in interactions. */
    siteId: string;
    /** Paths handled by specialized events instead of shared Page View tracking. */
    pageViewsBlocklist: string[];
    /** Optional site/locale prefix stripped before matching the Page View blocklist. */
    urlPrefix?: string;
    /** URL aliases used to resolve the active site's prefix. */
    siteAliasMap?: Record<string, string>;
    /** URL aliases used to resolve the active locale's prefix. */
    localeAliasMap?: Record<string, string>;
    /**
     * Source discriminator on catalog events so Storefront Next traffic is
     * separable from PWA Kit's (`'pwa'`) in the shared DLO. Defaults to `'sfnext'`.
     */
    webStoreId: string;
};

function isNonBlankString(value: unknown): boolean {
    return typeof value === 'string' && value.trim() !== '';
}

/**
 * Validates the fields required to construct the Data 360 endpoint URL and
 * interaction identity. `appSourceId` + `tenantId` build the host/path;
 * `siteId` is the `internalOrganizationId` on every party identification event.
 * Returns `{ valid, errors }`; the adapter factory throws on failure.
 */
export function validateData360Config(config: Partial<Data360Config>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!isNonBlankString(config.appSourceId)) {
        errors.push(`Missing required field: appSourceId`);
    }
    if (!isNonBlankString(config.tenantId)) {
        errors.push(`Missing required field: tenantId`);
    }
    if (!isNonBlankString(config.siteId)) {
        errors.push(`Missing required field: siteId`);
    }
    return { valid: errors.length === 0, errors };
}
