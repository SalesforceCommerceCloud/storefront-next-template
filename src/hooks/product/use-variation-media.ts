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
import { useMemo } from 'react';
import type { ShopperProducts } from '@/scapi';

/**
 * Per-combination product media, declared on a master product's `c_variationMedia` custom attribute.
 *
 * SCAPI's `getProduct` only surfaces per-value product images for ONE variation axis (the catalog
 * `image-settings/variation-attribute-id`), so a product varying on two-or-more axes (e.g. a watch's
 * dial + strap) cannot express a per-combination hero through standard `imageGroups`. `c_variationMedia`
 * fills that gap: a single JSON attribute mapping each SCAPI-style image-group `viewType` to a list of
 * match rules. The most-specific rule whose `match` is fully satisfied by the current selection wins,
 * and its images drive the gallery for that `viewType`.
 *
 * This mechanism is generic — it is gated purely on the presence of `c_variationMedia` and knows nothing
 * about any specific catalog, axis, or brand. Any product that ships the attribute participates.
 *
 * @example product.c_variationMedia (a JSON string on the master, or an already-parsed object)
 * ```json
 * {
 *   "large": [
 *     {
 *       "match": { "dialColor": "white", "bandType": "leather_black" },
 *       "images": [{ "path": "images/products/watch-white-leather-black.webp", "alt": "White dial" }]
 *     }
 *   ]
 * }
 * ```
 */

/** One image within a match rule. `path` is a catalog-relative static path (e.g. `images/products/x.webp`). */
export interface VariationMediaImage {
    /** Catalog-relative path to the static asset, resolved against a sibling standard image link. */
    path: string;
    /** Optional alt text; falls back to the product name downstream when absent. */
    alt?: string;
}

/** A match rule: variation-attribute constraints (1..N axes) plus the images to show when satisfied. */
export interface VariationMediaEntry {
    /** Variation-attribute id → value, matched against the current selection. More keys = more specific. */
    match: Record<string, string>;
    /** Images to display for this `viewType` when `match` is satisfied. */
    images: VariationMediaImage[];
}

/** Parsed `c_variationMedia`: SCAPI-style image-group `viewType` → ordered list of match rules. */
export type VariationMediaMap = Record<string, VariationMediaEntry[]>;

interface UseVariationMediaProps {
    product: ShopperProducts.schemas['Product'];
    selectedAttributes?: Record<string, string>;
}

interface UseVariationMediaReturn {
    /**
     * Resolved images keyed by `viewType`, shaped like SCAPI `imageGroups` images so they drop straight
     * into the {@link useProductImages} gallery pipeline. Only `viewType`s with a satisfied match rule and
     * at least one resolvable image appear; everything else is omitted so the caller falls back to the
     * product's standard `imageGroups`. Empty (`{}`) when the product has no `c_variationMedia`, the JSON
     * is invalid, or no standard raw-static link exists to borrow a version prefix from.
     */
    imagesByViewType: Record<string, ShopperProducts.schemas['Image'][]>;
}

/**
 * Object keys that must never be assigned onto a plain object: `__proto__` invokes the legacy prototype
 * setter (prototype pollution) and `constructor`/`prototype` shadow built-ins. The keys come from merchant
 * JSON, so they are rejected before assignment — a real viewType or variation-attribute id is never one of these.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Captures a standard SFCC static image link's version prefix — everything up to and including the
 * `/dw<8-hex-version>/` segment, e.g. `https://host/on/demandware.static/-/Sites-cat/default/dw520c5db8/`.
 * Non-greedy so the FIRST version segment wins. Deliberately does NOT match DIS-transformed URLs
 * (`/dw/image/v2/…`) — `dw` there is followed by `/`, not 8 hex chars — so DIS links resolve to `undefined`.
 */
const DW_VERSION_PREFIX_REGEX = /^(https?:\/\/.+?\/dw[0-9a-f]{8}\/)/i;

