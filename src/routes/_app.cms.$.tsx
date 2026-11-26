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
import type { LoaderFunctionArgs } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext, stripPathPrefix } from '@salesforce/storefront-next-runtime/site-context';
import { ApiError, type ShopperExperience } from '@/scapi';
import { Region } from '@/components/region';
import { SeoMeta } from '@/components/seo-meta';
import HtmlFragment from '@/components/html-fragment';
import { fetchContent } from '@/lib/api/content.server';
import {
    attachComponentData,
    fetchPageFromLoader,
    type PageWithComponentData,
} from '@/lib/page-designer/page-loader.server';
import { getCanonicalResourceRedirect } from '@/lib/seo/canonical-redirect.server';
import { buildSeoPageUrl } from '@/lib/seo/page-url.server';
import { attemptRouteSeoFallback } from '@/lib/seo/route-fallback.server';
import { resolveContentRoute } from '@/lib/seo/url-resolution.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { findLegacyRoute } from '@/middlewares/legacy-routes';
import { createContentUrl } from '@/route-paths';
import { resolveSeoDescription } from '@/utils/seo-description.server';

export { shouldRevalidate } from '@/lib/revalidation/routes/content';

type ContentAsset = ShopperExperience.schemas['Content'];

export type StandaloneContentPageData =
    | { type: 'content'; content: ContentAsset; pageUrl: string; seoDescription?: string }
    | { type: 'page'; page: PageWithComponentData; pageUrl: string; seoDescription?: string };

function notFound(): never {
    throw new Response('Not Found', { status: 404 });
}

function isNotFound(error: unknown): boolean {
    return error instanceof ApiError && error.status === 404;
}

export async function loader(args: LoaderFunctionArgs): Promise<StandaloneContentPageData | Response> {
    const { context, request } = args;
    const config = getConfig(context);
    const requestUrl = new URL(request.url);
    const strippedPath = stripPathPrefix({ pathname: requestUrl.pathname, prefix: config.url?.prefix ?? '' }) || '/';
    const legacyRoutes = config.hybrid.enabled ? (config.hybrid.legacyRoutes ?? []) : [];

    // Runtime ownership remains authoritative even though the configured prefix is present
    // in the compiled route manifest. Initial document requests are handed off by eCDN; this
    // guard prevents a misrouted legacy request from reaching SCAPI or URL Mapping.
    if (findLegacyRoute(strippedPath, legacyRoutes)) notFound();

    const activeSite = context.get(siteContext);
    if (!activeSite) {
        throw new Error('Site context not found. Ensure siteContextMiddleware runs before loaders.');
    }

    const resolution = resolveContentRoute({
        url: requestUrl,
        params: args.params,
        urlPrefix: config.url?.prefix,
        siteId: activeSite.site.id,
        seoRoutes: config.url?.seoRoutes,
    });
    if (!resolution) {
        const fallbackResponse = await attemptRouteSeoFallback(context, request);
        if (fallbackResponse) return fallbackResponse;
        notFound();
    }

    const canonicalPath = createContentUrl(
        {
            type: resolution.type,
            resourceId: resolution.resourceId,
            slugSegments: resolution.slugSegments,
        },
        { siteId: activeSite.site.id, urlPrefix: config.url?.prefix, seoRoutes: config.url?.seoRoutes }
    );
    const canonicalRedirect = getCanonicalResourceRedirect(requestUrl, buildUrlFromContext(canonicalPath, context));
    if (canonicalRedirect) throw canonicalRedirect;

    const pageUrl = buildSeoPageUrl(context, requestUrl);
    try {
        if (resolution.type === 'content') {
            const content = await fetchContent(context, resolution.resourceId);
            // Authored copy can contain HTML, so resolve the meta description to plain text here, server-side.
            const seoDescription = resolveSeoDescription([content.pageDescription, content.description]);
            return { type: 'content', content, pageUrl, seoDescription };
        }

        const page = await fetchPageFromLoader(args, { pageId: resolution.resourceId });
        const seoDescription = resolveSeoDescription([page.pageDescription, page.description]);
        return { type: 'page', page: attachComponentData(args, page), pageUrl, seoDescription };
    } catch (error) {
        if (isNotFound(error)) notFound();
        throw error;
    }
}

function StandardContentPage({
    content,
    pageUrl,
    seoDescription,
}: {
    content: ContentAsset;
    pageUrl: string;
    seoDescription?: string;
}) {
    const body = typeof content.c_body === 'string' ? content.c_body : '';
    return (
        <article className="container mx-auto max-w-4xl px-4 py-8">
            <SeoMeta
                title={content.pageTitle ?? content.name}
                description={seoDescription}
                openGraph={{ type: 'article', url: pageUrl }}
            />
            <link rel="canonical" href={pageUrl} />
            {content.name && <h1 className="mb-6 text-3xl font-bold">{content.name}</h1>}
            {body && <HtmlFragment content={body} className="prose max-w-none" />}
        </article>
    );
}

function PageDesignerPage({
    page,
    pageUrl,
    seoDescription,
}: {
    page: PageWithComponentData;
    pageUrl: string;
    seoDescription?: string;
}) {
    const criticalRegionId = (page.data as { criticalRegionId?: unknown } | undefined)?.criticalRegionId;
    return (
        <div className="container mx-auto px-4 py-8">
            <SeoMeta
                title={page.pageTitle ?? page.name}
                description={seoDescription}
                openGraph={{ type: 'website', url: pageUrl }}
            />
            <link rel="canonical" href={pageUrl} />
            {page.regions?.map((region) =>
                region.id ? (
                    <Region
                        key={region.id}
                        page={page}
                        regionId={region.id}
                        critical={typeof criticalRegionId === 'string' && region.id === criticalRegionId}
                    />
                ) : null
            )}
        </div>
    );
}

export default function StandaloneContentPage({ loaderData }: { loaderData: StandaloneContentPageData }) {
    return loaderData.type === 'content' ? (
        <StandardContentPage
            content={loaderData.content}
            pageUrl={loaderData.pageUrl}
            seoDescription={loaderData.seoDescription}
        />
    ) : (
        <PageDesignerPage
            page={loaderData.page}
            pageUrl={loaderData.pageUrl}
            seoDescription={loaderData.seoDescription}
        />
    );
}
