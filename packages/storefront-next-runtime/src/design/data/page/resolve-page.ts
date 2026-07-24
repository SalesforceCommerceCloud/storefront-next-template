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
import type {
    IdentifierType,
    ManifestStorage,
    ContextResolver,
    QualifierContext,
    PageMetadataOverlay,
    VariationEntry,
} from '../types';
import type { ShopperExperience } from '@/scapi-client/types';
import { ContentAssignmentResolvers } from '../manifest/content-assignment-resolvers';
import { resolveDynamicPageId } from '../manifest/resolve-dynamic-page-id';
import { getPageFromManifest } from '../manifest/get-page';
import { processPage } from './process-page';
import type { AttributeResolutionContext } from './attribute-resolution';
import { RequiredError } from '../errors/required';

/**
 * Page metadata fields the manifest builder may locale-overlay. Used by
 * {@link applyPageMetadataOverlay} to know which keys to copy from the
 * overlay onto the resolved page; structural fields like `id`, `typeId`,
 * and `regions` are intentionally excluded.
 */
const PAGE_METADATA_OVERLAY_KEYS = [
    'name',
    'aspectTypeId',
    'description',
    'pageTitle',
    'pageDescription',
    'pageKeywords',
] as const satisfies readonly (keyof PageMetadataOverlay)[];

/**
 * Applies a per-locale page metadata overlay to the variation's default-locale
 * page. The overlay is a **full replacement** for the listed metadata fields
 * — when a key is present in the overlay it wins; when absent we fall through
 * to the default-locale value (Q6 of the design plan).
 *
 * Returns a shallow copy of the page with overlaid fields applied. Structural
 * fields (`id`, `typeId`, `regions`, `data`) are never touched.
 */
function applyPageMetadataOverlay(variation: VariationEntry, locale: string): ShopperExperience.schemas['Page'] {
    const overlay = variation.pageContent?.[locale];

    if (!overlay) {
        return variation.page;
    }

    const out: ShopperExperience.schemas['Page'] = { ...variation.page };

    for (const key of PAGE_METADATA_OVERLAY_KEYS) {
        if (overlay[key] !== undefined) {
            out[key] = overlay[key];
        }
    }

    return out;
}

/**
 * Options accepted by {@link resolvePage}. The shape of `id` and the result
 * are determined by `identifierType`:
 *
 * - For `'page' | 'category' | 'product'`, the id is resolved through site
 *   content assignments (where applicable) into a {@link PageManifest} and a
 *   personalised SCAPI {@link ShopperExperience.schemas#Page} is returned.
 * - For `'component'`, the id is used directly to fetch a
 *   {@link ComponentManifest} (no assignment lookup, no variation selection,
 *   no aspect type) and a SCAPI {@link ShopperExperience.schemas#Component} is
 *   returned.
 */
export interface ResolvePageOptions {
    id: string;
    identifierType: IdentifierType;
    /** Required only for `'product' | 'category'`; ignored for `'page'` and `'component'`. */
    aspectType?: string;
    /**
     * Fallback category ID (or a Promise resolving to one) consulted only
     * when `identifierType === 'product'` and the product has no content
     * assignment for the requested aspect type. Awaited lazily — the happy
     * path skips it.
     */
    categoryId?: string | Promise<string | null | undefined> | null;
    locale: string;
    defaultLocale: string;
    manifestStorage: ManifestStorage;
    contextResolver?: ContextResolver;
    /**
     * Per-request resolution surface for attribute envelope rewriting. Built
     * once per request by the storefront-next middleware (or Page Designer
     * preview). For pages, the `componentTypes` map travels on the
     * {@link PageManifest} itself and is read off the manifest before being
     * threaded into {@link processPage}.
     */
    attrCtx: AttributeResolutionContext;
    pruneInvisible?: boolean;
}

/**
 * Main entry point for the Page Designer content resolution pipeline. Handles
 * both the page-rooted flow (`'page' | 'category' | 'product'`) and the
 * embedded-component-rooted flow (`'component'`) behind a single callable
 * surface so callers don't fork on identifier type.
 *
 * **Page flow** (`'page' | 'category' | 'product'`):
 * 1. **Resolve dynamic page ID** — for product/category identifiers, look up
 *    the assigned page ID via content assignments in the site manifest.
 * 2. **Fetch page manifest** — load all variations for the resolved page.
 * 3. **Select variation** — evaluate visibility rules to pick the right variation.
 * 4. **Load qualifier context** — lazily fetch the shopper's context only if needed.
 * 5. **Process** — filter out components that fail visibility rules.
 *
 * **Component flow** (`'component'`):
 * 1. **Fetch component manifest** — direct DAL lookup by component ID.
 * 2. **Load qualifier context** — only when `requiresContext === true` (skip
 *    the ECOM round-trip entirely otherwise — pre-computed during generation).
 * 3. **Process** — same visibility / locale / data-binding pipeline as pages.
 *
 * Returns `null` when the id cannot be resolved, the manifest is missing, or
 * (page flow only) no variation is available — fail-open so the middleware can
 * fall through to SCAPI.
 *
 * @param options - The resolution options. See {@link ResolvePageOptions}.
 * @returns The resolved & filtered SCAPI Page (page flow) or Component
 *          (component flow), or `null` on miss.
 *
 * @example
 * ```ts
 * // Page flow
 * const page = await resolvePage({
 *     id: 'nike-air-max-90',
 *     identifierType: 'product',
 *     aspectType: 'pdp',
 *     locale: 'en-US',
 *     defaultLocale: 'en-US',
 *     manifestStorage,
 *     attrCtx,
 * });
 *
 * // Component flow (embedded `embedded.*` block — header, mini-cart, …)
 * const header = await resolvePage({
 *     id: 'header',
 *     identifierType: 'component',
 *     locale: 'en-US',
 *     defaultLocale: 'en-US',
 *     manifestStorage,
 *     attrCtx,
 * });
 * ```
 */
