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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { DecodedResource } from './resource-encoding';

const STORE_INDEPENDENT_PRODUCT_EXPANSIONS: ReadonlySet<unknown> = new Set([
    'availability',
    'images',
    'links',
    'options',
    'variations',
    'page_meta_tags',
]);
const STORE_INDEPENDENT_SUGGESTION_EXPANSIONS: ReadonlySet<unknown> = new Set(['images', 'slug']);

/**
 * Merchant policy for store qualification. Skip only explicit metadata-only expansions of known
 * reads; omitted/default expansions and unknown methods or expansions remain conservative.
 * Merchants whose custom hooks make these metadata reads store-dependent must widen this policy.
 */
export function readsQualifiedCommerce(resource: DecodedResource): boolean {
    const metadata =
        resource.client === 'shopperProducts' && (resource.method === 'getProduct' || resource.method === 'getProducts')
            ? STORE_INDEPENDENT_PRODUCT_EXPANSIONS
            : resource.client === 'shopperSearch' && resource.method === 'getSearchSuggestions'
              ? STORE_INDEPENDENT_SUGGESTION_EXPANSIONS
              : undefined;
    if (!metadata) return true;
    const query = (resource.options as { params?: { query?: Record<string, unknown> } })?.params?.query;
    const expand = query?.expand;
    if (!Array.isArray(expand) || !expand.length) return true;
    if (expand.length === 1 && expand[0] === 'none' && metadata === STORE_INDEPENDENT_PRODUCT_EXPANSIONS) return false;
    return !expand.every((value: unknown) => metadata.has(value));
}
