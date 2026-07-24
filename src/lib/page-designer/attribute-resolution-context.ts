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
 * Storefront-next factory for the Page Designer attribute-resolution context.
 *
 * `AttributeResolutionContext` is platform-neutral on purpose — it lives in
 * `@salesforce/storefront-next-runtime` so Page Designer's BM-side preview
 * can also produce one. This factory is the storefront-next-side
 * implementation: it wires `host` and `resolveMediaUrl` from the
 * storefront's runtime config and per-request inputs.
 *
 * Usage: called once per `getPage` request from
 * `middlewares/page-designer-content-resolution.server.ts` (§A.7) and threaded
 * through `resolvePage(...)` as the new `attrCtx` parameter.
 */
import type {
    AttributeResolutionContext,
    AttributeResolutionWarning,
} from '@salesforce/storefront-next-runtime/design/data';

/**
 * Inputs the storefront has on hand at request time. Kept as a thin object
 * so the middleware can build it from `getConfig` + `siteContext` +
 * `request.url` without any extra plumbing.
 */
export interface CreateAttributeResolutionContextArgs {
    /**
     * Storefront origin used to absolutize URLs. Typically the request
     * origin (e.g. `new URL(request.url).origin`). When the storefront is
     * fronted by a CDN, callers may substitute the CDN origin instead —
     * mirrors ECOM's `URLPrefixProvider` behavior.
     */
    host: string;
    /** Site identifier used as the `Sites-${siteId}-Site` segment in URLs. */
    siteId: string;
    /**
     * Locale the request is resolving for, in manifest format (e.g.
     * `"en_US"`). Used as the `${locale}` segment in static-content URLs
     * and forwarded to {@link AttributeResolutionContext.resolveMediaUrl}.
     */
    locale: string;
    /**
     * Optional fingerprint segment for static-content URLs. When omitted
     * the fingerprint segment is left out of the resulting URL entirely
     * (the static handler accepts URLs with or without it). Set explicitly
     * once per-file fingerprints land in the manifest.
     */
    fingerprint?: string;
    /**
     * Media-file domain of the page's owning library, sourced from
     * `manifest.pageLibraryDomain`. Required for `?$staticlink$` rewriting
     * inside markup attributes.
     */
    pageLibraryDomain?: string;

    /**
     * Forwarded as-is to {@link AttributeResolutionContext.onWarn}. Use
     * this to wire the storefront's structured logger into the resolver's
     * recoverable-warning channel (malformed envelopes, unknown attribute
     * types, etc.).
     */
    onWarn?: (warning: AttributeResolutionWarning) => void;
}

/**
 * Builds the static-content URL for a media-file path inside a library.
 * Mirrors ECOM's `URLWebRootProvider#getRelativeWebRoot` chain:
 * `${host}/on/demandware.static/${siteOrDash}/${libraryDomain}/${locale}/${fingerprint?}/${path}`.
 *
 * The `siteOrDash` segment is `-` when `libraryDomain` is a real library
 * (e.g. `Library-Sites-MyLibrary`) and the site ID when the path is rooted
 * at the site itself (libraryDomain `-`). Matches the ECOM convention.
 *
 * The `fingerprint` segment is omitted when not provided — the static
 * handler accepts URLs both with and without it.
 *
 * Exported for unit tests; the factory below is the public entry point.
 */
export function buildStorefrontMediaUrl(
    ref: { libraryDomain: string; path: string; locale?: string },
    ctx: { host: string; siteId: string; locale: string; fingerprint?: string }
): string {
    const siteOrDash = ref.libraryDomain === '-' ? ctx.siteId : '-';
    const localeSeg = ref.locale ?? ctx.locale ?? 'default';
    const cleanPath = ref.path.startsWith('/') ? ref.path : `/${ref.path}`;
    const fingerprintSeg = ctx.fingerprint ? `/${ctx.fingerprint}` : '';
    return `${ctx.host}/on/demandware.static/${siteOrDash}/${ref.libraryDomain}/${localeSeg}${fingerprintSeg}${cleanPath}`;
}

/**
 * Builds an {@link AttributeResolutionContext} configured for storefront-next.
 */
export function createAttributeResolutionContext(
    args: CreateAttributeResolutionContextArgs
): AttributeResolutionContext {
    return {
        host: args.host,
        locale: args.locale,
        pageLibraryDomain: args.pageLibraryDomain,
        onWarn: args.onWarn,
        resolveMediaUrl: (ref) =>
            buildStorefrontMediaUrl(ref, {
                host: args.host,
                siteId: args.siteId,
                locale: args.locale,
                fingerprint: args.fingerprint,
            }),
    };
}
