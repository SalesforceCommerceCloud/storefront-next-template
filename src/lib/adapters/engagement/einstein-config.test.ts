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
import { validateEinsteinConfig, type EinsteinConfig } from './einstein-config';

const validConfig: EinsteinConfig = {
    enabled: true,
    host: 'https://api.cquotient.com',
    einsteinId: 'test-einstein-id',
    siteId: 'siteId',
    realm: 'realm',
    isProduction: false,
    eventToggles: {} as EinsteinConfig['eventToggles'],
};

describe('validateEinsteinConfig', () => {
    it('accepts a fully populated config', () => {
        expect(validateEinsteinConfig(validConfig)).toEqual({ valid: true, errors: [] });
    });

    it.each([
        'host',
        'einsteinId',
        'siteId',
        'realm',
    ] as const)('reports a missing field error when %s is empty', (field) => {
        const result = validateEinsteinConfig({ ...validConfig, [field]: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`Missing required field: ${field}`);
    });

    it.each([
        'host',
        'einsteinId',
        'siteId',
        'realm',
    ] as const)('reports a missing field error when %s is whitespace-only', (field) => {
        const result = validateEinsteinConfig({ ...validConfig, [field]: '   \t\n' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`Missing required field: ${field}`);
    });

    it.each([
        'host',
        'einsteinId',
        'siteId',
        'realm',
    ] as const)('reports a missing field error when %s is undefined', (field) => {
        const partial: Partial<EinsteinConfig> = { ...validConfig };
        delete partial[field];
        const result = validateEinsteinConfig(partial);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`Missing required field: ${field}`);
    });

    it('accumulates errors for multiple invalid fields', () => {
        const result = validateEinsteinConfig({ ...validConfig, host: '', einsteinId: '   ', siteId: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
            'Missing required field: host',
            'Missing required field: einsteinId',
            'Missing required field: siteId',
        ]);
    });

    it('accepts values with surrounding whitespace as long as they contain non-whitespace', () => {
        const result = validateEinsteinConfig({
            ...validConfig,
            host: '  https://api.cquotient.com  ',
            einsteinId: '  test-einstein-id  ',
            siteId: '  siteId  ',
            realm: '  realm  ',
        });
        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('does not validate eventToggles (analytics-adapter-only concern)', () => {
        const partial: Partial<EinsteinConfig> = { ...validConfig };
        delete partial.eventToggles;
        const result = validateEinsteinConfig(partial);
        expect(result).toEqual({ valid: true, errors: [] });
    });
});
