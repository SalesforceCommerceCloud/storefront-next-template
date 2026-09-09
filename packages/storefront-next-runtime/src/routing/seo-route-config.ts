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
import type { SeoRoutesConfig } from '../config/types';

const VALID_PREFIX = /^[A-Za-z0-9_-]+$/;
const RESERVED_PREFIXES = new Set(['action', 'resource']);

type SeoResourceType = 'product' | 'category' | 'content';

export type SeoRouteAliases = {
    product: string[];
    category: string[];
};

export function normalizeSeoRoutePrefix(prefix: string): string {
    return prefix.toLowerCase();
}

function validatePrefix(prefix: unknown, siteId: string, resourceType: SeoResourceType): asserts prefix is string {
    if (typeof prefix !== 'string' || !VALID_PREFIX.test(prefix)) {
        throw new Error(
            `[storefront-next-runtime] Invalid SEO route prefix for site "${siteId}" ${resourceType}. ` +
                `Expected one static segment containing only letters, digits, hyphens, or underscores; received "${String(prefix)}".`
        );
    }

    if (RESERVED_PREFIXES.has(normalizeSeoRoutePrefix(prefix))) {
        throw new Error(
            `[storefront-next-runtime] Reserved SEO route prefix "${prefix}" cannot be used for ${resourceType}.`
        );
    }
}

function claimPrefixOwner(owners: Map<string, SeoResourceType>, prefix: string, resourceType: SeoResourceType): string {
    const normalized = normalizeSeoRoutePrefix(prefix);
    const existingOwner = owners.get(normalized);
    if (existingOwner && existingOwner !== resourceType) {
        throw new Error(
            `[storefront-next-runtime] SEO route prefix "${prefix}" is used by both ${existingOwner} and ${resourceType}.`
        );
    }

    owners.set(normalized, resourceType);
    return normalized;
}

function addAlias(
    aliases: Map<string, string>,
    owners: Map<string, SeoResourceType>,
    prefix: string,
    resourceType: SeoResourceType
): void {
    const normalized = claimPrefixOwner(owners, prefix, resourceType);
    const existingPrefix = aliases.get(normalized);
    // Compare by code unit so the manifest is byte-for-byte reproducible across build machines,
    // independent of the host's ICU collation.
    if (!existingPrefix || prefix < existingPrefix) {
        aliases.set(normalized, prefix);
    }
}

/** Validates per-site SEO settings and returns deterministic route aliases. */
export function collectSeoRouteAliases(config: SeoRoutesConfig): SeoRouteAliases {
    const siteEntries = Object.entries(config).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    if (siteEntries.length === 0) {
        throw new Error('[storefront-next-runtime] SEO route configuration must contain at least one site.');
    }

    const aliases = {
        product: new Map<string, string>(),
        category: new Map<string, string>(),
    };
    const owners = new Map<string, SeoResourceType>();

    for (const [siteId, siteConfig] of siteEntries) {
        if (!siteId.trim()) {
            throw new Error('[storefront-next-runtime] SEO route configuration contains an empty site ID.');
        }
        if (!siteConfig || typeof siteConfig !== 'object') {
            throw new Error(`[storefront-next-runtime] SEO route configuration for site "${siteId}" is invalid.`);
        }

        validatePrefix(siteConfig.product?.prefix, siteId, 'product');
        validatePrefix(siteConfig.category?.prefix, siteId, 'category');
        if (siteConfig.category.mode !== 'id-suffix' && siteConfig.category.mode !== 'slug-path') {
            throw new Error(
                `[storefront-next-runtime] Site "${siteId}" has unsupported category mode ` +
                    `"${String(siteConfig.category.mode)}".`
            );
        }

        addAlias(aliases.product, owners, siteConfig.product.prefix, 'product');
        addAlias(aliases.category, owners, siteConfig.category.prefix, 'category');

        if (siteConfig.content) {
            validatePrefix(siteConfig.content.prefix, siteId, 'content');
            // Content is not registered as a route yet, but it still claims a prefix so a later
            // content story can rely on the same cross-resource collision guarantees. That story
            // must also feed the content prefix into validateNoStaticCollisions; claiming an owner
            // here guards resource-vs-resource collisions only, not collisions with static routes.
            claimPrefixOwner(owners, siteConfig.content.prefix, 'content');
        }
    }

    const sortAliases = (values: Map<string, string>) =>
        [...values.values()].sort((left, right) => {
            const a = normalizeSeoRoutePrefix(left);
            const b = normalizeSeoRoutePrefix(right);
            return a < b ? -1 : a > b ? 1 : 0;
        });

    return {
        product: sortAliases(aliases.product),
        category: sortAliases(aliases.category),
    };
}
