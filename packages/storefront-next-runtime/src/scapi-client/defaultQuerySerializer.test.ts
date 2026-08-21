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
import { defaultQuerySerializer } from './defaultQuerySerializer';

describe('defaultQuerySerializer', () => {
    describe('basic query serialization', () => {
        it('should serialize simple string parameter', () => {
            const result = defaultQuerySerializer({ q: 'shoes' });
            expect(result).toBe('q=shoes');
        });

        it('should serialize multiple simple parameters', () => {
            const result = defaultQuerySerializer({ q: 'shoes', limit: 10, offset: 0 });
            expect(result).toBe('q=shoes&limit=10&offset=0');
        });

        it('should skip undefined values', () => {
            const result = defaultQuerySerializer({ q: 'shoes', filter: undefined });
            expect(result).toBe('q=shoes');
        });

        it('should skip null values', () => {
            const result = defaultQuerySerializer({ q: 'shoes', filter: null });
            expect(result).toBe('q=shoes');
        });

        it('should return empty string for empty object', () => {
            const result = defaultQuerySerializer({});
            expect(result).toBe('');
        });

        it('should handle non-object input', () => {
            expect(defaultQuerySerializer(null as any)).toBe('');
            expect(defaultQuerySerializer(undefined as any)).toBe('');
            expect(defaultQuerySerializer('string' as any)).toBe('');
            expect(defaultQuerySerializer(123 as any)).toBe('');
        });
    });

    describe('array serialization (comma-separated format)', () => {
        it('should serialize arrays with comma-separated format by default', () => {
            const result = defaultQuerySerializer({ expand: ['promotions', 'variations', 'prices'] });
            expect(result).toBe('expand=promotions,variations,prices');
        });

        it('should serialize multiple array parameters with comma-separated format', () => {
            const result = defaultQuerySerializer({
                expand: ['promotions', 'prices'],
                select: ['id', 'name', 'price'],
            });
            expect(result).toBe('expand=promotions,prices&select=id,name,price');
        });

        it('should handle single-element arrays', () => {
            const result = defaultQuerySerializer({ expand: ['promotions'] });
            expect(result).toBe('expand=promotions');
        });

        it('should handle empty arrays', () => {
            const result = defaultQuerySerializer({ expand: [] });
            // Empty arrays are filtered out by the serializer
            expect(result).toBe('');
        });
    });

    describe('exploded parameters (refine)', () => {
        it('should serialize refine parameter with explode format', () => {
            const result = defaultQuerySerializer({ refine: ['price=(0..10)', 'c_refinementColor=green'] });
            // Refine parameters use exploded format (multiple query params with same name)
            expect(result).toContain('refine=price%3D(0..10)');
            expect(result).toContain('refine=c_refinementColor%3Dgreen');
            expect(result.split('&').length).toBe(2);
        });

        it('should handle single refine value', () => {
            const result = defaultQuerySerializer({ refine: ['price=(0..10)'] });
            expect(result).toBe('refine=price%3D(0..10)');
        });

        it('should handle empty refine array', () => {
            const result = defaultQuerySerializer({ refine: [] });
            // Empty arrays are filtered out
            expect(result).toBe('');
        });

        it('should not explode non-refine arrays', () => {
            const result = defaultQuerySerializer({
                expand: ['promotions', 'prices'],
                refine: ['price=(0..10)'],
            });
            expect(result).toBe('expand=promotions,prices&refine=price%3D(0..10)');
        });
    });

    describe('grouped parameters (refine with attribute grouping)', () => {
        it('should group refine values by attribute ID', () => {
            const result = defaultQuerySerializer({
                refine: ['c_color=Black', 'c_color=Green', 'price=(0..20)'],
            });
            // Values with same attribute ID should be grouped with pipe separator
            expect(result).toContain('refine=c_color%3DBlack%7CGreen');
            expect(result).toContain('refine=price%3D(0..20)');
        });

        it('should group multiple attributes correctly', () => {
            const result = defaultQuerySerializer({
                refine: ['c_color=Black', 'c_size=M', 'c_color=Green', 'c_size=L', 'price=(0..20)'],
            });
            expect(result).toContain('refine=c_color%3DBlack%7CGreen');
            expect(result).toContain('refine=c_size%3DM%7CL');
            expect(result).toContain('refine=price%3D(0..20)');
        });

        it('should preserve order of first occurrence when grouping', () => {
            const result = defaultQuerySerializer({
                refine: ['price=(0..20)', 'c_color=Black', 'c_color=Green'],
            });
            // price should appear before c_color since it was first
            const priceIndex = result.indexOf('refine=price%3D');
            const colorIndex = result.indexOf('refine=c_color%3D');
            expect(priceIndex).toBeLessThan(colorIndex);
        });

        it('should handle refine values without separator', () => {
            const result = defaultQuerySerializer({
                refine: ['c_color=Black', 'noSeparator', 'c_size=M'],
            });
            // Item without separator should be skipped
            expect(result).toContain('refine=c_color%3DBlack');
            expect(result).toContain('refine=c_size%3DM');
            expect(result).not.toContain('noSeparator');
        });

        it('should handle refine values with empty attribute value', () => {
            const result = defaultQuerySerializer({
                refine: ['c_color=', 'c_size=M'],
            });
            expect(result).toContain('refine=c_color%3D');
            expect(result).toContain('refine=c_size%3DM');
        });

        it('should handle refine values with multiple equals signs', () => {
            const result = defaultQuerySerializer({
                refine: ['c_formula=E=mc^2', 'c_color=Black'],
            });
            // Should split on first equals only
            expect(result).toContain('refine=c_formula%3DE%3Dmc%5E2');
            expect(result).toContain('refine=c_color%3DBlack');
        });
    });

    describe('combined scenarios', () => {
        it('should handle mixed parameter types', () => {
            const result = defaultQuerySerializer({
                q: 'shoes',
                expand: ['promotions', 'prices'],
                refine: ['c_color=Black', 'c_color=Green', 'price=(0..50)'],
                limit: 20,
            });
            expect(result).toContain('q=shoes');
            expect(result).toContain('expand=promotions,prices');
            expect(result).toContain('refine=c_color%3DBlack%7CGreen');
            expect(result).toContain('refine=price%3D(0..50)');
            expect(result).toContain('limit=20');
        });

        it('should handle complex e-commerce search query', () => {
            const result = defaultQuerySerializer({
                q: 'mens shoes',
                refine: ['c_color=Black', 'c_color=Brown', 'c_size=10', 'c_size=11', 'price=(50..150)'],
                expand: ['availability', 'images', 'prices'],
                limit: 25,
                offset: 0,
                sort: 'price-high-to-low',
            });

            expect(result).toContain('q=mens%20shoes');
            expect(result).toContain('refine=c_color%3DBlack%7CBrown');
            expect(result).toContain('refine=c_size%3D10%7C11');
            expect(result).toContain('refine=price%3D(50..150)');
            expect(result).toContain('expand=availability,images,prices');
            expect(result).toContain('limit=25');
            expect(result).toContain('offset=0');
            expect(result).toContain('sort=price-high-to-low');
        });

        it('should handle only undefined and null values', () => {
            const result = defaultQuerySerializer({
                filter: undefined,
                query: null,
            });
            expect(result).toBe('');
        });
    });

    describe('SCAPI reserved characters (comma, percent) in id values', () => {
        // https://developer.salesforce.com/docs/commerce/commerce-api/guide/url-encode.html
        // SCAPI decodes a comma-joined id list once, then splits on comma, then decodes each id.
        // A comma or percent belonging to an id's value must therefore be double-encoded so it
        // survives that first decode without being read as the list separator.
        it('should double-encode a comma inside an id, keeping the list separator single-encoded', () => {
            const result = defaultQuerySerializer({ ids: ['Flour,1KG', 'Sugar'] });
            expect(result).toBe('ids=Flour%252C1KG,Sugar');
        });

        it('should double-encode a percent inside an id', () => {
            const result = defaultQuerySerializer({ ids: ['1%Milk', 'Sugar'] });
            expect(result).toBe('ids=1%2525Milk,Sugar');
        });

        it('should double-encode both reserved chars across a multi-id list', () => {
            const result = defaultQuerySerializer({ ids: ['Flour,1KG', '1%Milk'] });
            expect(result).toBe('ids=Flour%252C1KG,1%2525Milk');
        });

        it('should round-trip through SCAPI decode-then-split back to the original ids', () => {
            const wire = defaultQuerySerializer({ ids: ['Flour,1KG', '1%Milk'] }).replace('ids=', '');
            // Model SCAPI: URL-decode once, split on comma, URL-decode each id.
            const decoded = decodeURIComponent(wire)
                .split(',')
                .map((id) => decodeURIComponent(id));
            expect(decoded).toEqual(['Flour,1KG', '1%Milk']);
        });

        it('should leave plain comma-joined tokens single-encoded (comma is the separator)', () => {
            const result = defaultQuerySerializer({ expand: ['promotions', 'variations', 'prices'] });
            expect(result).toBe('expand=promotions,variations,prices');
        });
    });

    describe('special characters and encoding', () => {
        it('should properly encode special characters in query values', () => {
            const result = defaultQuerySerializer({
                q: 'shoes & boots',
            });
            expect(result).toContain('shoes%20%26%20boots');
        });

        it('should properly encode equals signs and special chars in refine values', () => {
            const result = defaultQuerySerializer({
                refine: ['price=(0..100)'],
            });
            // Equals signs are encoded, but parentheses may not be depending on serializer
            expect(result).toContain('refine=price%3D');
            expect(result).toContain('0..100');
        });

        it('should properly encode pipe character in grouped refine values', () => {
            const result = defaultQuerySerializer({
                refine: ['c_color=Black', 'c_color=Green'],
            });
            expect(result).toContain('Black%7CGreen');
        });
    });

    describe('edge cases', () => {
        it('should handle boolean values', () => {
            const result = defaultQuerySerializer({
                allImages: true,
                includeVariants: false,
            });
            expect(result).toBe('allImages=true&includeVariants=false');
        });

        it('should handle numeric values', () => {
            const result = defaultQuerySerializer({
                limit: 20,
                offset: 0,
                timeout: 5000,
            });
            expect(result).toBe('limit=20&offset=0&timeout=5000');
        });

        it('should handle zero values', () => {
            const result = defaultQuerySerializer({
                offset: 0,
                count: 0,
            });
            expect(result).toBe('offset=0&count=0');
        });

        it('should handle empty string values', () => {
            const result = defaultQuerySerializer({
                q: '',
                filter: 'active',
            });
            expect(result).toBe('q=&filter=active');
        });

        it('should handle array with non-string values', () => {
            const result = defaultQuerySerializer({
                ids: [1, 2, 3],
            });
            expect(result).toBe('ids=1,2,3');
        });

        it('should handle refine as non-array value', () => {
            const result = defaultQuerySerializer({
                refine: 'price=(0..100)',
            });
            // Should still serialize without grouping
            expect(result).toContain('refine=price%3D');
            expect(result).toContain('0..100');
        });
    });
});