export function resolvePage(
    options: ResolvePageOptions & { identifierType: 'component' }
): Promise<ShopperExperience.schemas['Component'] | null>;
export function resolvePage(
    options: ResolvePageOptions & { identifierType: 'page' | 'category' | 'product' }
): Promise<ShopperExperience.schemas['Page'] | null>;
export function resolvePage(
    options: ResolvePageOptions
): Promise<ShopperExperience.schemas['Page'] | ShopperExperience.schemas['Component'] | null>;
export async function resolvePage(
    options: ResolvePageOptions
): Promise<ShopperExperience.schemas['Page'] | ShopperExperience.schemas['Component'] | null> {
    if (options.identifierType === 'component') {
        return resolveComponentFlow(options);
    }

    return resolvePageFlow(options);
}

/**
 * Resolves an embedded component (`embedded.*`) directly from a
 * {@link ComponentManifest}. Skips the assignment lookup and variation
 * selection that pages need — embedded components are keyed by id and have
 * no page-level variations. The qualifier context is only resolved when the
 * manifest's pre-computed `requiresContext` flag is `true`.
 */
async function resolveComponentFlow({
    id,
    locale,
    defaultLocale,
    manifestStorage,
    contextResolver,
    attrCtx,
    pruneInvisible = true,
}: ResolvePageOptions): Promise<ShopperExperience.schemas['Component'] | null> {
    const componentManifest = await manifestStorage.getComponentManifest(id);

    if (!componentManifest) {
        return null;
    }

    // Lazy context resolution: the manifest builder pre-computes whether any
    // visibility rule or data binding on this component (or its descendants)
    // needs shopper qualifiers. When it doesn't, we skip the ECOM round-trip
    // entirely — the happy path for the static blocks (header, footer) where
    // `requiresContext` is `false`.
    let context: QualifierContext | null = null;

    if (componentManifest.requiresContext) {
        context = (await contextResolver?.(componentManifest.context)) ?? null;
    }

    return processPage(componentManifest.component, {
        kind: 'component',
        qualifiers: context,
        componentInfo: componentManifest.componentInfo,
        // No `pageInfo` — embedded components have no page-level region
        // configuration. (Flow selection is via `kind`, not `pageInfo`.)
        locale,
        defaultLocale,
        attrCtx,
        pruneInvisible,
    });
}

/**
 * Page-rooted resolution flow shared by `'page' | 'category' | 'product'`
 * identifier types. Resolves a dynamic page id through site content assignments
 * where applicable, loads the page manifest, selects the variation matching the
 * shopper's qualifier context, applies the per-locale metadata overlay, and
 * returns a SCAPI Page — or `null` when the id can't be resolved, the manifest
 * is missing, or no variation qualifies.
 */
async function resolvePageFlow({
    id,
    identifierType,
    aspectType,
    categoryId,
    locale,
    defaultLocale,
    manifestStorage,
    contextResolver,
    attrCtx,
    pruneInvisible = true,
}: ResolvePageOptions): Promise<ShopperExperience.schemas['Page'] | null> {
    let resolvedId: string | null = null;

    if (ContentAssignmentResolvers.has(identifierType)) {
        const siteManifest = await manifestStorage.getSiteManifest();

        RequiredError.assert(aspectType, `Aspect type is required for identifier type ${identifierType}`, (v) => !v);

        resolvedId = await resolveDynamicPageId({ id, identifierType, aspectType, siteManifest, categoryId });
    } else {
        resolvedId = id;
    }

    if (!resolvedId) {
        return null;
    }

    const pageManifest = await manifestStorage.getPageManifest(resolvedId);

    if (!pageManifest) {
        return null;
    }

    const pageResults = await getPageFromManifest(pageManifest, {
        contextResolver,
        locale,
    });

    if (!pageResults) {
        return null;
    }

    let context: QualifierContext | null = null;

    if (pageResults.entry.pageRequiresContext) {
        context = pageResults.context ?? (await contextResolver?.(pageManifest.context)) ?? null;
    }

    // Apply per-locale page metadata overlay before processing. The overlay
    // carries the SCAPI-shape page metadata fields (`name`, `aspectTypeId`,
    // `description`, `pageTitle`, `pageDescription`, `pageKeywords`) that may
    // differ per locale. When the request locale isn't in `pageContent`, we
    // fall back to the default-locale page on `variation.page`. Q6 of the
    // design plan locks in full-replacement semantics; see
    // {@link applyPageMetadataOverlay} for the field-by-field policy.
    const localizedPage = applyPageMetadataOverlay(pageResults.entry, locale);

    // Thread manifest-level pageLibraryDomain onto the resolution context so
    // the markup rewriter can resolve ?$staticlink$ without the caller having
    // to know the library domain up-front (B.2 — the manifest is the source
    // of truth for this value).
    const resolvedAttrCtx =
        pageManifest.pageLibraryDomain && !attrCtx.pageLibraryDomain
            ? { ...attrCtx, pageLibraryDomain: pageManifest.pageLibraryDomain }
            : attrCtx;

    return processPage(localizedPage, {
        kind: 'page',
        qualifiers: context,
        componentInfo: pageManifest.componentInfo,
        pageInfo: {
            regions: pageResults.entry.regions,
        },
        locale,
        defaultLocale,
        attrCtx: resolvedAttrCtx,
        // `componentTypes` lives on the manifest. May be `undefined` for
        // older manifests; the optional typing on `PageProcessorContext`
        // covers that case.
        componentTypes: pageManifest.componentTypes,
        pruneInvisible,
    });
}
