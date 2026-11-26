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
import { MAX_SEO_DESCRIPTION_LENGTH, resolveSeoDescription, toSeoDescription } from './seo-description.server';

describe('toSeoDescription', () => {
    test('returns undefined for empty input', () => {
        expect(toSeoDescription(undefined)).toBeUndefined();
        expect(toSeoDescription(null)).toBeUndefined();
        expect(toSeoDescription('')).toBeUndefined();
    });

    test('returns undefined when only markup or whitespace remains', () => {
        expect(toSeoDescription('<p> </p><br/>&nbsp;')).toBeUndefined();
    });

    test('keeps plain text unchanged', () => {
        expect(toSeoDescription('A classic glove for men.')).toBe('A classic glove for men.');
    });

    test('strips tags and keeps words separated', () => {
        expect(toSeoDescription('<p>Soft <strong>leather</strong></p><ul><li>Lined</li><li>Warm</li></ul>')).toBe(
            'Soft leather Lined Warm'
        );
    });

    test('drops script, style and comment content', () => {
        expect(toSeoDescription('<style>.a{color:red}</style>Safe<script>alert(1)</script><!-- note --> copy')).toBe(
            'Safe copy'
        );
    });

    test('decodes named and numeric entities', () => {
        expect(toSeoDescription('Tom &amp; Jerry&rsquo;s &#8220;hat&#x201D; &copy;')).toBe('Tom & Jerry’s “hat” ©');
    });

    test('decodes Latin-1 and currency entities', () => {
        expect(toSeoDescription('<p>Caf&eacute; &euro;10 &pound;5 &Uuml;ber&nbsp;cool</p>')).toBe(
            'Café €10 £5 Über cool'
        );
    });

    test('decodes entities with digits in the name', () => {
        expect(toSeoDescription('<p>1&frac12;-inch heel; area 10 m&sup2;</p>')).toBe('1½-inch heel; area 10 m²');
        expect(toSeoDescription('&frac14; &frac34; x&sup1; x&sup3;')).toBe('¼ ¾ x¹ x³');
    });

    test('decodes the full HTML5 named-entity set', () => {
        expect(toSeoDescription('Size &rarr; fit &check; &Oslash;rsted &starf;&starf; &frac58; &NotEqual;')).toBe(
            'Size → fit ✓ Ørsted ★★ ⅝ ≠'
        );
    });

    test('drops noscript and template content', () => {
        expect(toSeoDescription('<noscript>Enable JS</noscript><template><p>Hidden</p></template>Visible')).toBe(
            'Visible'
        );
    });

    test('keeps unknown entities with digits as written', () => {
        expect(toSeoDescription('a &foo2; b')).toBe('a &foo2; b');
    });

    test('keeps a quoted > inside an attribute out of the text', () => {
        expect(toSeoDescription('<span title="Size > 10">Warm coat</span>')).toBe('Warm coat');
        expect(toSeoDescription('<a href=\'x>y\' class="a">Link</a>')).toBe('Link');
        expect(toSeoDescription('<span title="Size > 10"></span>')).toBeUndefined();
    });

    test('leaves a lone < as text', () => {
        expect(toSeoDescription('5 < 10 and 3 <3')).toBe('5 < 10 and 3 <3');
    });

    test('leaves unknown entities as written', () => {
        expect(toSeoDescription('Fish &chips;')).toBe('Fish &chips;');
    });

    test('replaces control characters and collapses whitespace', () => {
        expect(toSeoDescription('Line one\n\n\tLine\u0000two   end')).toBe('Line one Line two end');
    });

    test('truncates long copy at a word boundary with an ellipsis', () => {
        const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
        const result = toSeoDescription(words);
        expect(result).toBeDefined();
        expect(result?.length).toBeLessThanOrEqual(MAX_SEO_DESCRIPTION_LENGTH);
        expect(result?.endsWith('…')).toBe(true);
        expect(words.startsWith(result?.slice(0, -1) ?? '')).toBe(true);
        expect(result?.slice(0, -1).endsWith(' ')).toBe(false);
    });

    test('removes trailing punctuation before the ellipsis', () => {
        const text = `${'a'.repeat(100)}, ${'b'.repeat(100)}`;
        expect(toSeoDescription(text)).toBe(`${'a'.repeat(100)}…`);
    });

    test('hard-cuts a single word longer than the limit', () => {
        const result = toSeoDescription('x'.repeat(300));
        expect(result).toBe(`${'x'.repeat(MAX_SEO_DESCRIPTION_LENGTH - 1)}…`);
    });

    test('stays fast on unterminated markup and oversized input', () => {
        const start = performance.now();
        for (const chunk of ['<a', '<a ', '<script ', '<!--', '<style>']) {
            expect(toSeoDescription(chunk.repeat(100_000))).toBeUndefined();
        }
        expect(performance.now() - start).toBeLessThan(1000);
    });

    test('only reads the start of very long copy', () => {
        expect(toSeoDescription(`<p>Lead copy</p>${'x '.repeat(50_000)}`)).toMatch(/^Lead copy x x/);
    });

    test('does not split surrogate pairs when truncating', () => {
        const result = toSeoDescription('😀'.repeat(200)) ?? '';
        expect(result.endsWith('…')).toBe(true);
        expect(result.slice(0, -1)).toMatch(/^(?:😀)+$/u);
    });

    test('replaces lone surrogate entities', () => {
        expect(toSeoDescription('a&#xD800;b')).toBe('a b');
    });

    test('drops unterminated script, style and comment content', () => {
        expect(toSeoDescription('Buy <script>var x=1;')).toBe('Buy');
        expect(toSeoDescription('Buy <style>.a{}')).toBe('Buy');
        expect(toSeoDescription('Buy <!-- hidden')).toBe('Buy');
        expect(toSeoDescription(`Buy <script>${'a'.repeat(20_000)}</script> more`)).toBe('Buy');
    });

    test('strips doctype, CDATA and processing instructions', () => {
        expect(toSeoDescription('<!DOCTYPE html><?php echo 1; ?>Copy')).toBe('Copy');
    });

    test('drops a tag cut in half by the input cap', () => {
        const result = toSeoDescription(`${'a '.repeat(4990)}<div class="x">tail</div>`);
        expect(result).not.toMatch(/[<>]|div/);
    });

    test('stays within budget on the worst-case shapes under the cap', () => {
        const shapes = [
            `${'<'.repeat(9999)}>${'x'.repeat(10_000)}`,
            `${'<a'.repeat(4999)}>`,
            '<a'.repeat(5000),
            '<a '.repeat(3300),
        ];
        const start = performance.now();
        for (const shape of shapes) toSeoDescription(shape);
        expect(performance.now() - start).toBeLessThan(500);
    });

    test('removes lone surrogates, bidi overrides and zero-width characters', () => {
        expect(toSeoDescription('a\ud800b\u202eb\u200bc')).toBe('a b b c');
    });

    test('never exceeds a non-positive max length', () => {
        expect(toSeoDescription('hello world', 0)).toBe('…');
    });

    test('honors a custom max length', () => {
        expect(toSeoDescription('one two three four', 10)).toBe('one two…');
    });
});

describe('resolveSeoDescription', () => {
    test('accepts a single value', () => {
        expect(resolveSeoDescription('<b>Bold</b> copy')).toBe('Bold copy');
        expect(resolveSeoDescription(undefined)).toBeUndefined();
    });

    test('returns the first candidate with readable text', () => {
        expect(resolveSeoDescription([undefined, '<p></p>', ' ', 'Short description', 'Generated'])).toBe(
            'Short description'
        );
    });

    test('returns undefined when no candidate has readable text', () => {
        expect(resolveSeoDescription([null, '', '<br>'])).toBeUndefined();
    });
});
