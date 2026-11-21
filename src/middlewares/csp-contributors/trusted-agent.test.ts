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
import { createTrustedAgentCspContributor } from './trusted-agent';

const ctx = { baseDirectives: {} } as CspResolutionContext;
const SLAS = 'https://kv7kzm78.api.commercecloud.salesforce.com';

describe('createTrustedAgentCspContributor', () => {
    it('adds the SLAS origin to form-action when trusted agent is enabled', () => {
        const contributor = createTrustedAgentCspContributor({ enabled: true }, () => SLAS);
        expect(contributor.id).toBe('trusted-agent');
        expect(contributor.isActive(ctx)).toBe(true);
        expect(contributor.contribute(ctx)).toEqual({ 'form-action': [SLAS] });
    });

    it('reduces a proxy host with a path to its origin', () => {
        const contributor = createTrustedAgentCspContributor(
            { enabled: true },
            () => 'https://proxy.example.com:8443/scapi'
        );
        expect(contributor.contribute(ctx)).toEqual({ 'form-action': ['https://proxy.example.com:8443'] });
    });

    it('passes the runtime CSP validator so security-headers boots', () => {
        const contributor = createTrustedAgentCspContributor({ enabled: true }, () => SLAS);
        expect(() => validateContributors([contributor], {})).not.toThrow();
    });

    it.each([[{ enabled: false }], [{}], [undefined]])('is inactive and contributes nothing for %j', (config) => {
        const contributor = createTrustedAgentCspContributor(config, () => {
            throw new Error('must not resolve the SLAS URL when disabled');
        });
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });
});
