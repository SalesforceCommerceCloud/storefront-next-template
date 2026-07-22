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
import { describe, test, expect } from 'vitest';
import 'reflect-metadata';
import { getAttributeDefinitions } from '@/lib/decorators/attribute-definition';
import { ContentCardMetadata } from './index';
import { CONTENT_CARD_TYPOGRAPHY_VALUES, normalizeTypography } from './typography';

describe('ContentCardMetadata - PD default alignment', () => {
    test('showBackground has defaultValue: true matching React component default', () => {
        const metadata = getAttributeDefinitions(ContentCardMetadata.prototype);
        expect(metadata.fields.showBackground).toBeDefined();
        expect(metadata.fields.showBackground?.defaultValue).toBe(true);
    });

    test('showBorder has defaultValue: true matching React component default', () => {
        const metadata = getAttributeDefinitions(ContentCardMetadata.prototype);
        expect(metadata.fields.showBorder).toBeDefined();
        expect(metadata.fields.showBorder?.defaultValue).toBe(true);
    });

    test('titleTypography defaults to Default, preserving the original hardcoded look', () => {
        const metadata = getAttributeDefinitions(ContentCardMetadata.prototype);
        expect(metadata.fields.titleTypography).toBeDefined();
        expect(metadata.fields.titleTypography?.type).toBe('enum');
        expect(metadata.fields.titleTypography?.defaultValue).toBe('Default');
        // Lock the enum options to the shared const so a drift in
        // CONTENT_CARD_TYPOGRAPHY_VALUES can't slip past type/defaultValue checks.
        expect(metadata.fields.titleTypography?.values).toEqual([...CONTENT_CARD_TYPOGRAPHY_VALUES]);
    });

    test('descriptionTypography defaults to Default, preserving the original hardcoded look', () => {
        const metadata = getAttributeDefinitions(ContentCardMetadata.prototype);
        expect(metadata.fields.descriptionTypography).toBeDefined();
        expect(metadata.fields.descriptionTypography?.type).toBe('enum');
        expect(metadata.fields.descriptionTypography?.defaultValue).toBe('Default');
        expect(metadata.fields.descriptionTypography?.values).toEqual([...CONTENT_CARD_TYPOGRAPHY_VALUES]);
    });
});

describe('normalizeTypography - fallback to Default', () => {
    test('passes through a known preset value', () => {
        expect(normalizeTypography('Heading 2')).toBe('Heading 2');
    });

    test('falls back to Default for undefined, empty, or unknown values', () => {
        expect(normalizeTypography(undefined)).toBe('Default');
        expect(normalizeTypography('')).toBe('Default');
        expect(normalizeTypography('NotAPreset')).toBe('Default');
    });
});
