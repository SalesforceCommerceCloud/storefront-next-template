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
import { HeroMetadata } from './index';

describe('HeroMetadata - PD default alignment', () => {
    const metadata = getAttributeDefinitions(HeroMetadata.prototype);

    test('title has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.title?.defaultValue).toBeUndefined();
    });

    test('titleTypography defaults to Default', () => {
        expect(metadata.fields.titleTypography?.defaultValue).toBe('Default');
    });

    test('titleColor has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.titleColor?.defaultValue).toBeUndefined();
    });

    test('imageUrl has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.imageUrl?.defaultValue).toBeUndefined();
    });

    test('imageAlt has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.imageAlt?.defaultValue).toBeUndefined();
    });

    test('imageTitle has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.imageTitle?.defaultValue).toBeUndefined();
    });

    test('subtitle has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.subtitle?.defaultValue).toBeUndefined();
    });

    test('subtitleTypography defaults to Default', () => {
        expect(metadata.fields.subtitleTypography?.defaultValue).toBe('Default');
    });

    test('subtitleColor has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.subtitleColor?.defaultValue).toBeUndefined();
    });

    test('ctaText has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.ctaText?.defaultValue).toBeUndefined();
    });

    test('ctaLink has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.ctaLink?.defaultValue).toBeUndefined();
    });

    test('buttonStyle defaults to Primary', () => {
        expect(metadata.fields.buttonStyle?.defaultValue).toBe('Primary');
    });

    test('overlay defaults to None', () => {
        expect(metadata.fields.overlay?.defaultValue).toBe('None');
    });

    test('overlay exposes None/Light/Dark values', () => {
        expect(metadata.fields.overlay?.values).toEqual(['None', 'Light', 'Dark']);
    });

    test('styleOverride has no defaultValue (matches empty JSON metadata)', () => {
        expect(metadata.fields.styleOverride?.defaultValue).toBeUndefined();
    });
});
