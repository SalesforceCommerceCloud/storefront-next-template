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
import { describe, expect, test, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShopperProducts } from '@/scapi';
import type { SectionContent } from '@/components/html-fragment/types';
import PdpCollapsiblesTarget from '@/extensions/product-content/components/target/pdp-collapsibles-target';
import { ProductContentDataProvider } from '@/extensions/product-content/context/product-content-data-context';
import { resolvePdpSections } from '@/extensions/product-content/lib/pdp-sections';
import { mockConfig } from '@/test-utils/config';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: () => mockConfig }));

function target(product: ShopperProducts.schemas['Product'], contents: Promise<Array<SectionContent | null>>) {
    return (
        <ProductContentDataProvider product={product} pdpCollapsiblesPromise={contents}>
            <PdpCollapsiblesTarget />
        </ProductContentDataProvider>
    );
}

function resolveContents(product: ShopperProducts.schemas['Product']) {
    return Promise.all(
        resolvePdpSections(product).map((section) => {
            if (!('resolve' in section)) throw new Error('expected product resolver');
            return section.resolve(product);
        })
    );
}

describe('fashion PDP collapsibles target', () => {
    test('renders nothing for empty product content, including no fallback accordion', () => {
        const { container } = render(target({ id: 'empty' }, Promise.resolve([])));
        expect(container).toBeEmptyDOMElement();
    });

    test('aligns partial content with headings and updates when the product changes', async () => {
        const product = { id: 'first', c_careInstructions: 'Wash cold', c_specifications: 'Long sleeves' };
        const contents = resolveContents(product);
        const view = render(target(product, contents));
        await act(async () => {
            await contents;
        });
        const care = await screen.findByText('Care Instructions');
        const specs = screen.getByText('Specifications');
        expect(screen.queryByText('Materials')).not.toBeInTheDocument();
        expect(screen.queryByText('Usage Instructions')).not.toBeInTheDocument();
        const user = userEvent.setup();
        await user.click(care);
        await user.click(specs);
        await screen.findByText('Wash cold');
        const carePanel = screen.getByText('Care Instructions').closest('details');
        const specsPanel = screen.getByText('Specifications').closest('details');
        if (!carePanel || !specsPanel) throw new Error('Expected care and specifications panels');
        expect(await within(carePanel).findByText('Wash cold')).toBeInTheDocument();
        expect(await within(specsPanel).findByText('Long sleeves')).toBeInTheDocument();
        expect(within(carePanel).queryByText('Long sleeves')).not.toBeInTheDocument();

        const changed = { id: 'second', c_materials: 'Silk <blend>' };
        const changedContents = resolveContents(changed);
        view.rerender(target(changed, changedContents));
        await act(async () => {
            await changedContents;
        });
        const materials = await screen.findByText('Materials');
        await user.click(materials);
        expect(await screen.findByText('Silk <blend>')).toBeInTheDocument();
        expect(screen.queryByText('Care Instructions')).not.toBeInTheDocument();
        expect(screen.queryByText('Specifications')).not.toBeInTheDocument();
        expect(screen.queryByText('Wash cold')).not.toBeInTheDocument();
        view.rerender(target({ id: 'empty' }, Promise.resolve([])));
        expect(view.container).toBeEmptyDOMElement();
    });
});
