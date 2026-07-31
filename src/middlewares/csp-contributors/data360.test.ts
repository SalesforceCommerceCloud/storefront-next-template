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
import { describe, it, expect } from 'vitest';
import { type CspResolutionContext, validateContributors } from '@salesforce/storefront-next-runtime/security';
import { createData360CspContributor } from './data360';

// contribute()/isActive() run at boot with a resolution context; contents are
// irrelevant to this contributor (it derives its origin purely from config).
const ctx = { baseDirectives: {} } as CspResolutionContext;

// A fake, tenant-shaped id — the contributor derives its origin purely by string
// interpolation, so the value only needs the right shape, not the real tenant.
const TENANT = 'abc123def-xyz.example-tenant.pc-rnd';

describe('createData360CspContributor', () => {
    it('is active and contributes the exact per-tenant connect-src when enabled with a tenantId', () => {
        const contributor = createData360CspContributor({ enabled: true, tenantId: TENANT });
        expect(contributor.id).toBe('data360');
        expect(contributor.isActive(ctx)).toBe(true);
        expect(contributor.contribute(ctx)).toEqual({
            'connect-src': [`https://${TENANT}.c360a.salesforce.com`],
        });
    });

    it('passes the runtime CSP validator (no wildcard) so security-headers boots', () => {
        const contributor = createData360CspContributor({ enabled: true, tenantId: TENANT });
        // This is the path createSecurityHeadersMiddleware runs at boot. A wildcard
        // origin throws here — an exact per-tenant origin must not.
        expect(() => validateContributors([contributor], {})).not.toThrow();
    });

    it('is inactive and contributes nothing when disabled', () => {
        const contributor = createData360CspContributor({ enabled: false, tenantId: TENANT });
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });

    it('is inactive when enabled but tenantId is missing (cannot form an origin)', () => {
        const contributor = createData360CspContributor({ enabled: true, tenantId: '' });
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });

    it('is inactive when config is undefined', () => {
        const contributor = createData360CspContributor(undefined);
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });
});
