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

// @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
import { expect, test, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { loader } from '@/routes/_app.p.$';
import { resolvePdpSections } from '@/extensions/product-content/lib/pdp-sections';

const { mockFetchProductById, mockFetchPageWithComponentData, mockSectionApi, mockReturnsWarranty } = vi.hoisted(
    () => ({
        mockFetchProductById: vi.fn(),
        mockFetchPageWithComponentData: vi.fn(() => Promise.resolve({ regions: [], componentData: {} })),
        mockSectionApi: {
            getIngredientsData: vi.fn(),
            getUsageInstructions: vi.fn(),
            getCareInstructions: vi.fn(),
            getTechSpecs: vi.fn(),
        },
        mockReturnsWarranty: vi.fn(() => Promise.resolve({})),
    })
);

vi.mock('@/lib/api/products.server', () => ({ fetchProductById: mockFetchProductById }));
vi.mock('@/lib/page-designer/page-loader.server', () => ({
    fetchPageWithComponentData: mockFetchPageWithComponentData,
}));
vi.mock('@/middlewares/auth.server', () => ({ getAuth: () => ({ customerId: null }) }));
vi.mock('@/extensions/product-content/lib/api/product-content.server', () => ({
    pdpSectionApi: mockSectionApi,
    getReturnsAndWarranty: mockReturnsWarranty,
}));
// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
vi.mock('@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server', () => ({
    getInitialDeliveryDestination: () => Promise.resolve(null),
}));
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

test('uses the actual fashion product-backed selector without content requests or a master lookup', async () => {
    const product = {
        id: 'test-product-123',
        name: 'Test Product',
        primaryCategoryId: 'test-category-123',
        shortDescription: 'Test product description',
        longDescription: 'Long test product description',
        master: { masterId: 'master' },
        c_materials: 'Cotton',
        c_careInstructions: 'Wash cold',
        c_specifications: 'Long sleeves',
        c_ingredients: 'Cotton',
    };
    const context = {
        get: (key: unknown) => {
            if (key === appConfigContext) {
                return {
                    commerce: { api: { organizationId: 'test-org', siteId: 'test-site', clientId: 'test-client-id' } },
                    sitePreferences: { productDetailSitePreferences: {} },
                };
            }
            if (key === siteContext) {
                return { currency: 'USD', site: { id: 'test-site' }, locale: { id: 'en-US' } };
            }
            return undefined;
        },
    } as unknown as Readonly<RouterContextProvider>;
    mockFetchProductById.mockResolvedValueOnce(product);
    const request = new Request('https://example.com/p/test-product-123');

    const result = await loader({
        request,
        params: { siteId: 'test-site', localeId: 'en-US', '*': product.id },
        context,
        url: new URL(request.url),
        pattern: '/p/*',
    });

    expect(result.product).toBe(product);
    const contents = await result.pdpCollapsibles;
    expect(contents).toEqual([
        { contentType: 'plain-text', html: 'Cotton' },
        { contentType: 'bulleted-list', html: '<ul><li>Wash cold</li></ul>' },
        { contentType: 'bulleted-list', html: '<ul><li>Long sleeves</li></ul>' },
    ]);
    expect(contents).toHaveLength(resolvePdpSections(product).length);
    for (const method of Object.values(mockSectionApi)) expect(method).not.toHaveBeenCalled();
    expect(mockFetchProductById).toHaveBeenCalledTimes(1);
    expect(mockFetchProductById.mock.calls[0][1]).toBe(product.id);
    expect(mockFetchPageWithComponentData).toHaveBeenCalledTimes(1);
    expect(mockReturnsWarranty).toHaveBeenCalledExactlyOnceWith(product.id);
});
// @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
