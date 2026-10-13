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
import { describe, expect, it } from 'vitest';
import {
    createNonPersonalizedResponseMiddleware,
    type NonPersonalizedResponseClassifierInput,
} from './non-personalized-response.server';
import { defaultNonPersonalizedResponseClassifier } from './non-personalized-response-policy.server';

const classifierInput = (
    overrides: Partial<NonPersonalizedResponseClassifierInput> = {}
): NonPersonalizedResponseClassifierInput => ({
    client: 'shopperProducts',
    provenance: 'built-in',
    clientBasePath: '/product/shopper-products/v1',
    schemaPath: '/organizations/{organizationId}/products/{id}',
    method: 'GET',
    destination: 'https://example.com/product/shopper-products/v1',
    request: new Request('https://example.com/product/shopper-products/v1/organizations/org/products/product'),
    siteId: 'RefArch',
    path: {},
    query: {},
    expand: ['images'],
    ...overrides,
});

const representativeReviewedTransports = [
    [
        'shopperAvailability',
        '/product/shopper-availability/v1',
        '/organizations/{organizationId}/availability',
        '/organizations/org/availability',
    ],
    [
        'shopperProducts',
        '/product/shopper-products/v1',
        '/organizations/{organizationId}/categories/{id}',
        '/organizations/org/categories/category',
    ],
    [
        'shopperPromotions',
        '/pricing/shopper-promotions/v1',
        '/organizations/{organizationId}/promotions/campaigns/{campaignId}',
        '/organizations/org/promotions/campaigns/campaign',
    ],
] as const;

const productExpansions = [
    'availability',
    'bundled_products',
    'images',
    'links',
    'options',
    'page_meta_tags',
    'recommendations',
    'set_products',
    'shipping_methods',
    'variations',
] as const;

const productSearchExpansions = [
    'availability',
    'custom_properties',
    'images',
    'page_meta_tags',
    'represented_products',
    'slug',
    'variations',
] as const;

const commonRejectedExpansions = [
    undefined,
    [],
    [''],
    ['prices'],
    ['promotions'],
    ['unknown'],
    ['Images'],
    ['none', 'images'],
    [42],
] as const;

const expansionTransports = [
    {
        label: 'Product detail',
        client: 'shopperProducts',
        clientBasePath: '/product/shopper-products/v1',
        schemaPath: '/organizations/{organizationId}/products/{id}',
        resourcePath: 'products/product',
        allowed: productExpansions,
        rejected: [...commonRejectedExpansions, ['primary_category'], ['images,links']],
    },
    {
        label: 'Product collection',
        client: 'shopperProducts',
        clientBasePath: '/product/shopper-products/v1',
        schemaPath: '/organizations/{organizationId}/products',
        resourcePath: 'products',
        allowed: productExpansions,
        rejected: [...commonRejectedExpansions, ['primary_category'], ['images,links']],
    },
    {
        label: 'Product Search',
        client: 'shopperSearch',
        clientBasePath: '/search/shopper-search/v1',
        schemaPath: '/organizations/{organizationId}/product-search',
        resourcePath: 'product-search',
        allowed: productSearchExpansions,
        rejected: commonRejectedExpansions,
    },
] as const;

const expansionInput = (
    transport: (typeof expansionTransports)[number],
    expand: readonly string[] | undefined
): NonPersonalizedResponseClassifierInput =>
    classifierInput({
        client: transport.client,
        clientBasePath: transport.clientBasePath,
        schemaPath: transport.schemaPath,
        destination: `https://example.com${transport.clientBasePath}`,
        request: new Request(
            `https://example.com${transport.clientBasePath}/organizations/org/${transport.resourcePath}`
        ),
        expand,
    });

const runSerializedExpansion = async (
    transport: (typeof expansionTransports)[number],
    query: string
): Promise<Request> => {
    const request = new Request(
        `https://example.com${transport.clientBasePath}/organizations/org/${transport.resourcePath}?${query}`
    );
    const middleware = createNonPersonalizedResponseMiddleware({
        client: transport.client,
        provenance: 'built-in',
        clientBasePath: transport.clientBasePath,
        expectedBaseUrl: `https://example.com${transport.clientBasePath}`,
        classifier: defaultNonPersonalizedResponseClassifier,
    });
    return (await middleware.onRequest?.({
        request,
        schemaPath: transport.schemaPath,
        params: { path: { organizationId: 'org', id: 'product' } },
        id: 'request-id',
        options: {
            baseUrl: `https://example.com${transport.clientBasePath}`,
            parseAs: 'json',
            querySerializer: () => '',
            bodySerializer: JSON.stringify,
            fetch,
        },
    })) as Request;
};