/**
 * Resolve a catalog-relative `c_variationMedia` path to an absolute, versioned URL by borrowing the version
 * prefix from a sibling standard image link.
 *
 * The `c_variationMedia` files are uploaded to the same catalog static folder as the product's standard
 * images, but SCAPI never surfaces them (they are not attached to an image group). We therefore reconstruct
 * their URL from an existing standard link: truncate it right after the `/dw<version>/` segment and append
 * the relative path.
 *
 * Returns `undefined` when there is no usable prefix to borrow — either `standardLink` is absent, or it is
 * not a raw-static link (e.g. a DIS-transformed URL). The caller then falls back to the standard gallery.
 *
 * // TODO(dis): DIS-on instances serve product images as DIS-transformed URLs (`/dw/image/v2/…`), which carry
 * // no borrowable `/dw<version>/` static segment. Supporting those requires building the DIS transform URL
 * // from the realm + relative path instead of a string truncation; until then this returns `undefined` on DIS
 * // links and the product falls back to its standard `imageGroups`.
 *
 * @param standardLink - A standard SCAPI image link to borrow the version prefix from (may be undefined).
 * @param relativePath - Catalog-relative path from a `c_variationMedia` entry (e.g. `images/products/x.webp`).
 * @returns The absolute versioned URL, or `undefined` when no prefix can be borrowed / the path is empty.
 */
export function resolveVariationMediaUrl(standardLink: string | undefined, relativePath: string): string | undefined {
    if (typeof standardLink !== 'string' || !standardLink) {
        return undefined;
    }
    const trimmedPath = typeof relativePath === 'string' ? relativePath.trim() : '';
    if (!trimmedPath) {
        return undefined;
    }
    const match = DW_VERSION_PREFIX_REGEX.exec(standardLink);
    if (!match) {
        return undefined;
    }
    // match[1] includes the trailing slash after the version segment; strip any leading slash on the path
    // so the two join cleanly regardless of whether the merchant wrote `images/...` or `/images/...`.
    return match[1] + trimmedPath.replace(/^\/+/, '');
}

/** A value is a valid `c_variationMedia` image only if it is an object with a string `path`. */
const isValidMediaImage = (value: unknown): value is VariationMediaImage =>
    typeof value === 'object' && value !== null && typeof (value as { path?: unknown }).path === 'string';

/** A value is a valid match entry only if it has a string→string `match` map and an array of valid images. */
const isValidEntry = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const { match, images } = value as { match?: unknown; images?: unknown };
    if (typeof match !== 'object' || match === null || Array.isArray(match)) {
        return false;
    }
    if (!Object.values(match).every((v) => typeof v === 'string')) {
        return false;
    }
    return Array.isArray(images) && images.some(isValidMediaImage);
};

/**
 * Defensively parse the `c_variationMedia` custom attribute. SCAPI surfaces custom string attributes verbatim
 * (a JSON string), but tolerate an already-parsed object too. Returns `undefined` on any missing / malformed
 * input so callers fall back to the standard gallery. Each viewType/entry is validated and sanitized (unsafe
 * keys dropped) so malformed data can never synthesize a bogus image or pollute the prototype.
 */
export function parseVariationMedia(raw: unknown): VariationMediaMap | undefined {
    if (!raw) {
        return undefined;
    }

    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return undefined;
    }

    const validated: VariationMediaMap = {};
    for (const [viewType, entries] of Object.entries(parsed)) {
        if (UNSAFE_KEYS.has(viewType) || !Array.isArray(entries)) {
            continue;
        }
        const validEntries: VariationMediaEntry[] = entries.filter(isValidEntry).map((entry) => {
            const rawEntry = entry as { match: Record<string, unknown>; images: unknown[] };
            const match: Record<string, string> = {};
            for (const [key, value] of Object.entries(rawEntry.match)) {
                if (!UNSAFE_KEYS.has(key) && typeof value === 'string') {
                    match[key] = value;
                }
            }
            const images: VariationMediaImage[] = rawEntry.images.filter(isValidMediaImage).map((image) => ({
                path: image.path,
                ...(typeof image.alt === 'string' ? { alt: image.alt } : {}),
            }));
            return { match, images };
        });
        if (validEntries.length > 0) {
            validated[viewType] = validEntries;
        }
    }

    return Object.keys(validated).length > 0 ? validated : undefined;
}

