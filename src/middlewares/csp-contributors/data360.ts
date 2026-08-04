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

import type { CspContributor, CspContribution } from '@salesforce/storefront-next-runtime/security';

/** The adapter's `enabled` flag plus the `tenantId` that forms the ingestion host. */
type Data360CspConfig = { enabled?: boolean; tenantId?: string } | undefined;

/**
 * Data 360 ingestion runs against a per-tenant host `{tenantId}.c360a.salesforce.com`.
 * The runtime CSP validator (`validateContributors`) rejects wildcard origins, so we
 * emit the exact origin derived from `tenantId` rather than `https://*.c360a.salesforce.com`.
 */
const data360Origin = (tenantId: string): string => `https://${tenantId}.c360a.salesforce.com`;

/** The trimmed tenantId when Data 360 is enabled with one, else null (inactive). */
const activeTenantId = (config: Data360CspConfig): string | null => {
    if (config?.enabled !== true) return null;
    const tenantId = config.tenantId?.trim();
    return tenantId ? tenantId : null;
};

/**
 * CSP contributor for the Data 360 engagement adapter's `sendBeacon` calls.
 * Adds `connect-src https://{tenantId}.c360a.salesforce.com` when Data 360 is
 * enabled with a tenantId; contributes nothing otherwise.
 */
export function createData360CspContributor(config: Data360CspConfig): CspContributor {
    return {
        id: 'data360',
        isActive: () => activeTenantId(config) !== null,
        contribute: (): CspContribution => {
            const tenantId = activeTenantId(config);
            if (!tenantId) return {};
            return { 'connect-src': [data360Origin(tenantId)] };
        },
    };
}