describe('defaultNonPersonalizedResponseClassifier', () => {
    it.each(
        representativeReviewedTransports
    )('classifies a representative reviewed built-in transport %s %s', (client, clientBasePath, schemaPath, path) => {
        expect(
            defaultNonPersonalizedResponseClassifier(
                classifierInput({
                    client,
                    clientBasePath,
                    schemaPath,
                    destination: `https://example.com${clientBasePath}`,
                    request: new Request(`https://example.com${clientBasePath}${path}`),
                    expand: undefined,
                })
            )
        ).toBe(true);
    });

    it.each([
        [
            'added suffix',
            'https://example.com/product/shopper-products/v1/organizations/org/products/product/promotions',
        ],
        [
            'changed static operation segment',
            'https://example.com/product/shopper-products/v1/organizations/org/categories/product',
        ],
    ])('rejects a final request with an %s despite a reviewed schema path', (_label, url) => {
        expect(defaultNonPersonalizedResponseClassifier(classifierInput({ request: new Request(url) }))).toBe(false);
    });

    it.each([
        [
            'workspace organization ID replacement',
            'https://example.com/product/shopper-products/v1/organizations/f_ecom_zzzz_s01/products/product',
        ],
        [
            'encoded parameter values',
            'https://example.com/product/shopper-products/v1/organizations/f_ecom_%25tenant/products/product%2Fvariant',
        ],
    ])('allows %s within the reviewed route shape', (_label, url) => {
        expect(defaultNonPersonalizedResponseClassifier(classifierInput({ request: new Request(url) }))).toBe(true);
    });

    it.each(expansionTransports)('enforces the reviewed $label expansion matrix', (transport) => {
        for (const expand of transport.allowed) {
            expect(defaultNonPersonalizedResponseClassifier(expansionInput(transport, [expand]))).toBe(true);
        }
        expect(defaultNonPersonalizedResponseClassifier(expansionInput(transport, transport.allowed))).toBe(true);
        expect(defaultNonPersonalizedResponseClassifier(expansionInput(transport, ['none']))).toBe(true);
        for (const expand of transport.rejected) {
            expect(
                defaultNonPersonalizedResponseClassifier(expansionInput(transport, expand as readonly string[]))
            ).toBe(false);
        }
    });

    it.each([
        expansionTransports[0],
        expansionTransports[2],
    ])('normalizes serialized $label expansions but rejects empty segments', async (transport) => {
        const allowed = await runSerializedExpansion(
            transport,
            `expand=%20${transport.label === 'Product Search' ? 'images%2Cslug' : 'images%2Clinks'}%20&expand=%20variations%20`
        );
        const rejected = await runSerializedExpansion(
            transport,
            'expand=%20images%2C%20%2Cvariations%20&expand=availability'
        );

        expect(new URL(allowed.url).searchParams.get('personalized')).toBe('none');
        expect(new URL(rejected.url).searchParams.has('personalized')).toBe(false);
    });

    it.each(['override', 'custom'] as const)('rejects %s client provenance', (provenance) => {
        expect(defaultNonPersonalizedResponseClassifier(classifierInput({ provenance }))).toBe(false);
    });

    it.each([
        ['non-GET method', { method: 'POST' }],
        ['changed client', { client: 'changedClient' }],
        [
            'changed client base path',
            {
                clientBasePath: '/product/shopper-products/v2',
                destination: 'https://example.com/product/shopper-products/v2',
                request: new Request(
                    'https://example.com/product/shopper-products/v2/organizations/org/products/product'
                ),
            },
        ],
        ['changed schema path', { schemaPath: '/organizations/{organizationId}/products/{productId}' }],
        ['changed destination origin', { destination: 'https://other.example.com/product/shopper-products/v1' }],
        ['changed destination path', { destination: 'https://example.com/product/shopper-products/v2' }],
        ['invalid destination', { destination: 'not a URL' }],
    ])('rejects an unknown transport identity with %s', (_label, overrides) => {
        expect(defaultNonPersonalizedResponseClassifier(classifierInput(overrides))).toBe(false);
    });

    it.each([
        ['shopperExperience', '/experience/shopper-experience/v1', '/organizations/{organizationId}/pages/{id}'],
        ['shopperBasketsV2', '/checkout/shopper-baskets/v2', '/organizations/{organizationId}/baskets/{basketId}'],
        ['shopperCustomers', '/customer/shopper-customers/v1', '/organizations/{organizationId}/customers/{id}'],
        ['shopperOrders', '/checkout/shopper-orders/v1', '/organizations/{organizationId}/orders/{orderNo}'],
        ['shopperPayments', '/checkout/shopper-payments/v1', '/organizations/{organizationId}/payment-methods'],
    ])('leaves personal or transactional transport %s unclassified', (client, clientBasePath, schemaPath) => {
        expect(
            defaultNonPersonalizedResponseClassifier(
                classifierInput({
                    client,
                    clientBasePath,
                    schemaPath,
                    destination: `https://example.com${clientBasePath}`,
                    request: new Request(`https://example.com${clientBasePath}/organizations/org/resource`),
                })
            )
        ).toBe(false);
    });
});
