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
import { describe, expect, test } from 'vitest';
import type { CspResolutionContext } from '@salesforce/storefront-next-runtime/security';
import { createEmbeddedAgentCspContributor } from './embedded-agent';

const ctx = { baseDirectives: {} } as CspResolutionContext;
const config = { enabled: true, scrt2Url: 'https://scrt2.example.com', orgId: '00D123', esDeveloperName: 'Agent' };

describe('embedded widget CDN CSP', () => {
    test.each([undefined, { ...config, enabled: false }])('does not widen CSP when disabled or absent', (value) => {
        const contributor = createEmbeddedAgentCspContributor(value);
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });

    test('permits the selected CDN release and SCRT2 connection', () => {
        const contributor = createEmbeddedAgentCspContributor({ ...config, cc_embeddedWidgetCdnVersion: '0.1.1' });
        expect(contributor.isActive(ctx)).toBe(true);
        expect(contributor.contribute(ctx)).toEqual({
            'script-src': ['https://cdn.search.cimulate.ai'],
            'connect-src': ['https://scrt2.example.com', 'https://cdn.search.cimulate.ai'],
            'frame-src': ['https://scrt2.example.com'],
        });
    });

    test('does not add a rejected override origin to CSP', () => {
        const contributor = createEmbeddedAgentCspContributor({
            ...config,
            embeddedWidgetSourceUrl: 'https://evil.example/widget.js',
        });
        expect(contributor.contribute(ctx)['script-src']).toEqual(['https://cdn.search.cimulate.ai']);
    });

    test('ignores the removed alias instead of widening CSP', () => {
        const legacyConfig = { ...config, scriptSourceUrl: 'https://a.sfcc-store-internal.net/widget.js' };
        const contributor = createEmbeddedAgentCspContributor(legacyConfig);
        expect(contributor.contribute(ctx)['script-src']).toEqual(['https://cdn.search.cimulate.ai']);
    });
});
