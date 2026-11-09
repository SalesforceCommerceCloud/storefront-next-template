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
import type { ShopperProducts } from '@/scapi';
import { resolvePdpSections } from '@/extensions/product-content/lib/pdp-sections';

const asProduct = (attributes: Record<string, unknown>) =>
    ({ id: 'fashion', ...attributes }) as ShopperProducts.schemas['Product'];
const fields = ['c_materials', 'c_careInstructions', 'c_specifications'] as const;
const labels = ['materials', 'careInstructions', 'specifications'];

describe('fashion resolvePdpSections', () => {
    test('selects only product-backed sections in stable order without Usage', () => {
        const sections = resolvePdpSections(asProduct(Object.fromEntries(fields.map((field) => [field, 'Content']))));
        expect(sections.map((section) => section.labelKey)).toEqual(labels);
        expect(sections.every((section) => 'resolve' in section && !('apiMethod' in section))).toBe(true);
    });

    test.each(
        [undefined, null, '', ' \t\r\n ', 42, false, [], ['Cotton'], {}, { html: 'Cotton' }].map((value) => [value])
    )('omits absent, blank and malformed attributes: %j', (value) => {
        expect(resolvePdpSections(asProduct(Object.fromEntries(fields.map((field) => [field, value]))))).toEqual([]);
    });

    test.each(fields)('selects only the populated field %s synchronously', (field) => {
        const sections = resolvePdpSections(asProduct({ [field]: 'Value' }));
        expect(sections).not.toBeInstanceOf(Promise);
        expect(sections.map((section) => section.labelKey)).toEqual([labels[fields.indexOf(field)]]);
    });

    test('renders Materials as escaped plain text, not markup or a list', async () => {
        const product = asProduct({ c_materials: '  Cotton & <b>linen</b> "blend"\'s\nWool  ' });
        const [section] = resolvePdpSections(product);
        if (!('resolve' in section)) throw new Error('expected product resolver');
        await expect(section.resolve(product)).resolves.toEqual({
            contentType: 'plain-text',
            html: 'Cotton &amp; &lt;b&gt;linen&lt;/b&gt; &quot;blend&quot;&#39;s\nWool',
        });
    });

    test.each([
        'c_careInstructions',
        'c_specifications',
    ])('renders each nonblank LF/CRLF line of %s as an escaped bullet', async (field) => {
        const product = asProduct({ [field]: '\r\n Wash & dry \r\n \t\r\n <script>"don\'t"</script>\n Last line \n' });
        const [section] = resolvePdpSections(product);
        if (!('resolve' in section)) throw new Error('expected product resolver');
        await expect(section.resolve(product)).resolves.toEqual({
            contentType: 'bulleted-list',
            html: '<ul><li>Wash &amp; dry</li><li>&lt;script&gt;&quot;don&#39;t&quot;&lt;/script&gt;</li><li>Last line</li></ul>',
        });
    });

    test.each([
        'c_careInstructions',
        'c_specifications',
    ])('renders even a single line of %s as a bullet', async (field) => {
        const product = asProduct({ [field]: ' One item ' });
        const [section] = resolvePdpSections(product);
        if (!('resolve' in section)) throw new Error('expected product resolver');
        await expect(section.resolve(product)).resolves.toEqual({
            contentType: 'bulleted-list',
            html: '<ul><li>One item</li></ul>',
        });
    });

    test('resolvers read the supplied product rather than captured selection values', async () => {
        const selected = asProduct(Object.fromEntries(fields.map((field) => [field, 'Original'])));
        const changed = asProduct({ c_materials: 'Silk', c_careInstructions: 'Dry clean' });
        const sections = resolvePdpSections(selected);
        const contents = await Promise.all(
            sections.map((section) => {
                if (!('resolve' in section)) throw new Error('expected product resolver');
                return section.resolve(changed);
            })
        );
        expect(contents).toEqual([
            { contentType: 'plain-text', html: 'Silk' },
            { contentType: 'bulleted-list', html: '<ul><li>Dry clean</li></ul>' },
            null,
        ]);
        expect(resolvePdpSections(changed).map((section) => section.labelKey)).toEqual(labels.slice(0, 2));
    });

    test.each(
        [undefined, {}, ['Value'], ' \r\n '].map((value) => [value])
    )('returns null if selected attributes become invalid: %j', async (value) => {
        const sections = resolvePdpSections(asProduct(Object.fromEntries(fields.map((field) => [field, 'Original']))));
        const changed = asProduct(Object.fromEntries(fields.map((field) => [field, value])));
        for (const section of sections) {
            if (!('resolve' in section)) throw new Error('expected product resolver');
            await expect(section.resolve(changed)).resolves.toBeNull();
        }
    });
});
