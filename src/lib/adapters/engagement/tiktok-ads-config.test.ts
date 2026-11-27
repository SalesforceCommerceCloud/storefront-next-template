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
import { validateTikTokAdsConfig, type TikTokAdsClientConfig } from './tiktok-ads-config';

const validConfig: TikTokAdsClientConfig = {
    pixelId: 'C0000000000000000000',
    consentCategory: 'marketing',
    eventToggles: {} as TikTokAdsClientConfig['eventToggles'],
};

describe('validateTikTokAdsConfig', () => {
    it('accepts a fully populated config', () => {
        expect(validateTikTokAdsConfig(validConfig)).toEqual({ valid: true, errors: [] });
    });

    it('reports error when pixelId is empty', () => {
        const result = validateTikTokAdsConfig({ ...validConfig, pixelId: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: pixelId');
    });

    it('reports error when pixelId is whitespace-only', () => {
        const result = validateTikTokAdsConfig({ ...validConfig, pixelId: '   \t\n' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: pixelId');
    });

    it('reports error when pixelId is undefined', () => {
        const partial: Partial<TikTokAdsClientConfig> = { ...validConfig };
        delete partial.pixelId;
        const result = validateTikTokAdsConfig(partial);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: pixelId');
    });

    it('accepts pixelId with surrounding whitespace (trimmed non-blank)', () => {
        const result = validateTikTokAdsConfig({
            ...validConfig,
            pixelId: '  C0000000000000000000  ',
        });
        expect(result).toEqual({ valid: true, errors: [] });
    });
});
