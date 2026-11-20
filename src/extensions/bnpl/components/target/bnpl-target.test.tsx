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
import { act, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import BnplTarget from './bnpl-target';
import { BnplProvider } from '@/extensions/bnpl/context/bnpl-context';
import { getBuyNowPayLaterMessage, getBuyNowPayLaterLearnMore } from '@/extensions/bnpl/lib/api/bnpl.server';
import ProductViewProvider from '@/providers/product-view';
import type { ShopperProducts } from '@/scapi';

// Keep the real product context so missing-provider coverage cannot be masked by a hook mock.
vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: ({ currentVariant }: { currentVariant?: ShopperProducts.schemas['Variant'] }) => ({
        currentVariant,
    }),
}));
vi.mock('@/hooks/product/use-current-variant', () => ({ useCurrentVariant: () => undefined }));
vi.mock('@/hooks/product/use-selected-variations', () => ({ useSelectedVariations: () => ({}) }));
vi.mock('@/extensions/bnpl/components/buy-now-pay-later', () => ({
    default: () => <span>Installment offer</span>,
}));

async function renderOffer(
    product: ShopperProducts.schemas['Product'],
    currentVariant?: ShopperProducts.schemas['Variant']
) {
    const messagePromise = getBuyNowPayLaterMessage();
    const learnMorePromise = getBuyNowPayLaterLearnMore();
    await act(async () => {
        render(
            <ProductViewProvider product={product} currentVariant={currentVariant}>
                <BnplProvider messagePromise={messagePromise} learnMorePromise={learnMorePromise}>
                    <BnplTarget />
                </BnplProvider>
            </ProductViewProvider>
        );
        await Promise.all([messagePromise, learnMorePromise]);
    });
}

describe('BNPL qualified-price presentation', () => {
    test('renders nothing without either optional provider', () => {
        const { container } = render(<BnplTarget />);
        expect(container).toBeEmptyDOMElement();
    });

    test('renders nothing when BNPL is configured outside a product view', () => {
        const { container } = render(
            <BnplProvider messagePromise={getBuyNowPayLaterMessage()} learnMorePromise={getBuyNowPayLaterLearnMore()}>
                <BnplTarget />
            </BnplProvider>
        );
        expect(container).toBeEmptyDOMElement();
    });

    test('renders nothing in a product view without BNPL configuration', () => {
        const { container } = render(
            <ProductViewProvider product={{ id: 'priced', price: 49 }}>
                <BnplTarget />
            </ProductViewProvider>
        );
        expect(container).toBeEmptyDOMElement();
    });

    test('does not display an installment amount for an unpriced product', async () => {
        await renderOffer({ id: 'unpriced', type: { item: true } });
        expect(screen.queryByText('Installment offer')).not.toBeInTheDocument();
    });

    test('does not inherit a master price for an unpriced selected SKU', async () => {
        await renderOffer({ id: 'master', type: { master: true }, price: 49 }, { productId: 'unpriced-sku' });
        expect(screen.queryByText('Installment offer')).not.toBeInTheDocument();
    });

    test('suppresses installment messaging for a consultation product with a placeholder amount', async () => {
        await renderOffer({ id: 'consultation', price: 100, c_priceOnRequest: true });
        expect(screen.queryByText('Installment offer')).not.toBeInTheDocument();
    });

    test('retains provider messaging for a natively priced selection', async () => {
        await renderOffer({ id: 'master', type: { master: true } }, { productId: 'priced-sku', price: 49 });
        expect(screen.getByText('Installment offer')).toBeInTheDocument();
    });
});
