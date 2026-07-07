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
 * Per-attribute resolution for Page Designer manifests. Walks a component's
 * already-locale-merged `data` map and converts each attribute's manifest
 * envelope into the wire shape the SCAPI `getPage` controller would have
 * returned for the same component.
 *
 * Module is platform-neutral: imports nothing from the template,
 * `site-context/build-url`, or React Router. The caller (storefront-next
 * middleware or Page Designer preview) supplies an
 * {@link AttributeResolutionContext} that injects URL-building utilities, so
 * the same code runs in both consumers.
 *
 * The dispatch table covers `image`, `markup`/`url`, `file`, and `cms_record`.
 *
 * When the `componentTypes` map is unavailable, image dispatch falls back to
 * **structural** detection (presence of `media.libraryDomain` and
 * `media.path`). When `componentTypes` is wired through, dispatch keys off
 * {@link AttributeDefinition.type} and unknown types pass through with a
 * one-time warning (Q9 forward-compat).
 */
import { rewriteMarkup } from './markup-url-rewriter';

/**
 * Per-request resolution surface. Storefront-next builds one of these from
 * the request URL + site config; Page Designer preview builds one against
 * the BM origin. Both surfaces inject URL-building utilities so this module
 * stays platform-neutral.
 */
export interface AttributeResolutionContext {
    /**
     * Storefront origin used to absolutize URLs, e.g.
     * `"https://www.shop.example"`. Page Designer preview supplies the BM
     * origin instead.
     */
    host: string;

    /**
     * Builds a static-content URL for a media-file path inside a library.
     * Mirrors ECOM's `MediaFile.getAbsURL()` chain, parameterized by the
     * storefront request rather than a JVM `Request`.
     *
     * The {@code locale} hint is optional — when omitted, the resolver
     * substitutes `"default"` so URLs still resolve.
     */
    resolveMediaUrl: (ref: { libraryDomain: string; path: string; locale?: string }) => string;

    /**
     * Resolves a library-relative path inside markup (`?$staticlink$`).
     * When omitted, falls back to {@link resolveMediaUrl}.
     */
    staticLinkFor?: (ref: { libraryDomain: string; path: string; locale?: string }) => string;

    /**
     * Default library media domain used when rewriting `?$staticlink$`
     * references inside markup attributes. Sourced from
     * {@code manifest.pageLibraryDomain} and threaded through by the
     * caller. Optional — when omitted, `?$staticlink$` placeholders inside
     * markup are left untouched and a one-time warning fires.
     */
    pageLibraryDomain?: string;

    /**
     * Locale hint forwarded to {@link resolveMediaUrl}. Page Designer
     * preview may omit this when the editor session has no locale; the
     * resolver substitutes `"default"` in that case.
     */
    locale?: string;

    /**
     * Optional handler invoked when the resolver encounters a recoverable
     * problem — malformed envelopes, unknown attribute types, depth limits
     * exceeded. Lets the consumer route these into its own logger / metric
     * pipeline instead of the SDK calling `console.warn` directly.
     *
     * The runtime dedupes calls to {@code onWarn} per
     * `(typeId, attrId, attrType)` triple so a misshapen value processed
     * many times only fires the handler once per process.
     *
     * When omitted the runtime stays silent — fits unit tests and Page
     * Designer preview where stderr noise is undesirable. Production
     * callers should supply a handler that forwards to their structured
     * logger.
     */
    onWarn?: (warning: AttributeResolutionWarning) => void;
}

/**
 * Payload passed to {@link AttributeResolutionContext.onWarn}. Keep this
 * shape stable — consumers may pattern-match on `kind` to decide log
 * level, attach extra metadata, etc.
 */
export interface AttributeResolutionWarning {
    /**
     * Identifier for the kind of issue, useful for routing or grouping in
     * downstream logging:
     *
     * - `malformed-image` / `malformed-file` / `malformed-cms-record` —
     *   the manifest envelope didn't match the expected shape and the
     *   value is being passed through unchanged.
     * - `unknown-attribute-type` — the runtime saw an attribute type it
     *   doesn't recognize (forward-compat from a newer ECOM).
     * - `cms-record-depth-exceeded` — recursive cms_record nesting hit
     *   the resolver's safety limit.
     * - `staticlink-rewrite-skipped` — markup contains `?$staticlink$`
     *   placeholders but `ctx.pageLibraryDomain` was not configured, so
     *   the placeholder is left in the source. Fires once per process
     *   regardless of how many markup attributes hit it (tracked via the
     *   {@code typeId}/{@code attrId} fields, both empty strings, in the
     *   {@code warnOnce} dedup key).
     */
    kind:
        | 'malformed-image'
        | 'malformed-file'
        | 'malformed-cms-record'
        | 'cms-record-depth-exceeded'
        | 'unknown-attribute-type'
        | 'staticlink-rewrite-skipped';
    /** Human-readable message — safe to log directly. */
    message: string;
    /** Component type id the offending attribute belongs to. */
    typeId: string;
    /** Attribute id within the component. */
    attrId: string;
    /** The attribute's declared type, when known. Empty for inner cms_record entries that don't carry a type. */
    attrType: string;
}

