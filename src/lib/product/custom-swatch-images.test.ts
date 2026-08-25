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
import { getCustomSwatchImageUrl, parseCustomSwatchImages, resolveCustomSwatchImagePath } from './custom-swatch-images';

describe('parseCustomSwatchImages', () => {
    it('parses a JSON string map', () => {
        const raw = '{"size":{"loveseat":"images/products/size-loveseat.webp"}}';
        expect(parseCustomSwatchImages(raw)).toEqual({ size: { loveseat: 'images/products/size-loveseat.webp' } });
    });

    it('accepts an already-parsed object', () => {
        const obj = { legStyle: { tapered: 'images/products/leg-tapered.webp' } };
        expect(parseCustomSwatchImages(obj)).toEqual(obj);
    });

    it('returns undefined for malformed JSON, arrays, and empty/absent input', () => {
        expect(parseCustomSwatchImages('{not json')).toBeUndefined();
        expect(parseCustomSwatchImages('[1,2,3]')).toBeUndefined();
        expect(parseCustomSwatchImages(undefined)).toBeUndefined();
        expect(parseCustomSwatchImages('')).toBeUndefined();
        expect(parseCustomSwatchImages(42)).toBeUndefined();
    });

    it('drops axes whose value is not a string-valued map, keeping valid ones', () => {
        // A whole map is malformed when no axis survives validation.
        expect(parseCustomSwatchImages('{"size":"bad"}')).toBeUndefined();
        expect(parseCustomSwatchImages({ size: ['a'] })).toBeUndefined();
        expect(parseCustomSwatchImages({ size: { loveseat: 123 } })).toBeUndefined();
        // A malformed axis is dropped; a well-formed sibling axis is retained.
        expect(
            parseCustomSwatchImages({ size: 'bad', legStyle: { tapered: 'images/products/leg-tapered.webp' } })
        ).toEqual({ legStyle: { tapered: 'images/products/leg-tapered.webp' } });
    });

    it('rejects prototype-polluting axis ids without mutating Object.prototype', () => {
        // A "__proto__" axis in merchant JSON must not walk the prototype setter. A valid sibling axis
        // keeps the map from being discarded, so the dangerous key would otherwise slip through.
        const result = parseCustomSwatchImages(
            '{"__proto__":{"polluted":"x"},"legStyle":{"tapered":"images/products/leg-tapered.webp"}}'
        );
        expect(result).toEqual({ legStyle: { tapered: 'images/products/leg-tapered.webp' } });
        // The prototype chain is untouched — no attacker-controlled inherited property leaked through.
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('drops constructor / prototype axis ids', () => {
        expect(parseCustomSwatchImages({ constructor: { a: 'x' }, prototype: { b: 'y' } })).toBeUndefined();
    });
});

describe('resolveCustomSwatchImagePath', () => {
    it('maps a bare catalog path to a public-overlay URL by basename', () => {
        expect(resolveCustomSwatchImagePath('images/products/size-loveseat.webp')).toBe('/images/size-loveseat.webp');
        expect(resolveCustomSwatchImagePath('leg-tapered.webp')).toBe('/images/leg-tapered.webp');
    });

    it('passes through root-absolute and full URLs unchanged', () => {
        expect(resolveCustomSwatchImagePath('/images/size-loveseat.webp')).toBe('/images/size-loveseat.webp');
        expect(resolveCustomSwatchImagePath('https://cdn.example.com/x.webp')).toBe('https://cdn.example.com/x.webp');
    });

    it('returns undefined for empty / non-string input', () => {
        expect(resolveCustomSwatchImagePath(undefined)).toBeUndefined();
        expect(resolveCustomSwatchImagePath('   ')).toBeUndefined();
        expect(resolveCustomSwatchImagePath(123)).toBeUndefined();
    });
});

describe('getCustomSwatchImageUrl', () => {
    const map = {
        size: { loveseat: 'images/products/size-loveseat.webp', sectional: 'images/products/size-sectional.webp' },
        legStyle: { tapered: 'images/products/leg-tapered.webp' },
    };

    it('resolves an axis + value to a public-overlay URL', () => {
        expect(getCustomSwatchImageUrl(map, 'size', 'loveseat')).toBe('/images/size-loveseat.webp');
        expect(getCustomSwatchImageUrl(map, 'legStyle', 'tapered')).toBe('/images/leg-tapered.webp');
    });

    it('returns undefined for unknown axis/value or absent map', () => {
        expect(getCustomSwatchImageUrl(map, 'size', 'nope')).toBeUndefined();
        expect(getCustomSwatchImageUrl(map, 'color', 'red')).toBeUndefined();
        expect(getCustomSwatchImageUrl(undefined, 'size', 'loveseat')).toBeUndefined();
    });

    it('does not index into a stray string axis for a numeric-like value (parse → lookup)', () => {
        // The production path always feeds getCustomSwatchImageUrl a map from parseCustomSwatchImages.
        // A malformed axis mapped to a string is dropped at parse time, so a single-digit numeric value
        // can never char-index into it (guards against "bad"["0"] === "b" → "/images/b").
        const parsed = parseCustomSwatchImages('{"size":"bad"}');
        expect(getCustomSwatchImageUrl(parsed, 'size', '0')).toBeUndefined();
    });
});
