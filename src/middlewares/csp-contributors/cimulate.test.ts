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
import type { ShopperAgentConfig } from '@/types/config';
import { createCimulateCspContributor } from './cimulate';

const ctx = { baseDirectives: {} } as CspResolutionContext;
const config: ShopperAgentConfig = {
    enabled: true,
    commerceClientScriptSourceUrl: 'https://widget.example.com/messaging.js',
    commerceClientLogoUrl: 'https://logos.example.com/logo.png',
    scrt2Url: 'https://messaging.example.com',
    salesforceOrgId: 'org',
    esDeveloperName: 'Shopping',
};

describe('shopper agent welcome image origins', () => {
    it('allows configured image origins only in img-src and retains existing sources', () => {
        const contributor = createCimulateCspContributor({
            ...config,
            commerceClientImageSourceUrls: [
                'https://images.example.com/banner.jpg',
                'https://images.example.com/another.png',
            ],
        });
        const result = contributor.contribute(ctx);
        expect(result['img-src']).toEqual([
            'https://logos.example.com',
            'https://widget.example.com',
            'https://images.example.com',
        ]);
        expect(result['script-src']).not.toContain('https://images.example.com');
        expect(result['connect-src']).not.toContain('https://images.example.com');
        expect(() => validateContributors([contributor], {})).not.toThrow();
    });
    it('ignores unsafe URLs and contributes nothing when disabled', () => {
        const contributor = createCimulateCspContributor({
            ...config,
            commerceClientImageSourceUrls: [
                'http://images.example.com/a.jpg',
                'https://*.example.com',
                'https://user:pass@example.com/a.jpg',
                'javascript:alert(1)',
            ],
        });
        expect(contributor.contribute(ctx)['img-src']).toEqual([
            'https://logos.example.com',
            'https://widget.example.com',
        ]);
        expect(
            createCimulateCspContributor({
                ...config,
                enabled: false,
                commerceClientImageSourceUrls: ['https://images.example.com'],
            }).contribute(ctx)
        ).toEqual({});
    });
    it('keeps the existing image policy when no extra URLs are configured', () => {
        expect(createCimulateCspContributor(config).contribute(ctx)['img-src']).toEqual([
            'https://logos.example.com',
            'https://widget.example.com',
        ]);
    });
});