/**
 * Slim attribute definition used by the resolver to dispatch by type.
 * Mirrors the fields {@code AttributeDefinition} ships in SCAPI's
 * `componentTypes` map. Defined here so the resolver doesn't take a
 * dependency on the larger SCAPI generated types.
 */
export interface AttributeDefinition {
    /** Attribute identifier as authored by the merchant (e.g. `"hero"`). */
    id: string;
    /**
     * Lower-case attribute type identifier matching ECOM's
     * {@code AttributeDefinition.Type#getID}. Examples:
     * `"string"`, `"text"`, `"image"`, `"markup"`, `"file"`, `"cms_record"`.
     */
    type: string;
    /**
     * Default value declared on the attribute definition. Used by component
     * data composition as a fallback when neither the active locale nor the
     * fallback locale has a value for this attribute (see
     * {@code processPage}'s `visitComponent`). The shape is whatever the
     * attribute's `type` would normally hold — a string for `string`/`text`,
     * an envelope for `image`/`file`, etc.
     */
    defaultValue?: unknown;
}

/**
 * Image envelope wire shape emitted by ECOM at manifest build time. Built
 * by {@code ManifestService.serializeImageAttribute}. The {@code media}
 * sub-object carries the library domain segment and the host-agnostic path;
 * MRT stamps the URL using {@link AttributeResolutionContext.resolveMediaUrl}.
 */
interface ImageEnvelope {
    focalPoint?: { x: number; y: number };
    metaData?: { width: number; height: number };
    media: { libraryDomain: string; path: string };
}

/**
 * Wire shape MRT emits after host-stamping. Matches the SCAPI `ImageWO_v1`
 * shape: focal point, metadata, and a fully-qualified URL — no `media`
 * sub-object, no top-level `path`.
 */
interface ResolvedImage {
    focalPoint?: { x: number; y: number };
    metaData?: { width: number; height: number };
    url: string;
}

/**
 * Module-scoped dedup set for unknown-type / malformed-envelope warnings.
 * Keyed by `${kind}|${typeId}|${attrId}|${attrType}` so two different
 * issues on the same attribute (e.g. malformed-image then later
 * unknown-type) both fire once.
 */
const warnedKeys = new Set<string>();

/**
 * Routes a structured warning to the consumer's `onWarn` handler at most
 * once per `(kind, typeId, attrId, attrType)` triple. When no handler is
 * configured the runtime stays silent — production callers are expected to
 * supply a handler.
 */
function warnOnce(
    ctx: AttributeResolutionContext,
    kind: AttributeResolutionWarning['kind'],
    typeId: string,
    attrId: string,
    attrType: string,
    message: string
): void {
    if (!ctx.onWarn) return;

    const key = `${kind}|${typeId}|${attrId}|${attrType}`;
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);

    ctx.onWarn({ kind, message, typeId, attrId, attrType });
}

/**
 * Test-only: clears the dedup set so repeated runs of the same key inside a
 * test process can each emit a warning. Production callers should never
 * import this — it's intentionally unexported from the package barrel.
 *
 * @internal
 */
export function _resetWarnedKeysForTesting(): void {
    warnedKeys.clear();
}

/**
 * Returns true when `value` is shaped like an {@link ImageEnvelope}. Used
 * during structural dispatch (when `componentTypes` is unavailable) to
 * recognize image attributes without `attrDef.type`.
 */
function isImageEnvelope(value: unknown): value is ImageEnvelope {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    const media = candidate.media as Record<string, unknown> | undefined;

    return (
        media != null &&
        typeof media === 'object' &&
        typeof media.libraryDomain === 'string' &&
        typeof media.path === 'string'
    );
}

