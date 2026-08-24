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
 *
 * @vitest-environment jsdom
 */
import 'reflect-metadata';
import { describe, expect, test, vi } from 'vitest';
import { fallback, ProductMerchandisingGridMetadata } from './index';
import ProductMerchandisingGridSkeleton from './skeleton';
import { getAttributeDefinitions } from '@/lib/decorators/attribute-definition';

vi.mock('./skeleton', () => ({
    default: vi.fn(() => 'ProductMerchandisingGridSkeleton'),
}));

describe('product merchandising grid metadata', () => {
    test('defines category and manually curated sources with bounded layout controls', () => {
        const metadata = getAttributeDefinitions(ProductMerchandisingGridMetadata.prototype);

        expect(metadata.fields.title?.defaultValue).toBe('');
        expect(metadata.fields.categoryId?.type).toBe('category');
        expect(metadata.fields.columns?.defaultValue).toBe('4');
        expect(metadata.fields.columns?.values).toEqual(['2', '3', '4']);
        expect(metadata.fields.rows?.defaultValue).toBe(2);
        expect(metadata.fields.limit).toBeUndefined();
    });

    test('exports its layout-matching skeleton as Page Designer fallback', () => {
        expect(fallback).toBe(ProductMerchandisingGridSkeleton);
    });
});