/**
 * Choose the match entry whose `match` is fully satisfied by the selection and has the greatest number of
 * match keys (most specific). Ties resolve to the first satisfied entry in array order (strict `>` never
 * replaces an equal-specificity earlier winner). Returns `undefined` when no entry is satisfied.
 *
 * Entries with an EMPTY `match` (`{}`) are ignored: a zero-key match is vacuously satisfied by any
 * selection, so it would act as an always-on default that shadows the product's standard gallery — a
 * merchant could unintentionally suppress it wholesale. Per-viewType defaults are intentionally not
 * supported through an empty match.
 */
const chooseEntry = (
    entries: VariationMediaEntry[],
    selections: Record<string, string>
): VariationMediaEntry | undefined => {
    let best: VariationMediaEntry | undefined;
    let bestKeyCount = 0;
    for (const entry of entries) {
        const keys = Object.keys(entry.match);
        if (keys.length === 0) continue; // ignore empty match — never an always-on default
        const satisfied = keys.every((key) => selections[key] === entry.match[key]);
        if (satisfied && keys.length > bestKeyCount) {
            best = entry;
            bestKeyCount = keys.length;
        }
    }
    return best;
};

/**
 * Resolves per-combination product media from a product's `c_variationMedia` attribute, mirroring the
 * signature and style of {@link useProductImages}. Feeds {@link useProductImages}, which prefers these images
 * over standard `imageGroups` for any `viewType` they cover.
 *
 * @example
 * ```tsx
 * const { imagesByViewType } = useVariationMedia({ product, selectedAttributes });
 * const heroImages = imagesByViewType.large; // resolved per-combination hero, or undefined
 * ```
 *
 * @param props - Configuration object
 * @param props.product - Product that may declare a `c_variationMedia` attribute
 * @param props.selectedAttributes - Selected variation attributes (values as in `variationAttributes[].values[].value`)
 * @returns Resolved images keyed by `viewType`; empty (`{}`) when the product ships no usable variation media
 */
export function useVariationMedia({ product, selectedAttributes }: UseVariationMediaProps): UseVariationMediaReturn {
    // A standard raw-static link to borrow the version prefix from. Scan every image group's images for the
    // first link that carries a `/dw<version>/` segment; DIS-transformed links are skipped (no borrowable prefix).
    const standardLink = useMemo(() => {
        for (const group of product.imageGroups ?? []) {
            for (const image of group.images ?? []) {
                if (image.link && DW_VERSION_PREFIX_REGEX.test(image.link)) {
                    return image.link;
                }
            }
        }
        return undefined;
    }, [product.imageGroups]);

    const imagesByViewType = useMemo(() => {
        const media = parseVariationMedia((product as { c_variationMedia?: unknown }).c_variationMedia);
        // No declared media, or no raw-static link to borrow from (e.g. DIS-only URLs) — fall back entirely.
        if (!media || !standardLink) {
            return {};
        }

        const selections = selectedAttributes ?? {};
        const result: Record<string, ShopperProducts.schemas['Image'][]> = {};
        for (const [viewType, entries] of Object.entries(media)) {
            const chosen = chooseEntry(entries, selections);
            if (!chosen) {
                continue;
            }
            const images = chosen.images.reduce<ShopperProducts.schemas['Image'][]>((acc, image) => {
                const link = resolveVariationMediaUrl(standardLink, image.path);
                if (link) {
                    acc.push({ link, disBaseLink: link, alt: image.alt } as ShopperProducts.schemas['Image']);
                }
                return acc;
            }, []);
            if (images.length > 0) {
                result[viewType] = images;
            }
        }
        return result;
    }, [product, standardLink, selectedAttributes]);

    return { imagesByViewType };
}