/**
 * Converts an {@link ImageEnvelope} to the resolved SCAPI shape by stamping
 * the URL. Returns the original value untouched if the envelope is
 * malformed (missing `media.libraryDomain` or `media.path`); a warning is
 * logged once per `(typeId, attrId, attrType)` triple so production logs
 * don't drown.
 */
function resolveImageAttribute(
    value: unknown,
    typeId: string,
    attrId: string,
    attrType: string,
    ctx: AttributeResolutionContext
): ResolvedImage | unknown {
    if (!isImageEnvelope(value)) {
        warnOnce(
            ctx,
            'malformed-image',
            typeId,
            attrId,
            attrType,
            'malformed image envelope, passing through unchanged'
        );

        return value;
    }

    const url = ctx.resolveMediaUrl({
        libraryDomain: value.media.libraryDomain,
        path: value.media.path,
        locale: ctx.locale,
    });

    const out: ResolvedImage = { url };

    if (value.focalPoint) {
        out.focalPoint = value.focalPoint;
    }

    if (value.metaData) {
        out.metaData = value.metaData;
    }

    return out;
}

/**
 * File envelope wire shape emitted by ECOM at manifest build time.
 * Contains only the `media` sub-object with library domain and path.
 */
interface FileEnvelope {
    media: { libraryDomain: string; path: string };
}

function isFileEnvelope(value: unknown): value is FileEnvelope {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    const media = candidate.media as Record<string, unknown> | undefined;

    return (
        media != null &&
        typeof media === 'object' &&
        typeof media.libraryDomain === 'string' &&
        typeof media.path === 'string' &&
        !('focalPoint' in candidate || 'metaData' in candidate)
    );
}

/**
 * Resolves a file envelope to a URL string. Matches SCAPI's
 * `mediaFile.getAbsURL().toString()` — file attributes emit a plain URL
 * string, not an object envelope.
 */
function resolveFileAttribute(
    value: unknown,
    typeId: string,
    attrId: string,
    ctx: AttributeResolutionContext
): string | unknown {
    if (!isFileEnvelope(value)) {
        warnOnce(ctx, 'malformed-file', typeId, attrId, 'file', 'malformed file envelope, passing through unchanged');
        return value;
    }

    return ctx.resolveMediaUrl({
        libraryDomain: value.media.libraryDomain,
        path: value.media.path,
        locale: ctx.locale,
    });
}

/**
 * CMS Record envelope wire shape. Contains the record's own type
 * (with attribute definitions) and the nested attribute map.
 */
interface CmsRecordEnvelope {
    id: string;
    type: { id: string; name?: string; attributeDefinitions: AttributeDefinition[] };
    attributes: Record<string, unknown>;
}

const MAX_CMS_RECORD_DEPTH = 10;

function isCmsRecordEnvelope(value: unknown): value is CmsRecordEnvelope {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    if (typeof candidate.id !== 'string') {
        return false;
    }

    const type = candidate.type as Record<string, unknown> | undefined;

    if (!type || typeof type !== 'object' || typeof type.id !== 'string') {
        return false;
    }

    if (!Array.isArray(type.attributeDefinitions)) {
        return false;
    }

    return candidate.attributes != null && typeof candidate.attributes === 'object';
}

function resolveCmsRecordAttribute(
    value: unknown,
    typeId: string,
    attrId: string,
    ctx: AttributeResolutionContext,
    depth: number
): unknown {
    if (value == null) {
        return value;
    }

    if (!isCmsRecordEnvelope(value)) {
        warnOnce(
            ctx,
            'malformed-cms-record',
            typeId,
            attrId,
            'cms_record',
            'malformed cms_record envelope, passing through unchanged'
        );
        return value;
    }

    if (depth >= MAX_CMS_RECORD_DEPTH) {
        warnOnce(
            ctx,
            'cms-record-depth-exceeded',
            typeId,
            attrId,
            'cms_record',
            `cms_record nesting depth exceeded (max ${MAX_CMS_RECORD_DEPTH}), passing through unchanged`
        );
        return value;
    }

    const innerDefs = value.type.attributeDefinitions;
    const resolvedAttrs = resolveCmsRecordInnerAttributes(value.attributes, typeId, innerDefs, ctx, depth + 1);

    return {
        id: value.id,
        type: value.type,
        attributes: resolvedAttrs,
    };
}

