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

import { useTranslation } from 'react-i18next';

/** Translation key for the default site name (within the `common` namespace). */
export const DEFAULT_SITE_NAME_KEY = 'defaultSiteName';

export interface SeoMetaProps {
    /**
     * Page title. How it renders depends on `rawTitle`:
     *
     * - **Default** (`rawTitle` omitted): `"My Page | NextGen PWA Kit Store"` — site name is appended.
     * - **`rawTitle` set**: `"My Page"` — rendered exactly as given, no suffix.
     *
     * When omitted entirely, the site name alone is used as the title.
     */
    title?: string;
    /**
     * Render `title` exactly as provided, without appending ` | {siteName}`.
     * Useful for pages where the title already contains the site name or needs
     * full control (e.g., the homepage: `<SeoMeta rawTitle title="Store Name" />`).
     */
    rawTitle?: boolean;
    /**
     * Meta description, rendered as given. Pass plain text: for catalog or CMS copy that may contain
     * HTML, build it in the loader with `resolveSeoDescription` from `@/utils/seo-description.server`.
     */
    description?: string;
    /** When true, renders `<meta name="robots" content="noindex">` to prevent search engine indexing. */
    noIndex?: boolean;
    /** With `noIndex`, renders `noindex,nofollow` so crawlers also don't follow links on the page. Ignored without `noIndex`. */
    noFollow?: boolean;
    /** Override the default site name used in the title suffix. Defaults to the localized `common:defaultSiteName` translation. */
    siteName?: string;
    /** X (formerly Twitter) Card metadata. Omit to skip Card tags entirely (unless `openGraph` is set, in which case Card tags are auto-derived). The `twitter:` meta tag prefix is part of the Card spec and is still used by X. */
    twitter?: {
        cardType?: 'summary' | 'summary_large_image';
        image?: string;
    };
    /** Open Graph metadata for social sharing (Facebook, LinkedIn, etc.). When set without an explicit `twitter` prop, X (formerly Twitter) Card tags are auto-derived from the Open Graph values. */
    openGraph?: {
        /** The OG object type. Defaults to `'website'`. */
        type?: 'website' | 'product' | 'article';
        /** Canonical page URL. Should be an absolute URL matching the `<link rel="canonical">`. */
        url?: string;
        /** Primary image URL. Must be an absolute URL for social platforms to fetch. */
        image?: string;
    };
}

/**
 * Renders SEO `<title>`, `<meta>`, Open Graph, and X (formerly Twitter) Card tags using
 * React 19 document metadata hoisting.
 *
 * Tags rendered anywhere in the component tree are automatically hoisted to `<head>`
 * and deduplicated (by `name` for `<meta>`, by `property` for OG, single instance for `<title>`).
 * This works with streaming/Suspense — when data resolves, the tags are sent and hoisted.
 *
 * **X Card auto-derivation:** When `openGraph` is provided without an explicit `twitter` prop,
 * X Card tags (`twitter:*` meta tags) are generated from the Open Graph values
 * (`summary_large_image` if an image is present, `summary` otherwise). Pass `twitter`
 * explicitly to override. The `twitter:` prefix is still the standard used by X's crawler.
 *
 * Usage: render `<SeoMeta>` inside any route component.
 *
 * @example
 * ```tsx
 * // Standard page — title gets the site name appended automatically
 * // Renders: <title>Classic Leather Jacket | NextGen PWA Kit Store</title>
 * // Product page with OG + auto-derived X Card
 * <SeoMeta
 *     title="Classic Leather Jacket"
 *     description="Premium leather jacket with a tailored fit."
 *     openGraph={{ type: 'product', url: 'https://store.com/product/jacket', image: 'https://...' }}
 * />
 *
 * // Full control over title (e.g., homepage) — no site name suffix
 * // Renders: <title>NextGen PWA Kit Store</title>
 * <SeoMeta rawTitle title="NextGen PWA Kit Store" />
 *
 * // Auth-protected page — no indexing
 * // Renders: <title>Order History | NextGen PWA Kit Store</title>
 * <SeoMeta title="Order History" noIndex />
 *
 * // Transactional page — no indexing, no link following
 * // Renders: <meta name="robots" content="noindex,nofollow">
 * <SeoMeta title="Cart" noIndex noFollow />
 *
 * // Catalog copy may contain HTML — convert it in the loader, then pass the plain text
 * // loader: seoDescription: resolveSeoDescription([product.pageDescription, product.shortDescription])
 * <SeoMeta description={loaderData.seoDescription} />
 * ```
 */
export function SeoMeta({
    title,
    rawTitle,
    description,
    noIndex,
    noFollow,
    twitter,
    openGraph,
    siteName,
}: SeoMetaProps) {
    const { t } = useTranslation('common');
    const resolvedSiteName = siteName ?? t(DEFAULT_SITE_NAME_KEY);
    const fullTitle = title ? (rawTitle ? title : `${title} | ${resolvedSiteName}`) : resolvedSiteName;
    const socialTitle = title || resolvedSiteName;

    const renderTwitter = twitter || openGraph;
    const twitterCardType = twitter?.cardType ?? (openGraph?.image ? 'summary_large_image' : 'summary');
    const twitterImage = twitter?.image ?? openGraph?.image;

    return (
        <>
            <title>{fullTitle}</title>
            {description && <meta name="description" content={description} />}
            {noIndex && <meta name="robots" content={noFollow ? 'noindex,nofollow' : 'noindex'} />}
            {openGraph && (
                <>
                    <meta property="og:title" content={socialTitle} />
                    {description && <meta property="og:description" content={description} />}
                    <meta property="og:type" content={openGraph.type ?? 'website'} />
                    {openGraph.url && <meta property="og:url" content={openGraph.url} />}
                    {openGraph.image && <meta property="og:image" content={openGraph.image} />}
                    <meta property="og:site_name" content={resolvedSiteName} />
                </>
            )}
            {renderTwitter && (
                <>
                    <meta name="twitter:card" content={twitterCardType} />
                    <meta name="twitter:title" content={socialTitle} />
                    {description && <meta name="twitter:description" content={description} />}
                    {twitterImage && <meta name="twitter:image" content={twitterImage} />}
                </>
            )}
        </>
    );
}
