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
import type { NonPersonalizedResponseClassifier } from '@/lib/scapi/non-personalized-response.server';

type ContractDecision = 'non-personalized' | 'product-expansions' | 'product-search-expansions';

const PRODUCT_EXPANSIONS = new Set([
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
]);

const PRODUCT_SEARCH_EXPANSIONS = new Set([
    'availability',
    'custom_properties',
    'images',
    'page_meta_tags',
    'represented_products',
    'slug',
    'variations',
]);

// Reviewed against Salesforce's Commerce API caching guidance on 2026-09-28.
// The endpoint list repeats an incomplete Promotions campaigns path; the checked-in Shopper Promotions OAS and TTL
// table establish the separate Promotions and Campaign operations below.
// https://developer.salesforce.com/docs/commerce/commerce-api/guide/server-side-web-tier-caching.html
const REVIEWED_CONTRACTS = new Map<string, ContractDecision>([
    [
        'shopperAvailability\0/product/shopper-availability/v1\0/organizations/{organizationId}/availability',
        'non-personalized',
    ],
    [
        'shopperConfigurations\0/configuration/shopper-configurations/v1\0/organizations/{organizationId}/configurations',
        'non-personalized',
    ],
    ['shopperProducts\0/product/shopper-products/v1\0/organizations/{organizationId}/categories', 'non-personalized'],
    [
        'shopperProducts\0/product/shopper-products/v1\0/organizations/{organizationId}/categories/{id}',
        'non-personalized',
    ],
    [
        'shopperProducts\0/product/shopper-products/v1\0/organizations/{organizationId}/products/{id}',
        'product-expansions',
    ],
    ['shopperProducts\0/product/shopper-products/v1\0/organizations/{organizationId}/products', 'product-expansions'],
    [
        'shopperPromotions\0/pricing/shopper-promotions/v1\0/organizations/{organizationId}/promotions',
        'non-personalized',
    ],
    [
        'shopperPromotions\0/pricing/shopper-promotions/v1\0/organizations/{organizationId}/promotions/campaigns/{campaignId}',
        'non-personalized',
    ],
    [
        'shopperSearch\0/search/shopper-search/v1\0/organizations/{organizationId}/search-suggestions',
        'non-personalized',
    ],
    [
        'shopperSearch\0/search/shopper-search/v1\0/organizations/{organizationId}/product-search',
        'product-search-expansions',
    ],
    ['shopperSeo\0/site/shopper-seo/v1\0/organizations/{organizationId}/url-mapping', 'non-personalized'],
    ['shopperStores\0/store/shopper-stores/v1\0/organizations/{organizationId}/stores', 'non-personalized'],
]);

/** Joins transport fields with a character that cannot occur in URL paths or client keys. */
const getContractKey = (client: string, clientBasePath: string, schemaPath: string): string =>
    `${client}\0${clientBasePath}\0${schemaPath}`;

/** Requires an explicit list containing only reviewed expansions, with `none` allowed only by itself. */
const hasOnlyNonPersonalizedExpansions = (
    expand: readonly string[] | undefined,
    allowed: ReadonlySet<string>
): boolean => {
    if (!expand?.length) return false;
    if (expand.includes('none')) return expand.length === 1;
    return expand.every((value) => typeof value === 'string' && value.length > 0 && allowed.has(value));
};

/** Matches placeholders to one encoded segment while requiring static segments verbatim. */
const matchesRouteShape = (pathname: string, routeShape: string): boolean => {
    const pathSegments = pathname.split('/');
    const routeSegments = routeShape.split('/');
    return (
        pathSegments.length === routeSegments.length &&
        routeSegments.every((segment, index) =>
            /^\{[^{}]+\}$/.test(segment) ? pathSegments[index].length > 0 : pathSegments[index] === segment
        )
    );
};

/** Confirms the final request still targets the captured client origin and operation shape. */
const hasExpectedDestination = (
    destination: string,
    request: Request,
    clientBasePath: string,
    schemaPath: string
): boolean => {
    try {
        const baseUrl = new URL(destination);
        const requestUrl = new URL(request.url);
        const basePath = baseUrl.pathname.replace(/\/+$/, '');
        return (
            baseUrl.origin === requestUrl.origin &&
            basePath === clientBasePath &&
            matchesRouteShape(requestUrl.pathname, `${basePath}${schemaPath}`)
        );
    } catch {
        return false;
    }
};

/** Rejects raw expansion input containing an empty comma-separated segment before normalization. */
const hasEmptyExpansionSegment = (expand: string | readonly string[] | undefined): boolean =>
    expand !== undefined &&
    (typeof expand === 'string' || Array.isArray(expand)) &&
    (typeof expand === 'string' ? [expand] : expand).some((value: string) =>
        value.split(',').some((item: string) => !item.trim())
    );

/**
 * Classifies only exact built-in transport contracts reviewed as safe for non-personalized responses.
 * Replace or narrow this policy when hooks, response fields, or response-affecting headers vary by shopper.
 */
export const defaultNonPersonalizedResponseClassifier: NonPersonalizedResponseClassifier = ({
    client,
    provenance,
    clientBasePath,
    schemaPath,
    method,
    destination,
    request,
    expand,
    query,
}) => {
    if (
        provenance !== 'built-in' ||
        method !== 'GET' ||
        !hasExpectedDestination(destination, request, clientBasePath, schemaPath)
    ) {
        return false;
    }

    const decision = REVIEWED_CONTRACTS.get(getContractKey(client, clientBasePath, schemaPath));
    if (decision === 'product-expansions') {
        if (hasEmptyExpansionSegment(query.expand)) return false;
        return hasOnlyNonPersonalizedExpansions(expand, PRODUCT_EXPANSIONS);
    }
    if (decision === 'product-search-expansions') {
        if (hasEmptyExpansionSegment(query.expand)) return false;
        return hasOnlyNonPersonalizedExpansions(expand, PRODUCT_SEARCH_EXPANSIONS);
    }
    return decision === 'non-personalized';
};
