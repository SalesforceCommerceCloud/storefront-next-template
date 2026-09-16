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
import { resolveShopperAgentConfig, type CimulateConfig } from './cimulate.utils';

const populated: CimulateConfig = {
    enabled: 'true',
    commerceClientScriptSourceUrl: 'https://cdn.example.cimulate.ai/widget.umd.js',
    scrt2Url: 'https://scrt2.example.salesforce.com',
    salesforceOrgId: 'org-A',
    esDeveloperName: 'ES_A',
};

const legacy: CimulateConfig = {
    enabled: 'true',
    commerceClientScriptSourceUrl: 'https://cdn.legacy.cimulate.ai/widget.umd.js',
    scrt2Url: 'https://scrt2.legacy.salesforce.com',
    salesforceOrgId: 'org-B',
    esDeveloperName: 'ES_B',
};

const emptyDefault: CimulateConfig = {
    enabled: '',
    commerceClientScriptSourceUrl: '',
    scrt2Url: '',
    salesforceOrgId: '',
    esDeveloperName: '',
};

describe('resolveShopperAgentConfig', () => {
    it('returns commerce.shopperAgent when it is populated', () => {
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent: populated },
            cimulateAgent: legacy,
        });
        expect(result).toBe(populated);
    });

    it('falls back to legacy cimulateAgent when commerce.shopperAgent is missing', () => {
        const result = resolveShopperAgentConfig({ cimulateAgent: legacy });
        expect(result).toBe(legacy);
    });

    it('falls back to legacy cimulateAgent when commerce.shopperAgent is the empty default', () => {
        // Shipped default has empty strings for enabled/scriptSourceUrl — the resolver
        // must not treat that as "user set the new env var" and shadow the legacy value.
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent: emptyDefault },
            cimulateAgent: legacy,
        });
        expect(result).toBe(legacy);
    });

    it('prefers commerce.shopperAgent when enabled is truthy (boolean)', () => {
        const shopperAgent: CimulateConfig = { ...emptyDefault, enabled: true };
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent },
            cimulateAgent: legacy,
        });
        expect(result).toBe(shopperAgent);
    });

    it('prefers commerce.shopperAgent when only commerceClientScriptSourceUrl is set (enabled still empty)', () => {
        const shopperAgent: CimulateConfig = {
            ...emptyDefault,
            commerceClientScriptSourceUrl: 'https://cdn.example.cimulate.ai/widget.umd.js',
        };
        const result = resolveShopperAgentConfig({
            commerce: { shopperAgent },
            cimulateAgent: legacy,
        });
        expect(result).toBe(shopperAgent);
    });

    it('returns undefined when neither is set', () => {
        expect(resolveShopperAgentConfig({})).toBeUndefined();
        expect(resolveShopperAgentConfig(undefined)).toBeUndefined();
        expect(resolveShopperAgentConfig(null)).toBeUndefined();
    });

    it('returns commerce.shopperAgent when legacy is absent', () => {
        const result = resolveShopperAgentConfig({ commerce: { shopperAgent: populated } });
        expect(result).toBe(populated);
    });
});
