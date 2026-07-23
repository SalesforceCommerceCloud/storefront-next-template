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

/**
 * Single source of truth for built-in SCAPI client configuration.
 *
 * Both `createCommerceApiClients` (runtime) and `sfnext scapi add` (dev CLI) read from
 * this map so an override registered via the CLI inherits the same per-client semantics
 * the SDK uses internally — locale-awareness, base-path — and the two stay in sync by
 * construction rather than by hand-mirroring.
 *
 * Each built-in SCAPI schema includes `/organizations/{organizationId}` in its path
 * patterns (and thus in the generated ops map's BASE_PATH), so the URL-prefix here is
 * the part *before* the org segment. Both the runtime and the CLI build the final URL
 * the same way: `${apiBaseUrl}${client.basePath}` with `/organizations/{organizationId}`
 * supplied via the ops map at request time.
 */
export interface BuiltInClientDefault {
    /** URL prefix for this client's API, joined with the SCAPI baseUrl at request time. */
    basePath: string;
    /** Whether this API accepts a `locale` query parameter on its operations. */
    supportsLocale: boolean;
}

export const BUILT_IN_CLIENT_DEFAULTS = {
    shopperAvailability: { basePath: '/product/shopper-availability/v1', supportsLocale: false },
    shopperBasketsV1: { basePath: '/checkout/shopper-baskets/v1', supportsLocale: true },
    shopperBasketsV2: { basePath: '/checkout/shopper-baskets/v2', supportsLocale: true },
    shopperConfigurations: { basePath: '/configuration/shopper-configurations/v1', supportsLocale: false },
    shopperConsents: { basePath: '/shopper/shopper-consents/v1', supportsLocale: true },
    shopperContext: { basePath: '/shopper/shopper-context/v1', supportsLocale: false },
    shopperCustomers: { basePath: '/customer/shopper-customers/v1', supportsLocale: false },
    shopperDeliveryEstimates: { basePath: '/product/shopper-delivery-estimates/v1', supportsLocale: false },
    shopperExperience: { basePath: '/experience/shopper-experience/v1', supportsLocale: true },
    shopperGiftCertificates: { basePath: '/pricing/shopper-gift-certificates/v1', supportsLocale: false },
    shopperLogin: { basePath: '/shopper/auth/v1', supportsLocale: false },
    shopperOrders: { basePath: '/checkout/shopper-orders/v1', supportsLocale: true },
    shopperPayments: { basePath: '/checkout/shopper-payments/v1', supportsLocale: false },
    shopperProducts: { basePath: '/product/shopper-products/v1', supportsLocale: true },
    shopperPromotions: { basePath: '/pricing/shopper-promotions/v1', supportsLocale: true },
    shopperSearch: { basePath: '/search/shopper-search/v1', supportsLocale: true },
    shopperSeo: { basePath: '/site/shopper-seo/v1', supportsLocale: true },
    shopperStores: { basePath: '/store/shopper-stores/v1', supportsLocale: true },
} as const satisfies Record<string, BuiltInClientDefault>;

export type BuiltInClientKey = keyof typeof BUILT_IN_CLIENT_DEFAULTS;

export const BUILT_IN_CLIENT_KEYS = Object.keys(BUILT_IN_CLIENT_DEFAULTS) as readonly BuiltInClientKey[];

export function isBuiltInClientKey(key: string): key is BuiltInClientKey {
    return key in BUILT_IN_CLIENT_DEFAULTS;
}