function resolveCmsRecordInnerAttributes(
    data: Record<string, unknown>,
    typeId: string,
    defs: AttributeDefinition[],
    ctx: AttributeResolutionContext,
    depth: number
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const defsById = new Map<string, AttributeDefinition>();

    for (const def of defs) {
        defsById.set(def.id, def);
    }

    for (const [attrId, value] of Object.entries(data)) {
        const def = defsById.get(attrId);

        if (!def) {
            out[attrId] = value;
            continue;
        }

        out[attrId] = dispatchCmsRecordInner(value, typeId, attrId, def, ctx, depth);
    }

    return out;
}

function dispatchCmsRecordInner(
    value: unknown,
    typeId: string,
    attrId: string,
    attrDef: AttributeDefinition,
    ctx: AttributeResolutionContext,
    depth: number
): unknown {
    if (attrDef.type === 'cms_record') {
        return resolveCmsRecordAttribute(value, typeId, attrId, ctx, depth);
    }

    return dispatchByType(value, typeId, attrId, attrDef, ctx);
}

/**
 * Resolves every attribute on a component's `data` map to the wire shape
 * SCAPI `getPage` would have returned.
 *
 * Dispatch is type-driven when {@code typeAttributeDefinitions} is supplied.
 * Otherwise the resolver inspects each value structurally — it recognizes
 * the image envelope by the presence of `media.libraryDomain` and
 * `media.path` and passes everything else through unchanged.
 *
 * Forward-compatibility (Q9): unknown attribute types pass through. Each
 * `(typeId, attrId, attrType)` triple is logged once per process via a
 * module-scoped dedup set.
 *
 * @param data                      attribute map to resolve, already
 *                                  locale-merged + data-binding-resolved by
 *                                  {@link processPage}.
 * @param typeId                    component type identifier, used as part
 *                                  of the dedup key for warnings. Empty
 *                                  string is acceptable for anonymous
 *                                  callers (page-level data).
 * @param typeAttributeDefinitions  attribute definitions for {@code typeId}
 *                                  from `manifest.componentTypes`. When
 *                                  omitted, falls back to structural
 *                                  detection of the image envelope.
 * @param ctx                       per-request resolution surface.
 * @returns a new map with each attribute's value replaced by the resolved
 *          wire shape; pass-through for any attribute type the resolver
 *          doesn't yet recognize.
 */
export function resolveAttributeValues(
    data: Record<string, unknown> | undefined | null,
    typeId: string,
    typeAttributeDefinitions: Record<string, AttributeDefinition> | undefined,
    ctx: AttributeResolutionContext
): Record<string, unknown> {
    if (!data) {
        return {};
    }

    const out: Record<string, unknown> = {};

    if (typeAttributeDefinitions && Object.keys(typeAttributeDefinitions).length > 0) {
        for (const [attrId, value] of Object.entries(data)) {
            const def = typeAttributeDefinitions[attrId];

            if (!def) {
                out[attrId] = value;
                continue;
            }

            out[attrId] = dispatchByType(value, typeId, attrId, def, ctx);
        }

        return out;
    }

    // No type definitions to dispatch on. Use structural detection for the
    // one attribute we know how to recognize (image envelope) and pass
    // everything else through.
    for (const [attrId, value] of Object.entries(data)) {
        if (isImageEnvelope(value)) {
            out[attrId] = resolveImageAttribute(value, typeId, attrId, 'image', ctx);
        } else {
            out[attrId] = value;
        }
    }

    return out;
}

/**
 * Type-driven dispatch. Unknown types fall through with a deduped warning
 * (Q9) — the principle is that a runtime older than ECOM should still
 * produce *something* rather than dropping the value.
 */
function dispatchByType(
    value: unknown,
    typeId: string,
    attrId: string,
    attrDef: AttributeDefinition,
    ctx: AttributeResolutionContext
): unknown {
    switch (attrDef.type) {
        case 'image':
            return resolveImageAttribute(value, typeId, attrId, attrDef.type, ctx);

        case 'markup':
            return typeof value === 'string' ? rewriteMarkup(value, ctx) : value;

        case 'file':
            return resolveFileAttribute(value, typeId, attrId, ctx);

        case 'cms_record':
            return resolveCmsRecordAttribute(value, typeId, attrId, ctx, 0);

        case 'string':
        case 'text':
        case 'url':
        case 'boolean':
        case 'integer':
        case 'enum':
        case 'custom':
        case 'product':
        case 'category':
        case 'page':
            return value;

        default:
            warnOnce(
                ctx,
                'unknown-attribute-type',
                typeId,
                attrId,
                attrDef.type,
                'unknown attribute type, passing through unchanged'
            );

            return value;
    }
}
