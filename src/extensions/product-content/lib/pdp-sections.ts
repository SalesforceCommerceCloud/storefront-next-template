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
import type { ShopperProducts } from '@/scapi';
import type { ParseKeys } from 'i18next';
import type { SectionContent } from '@/components/html-fragment/types';
import type { PdpSectionApiMethod } from '@/extensions/product-content/lib/api/product-content.server';

export type PdpSection =
    | { apiMethod: PdpSectionApiMethod; labelKey: ParseKeys<'product'> }
    | {
          labelKey: ParseKeys<'product'>;
          resolve: (product: ShopperProducts.schemas['Product']) => Promise<SectionContent | null>;
      };

const CONTENT_SECTIONS = [
    { attribute: 'c_materials', labelKey: 'materials' },
    { attribute: 'c_careInstructions', labelKey: 'careInstructions' },
    { attribute: 'c_specifications', labelKey: 'specifications' },
] as const;

function asNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Selects populated fashion Product custom attributes synchronously for SSR and client rendering.
 * Materials is escaped plain text; each nonblank care/specification line is an escaped bullet.
 * Returns & Warranty is unchanged and still uses the extension's mock fixtures.
 */
export function resolvePdpSections(product: ShopperProducts.schemas['Product']): PdpSection[] {
    const sections: PdpSection[] = [];
    for (const { attribute, labelKey } of CONTENT_SECTIONS) {
        if (!asNonEmptyString(product[attribute])) continue;
        sections.push({
            labelKey,
            resolve: (resolvedProduct) => {
                const value = asNonEmptyString(resolvedProduct[attribute]);
                if (!value) return Promise.resolve(null);
                if (attribute === 'c_materials') {
                    return Promise.resolve({ contentType: 'plain-text', html: escapeHtml(value) });
                }
                const lines = value
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                return Promise.resolve({
                    contentType: 'bulleted-list',
                    html: `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
                });
            },
        });
    }
    return sections;
}
