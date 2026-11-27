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
import { createTikTokAdsCspContributor } from './tiktok-ads';

const ctx = { baseDirectives: {} } as CspResolutionContext;

describe('createTikTokAdsCspContributor', () => {
    it('is active and contributes script-src + connect-src when enabled with a pixelId', () => {
        const contributor = createTikTokAdsCspContributor({ enabled: true, pixelId: 'C0000000000000000000' });
        expect(contributor.id).toBe('tiktokAds');
        expect(contributor.isActive(ctx)).toBe(true);
        expect(contributor.contribute(ctx)).toEqual({
            'script-src': ['https://analytics.tiktok.com'],
            'connect-src': ['https://analytics.tiktok.com', 'https://an.tiktok.com'],
            'img-src': ['https://analytics.tiktok.com', 'https://an.tiktok.com'],
        });
    });

    it('passes the runtime CSP validator (no wildcard)', () => {
        const contributor = createTikTokAdsCspContributor({ enabled: true, pixelId: 'C0000000000000000000' });
        expect(() => validateContributors([contributor], {})).not.toThrow();
    });

    it('is inactive when disabled', () => {
        const contributor = createTikTokAdsCspContributor({ enabled: false, pixelId: 'C0000000000000000000' });
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });

    it('is inactive when enabled but pixelId is empty', () => {
        const contributor = createTikTokAdsCspContributor({ enabled: true, pixelId: '' });
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });

    it('is inactive when config is undefined', () => {
        const contributor = createTikTokAdsCspContributor(undefined);
        expect(contributor.isActive(ctx)).toBe(false);
        expect(contributor.contribute(ctx)).toEqual({});
    });
});
