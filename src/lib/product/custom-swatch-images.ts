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
import { resolveAssetUrl } from '@/lib/utils';

/**
 * Custom swatch-image support for variation axes that SCAPI does not natively decorate with a
 * swatch image. SFCC only expands ONE image-swatch axis (typically `color`, or `fabric` here) into
 * `VariationAttributeValue.image`; other axes (e.g. `size`, `legStyle`) can carry swatch imagery via
 * a custom master attribute `c_swatchImages` — a JSON-string map of `{ axisId: { value: path } }`.
 *
 * @example
 * // product.c_swatchImages (raw JSON string on the master)
 * '{"size":{"loveseat":"images/products/size-loveseat.webp"},"legStyle":{"tapered":"images/products/leg-tapered.webp"}}'
 */

/** Parsed shape: axis id → (variation value → image path). */
export type CustomSwatchImageMap = Record<string, Record<string, string>>;

/**
 * Axis ids that must never be used as keys on the accumulator: assigning `__proto__` to a plain
 * object invokes the legacy prototype setter (prototype pollution), and `constructor`/`prototype`
 * shadow built-ins. The ids come from merchant JSON, so they are rejected before assignment — a real
 * furniture axis is never named any of these.
 */
const UNSAFE_AXIS_IDS = new Set(['__proto__', 'constructor', 'prototype']);

/** A value is a valid swatch axis only if it is a plain object whose every entry maps to a string. */
const isSwatchAxis = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((path) => typeof path === 'string');

/**
 * Defensively parse the `c_swatchImages` custom attribute. SCAPI surfaces custom string attributes
 * verbatim (a JSON string), but tolerate an already-parsed object too. Returns `undefined` on any
 * missing / malformed input so callers fall back to text swatches.
 *
 * The root object is validated axis-by-axis: an axis whose value is not a `{ value: string }` map
 * (e.g. `{ size: 'bad' }`) is dropped rather than trusted — otherwise a downstream lookup could index
 * into the stray string and synthesize a bogus image path. Returns `undefined` when no valid axis
 * remains.
 */
export const parseCustomSwatchImages = (raw: unknown): CustomSwatchImageMap | undefined => {
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

    const validated: CustomSwatchImageMap = {};
    for (const [axisId, axis] of Object.entries(parsed)) {
        if (UNSAFE_AXIS_IDS.has(axisId)) continue;
        if (isSwatchAxis(axis)) {
            validated[axisId] = axis;
        }
    }

    return Object.keys(validated).length > 0 ? validated : undefined;
};

/**
 * Resolve a `c_swatchImages` path to a URL the storefront image pipeline can render.
 *
 * The DIS pipeline (`toImageUrl` / `<DynamicImage>`) can only re-transform an EXISTING absolute
 * SCAPI URL — it cannot build one from a hostless catalog path (there is no host/realm to derive),
 * so a bare `images/products/size-loveseat.webp` would resolve relative to the current route and
 * break. We therefore serve these assets from the vertical's public overlay (same mechanism as the
 * hero images) by mapping the path to `/images/<basename>`.
 *
 * The mapped local path is then run through `resolveAssetUrl`, which prepends the Managed Runtime
 * bundle prefix at runtime (`/mobify/bundle/<id>/client/…`). MRT does NOT serve these assets at the
 * site root — only under the bundle path — so a raw `/images/<basename>` would 404 (and fall through
 * to SSR) on a deployed environment while working locally. `resolveAssetUrl` leaves `http(s)`/`data`
 * URLs untouched and is a no-op in local dev.
 *
 * - Already root-absolute (`/images/…`) → bundle-prefixed via `resolveAssetUrl`.
 * - Full URL (`http(s)://…`) → returned unchanged.
 * - Bare catalog path (`images/products/size-loveseat.webp`) → `/images/size-loveseat.webp`, bundle-prefixed.
 * - Empty / non-string → `undefined`.
 */
export const resolveCustomSwatchImagePath = (path: unknown): string | undefined => {
    if (typeof path !== 'string') {
        return undefined;
    }
    const trimmed = path.trim();
    if (!trimmed) {
        return undefined;
    }
    if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)) {
        return resolveAssetUrl(trimmed);
    }
    const basename = trimmed.split('/').pop();
    return basename ? resolveAssetUrl(`/images/${basename}`) : undefined;
};

/**
 * Look up a custom swatch image for a specific axis + value and resolve it to a renderable URL.
 * Returns `undefined` when the map, axis, value, or path is absent — the value then renders as text.
 */
export const getCustomSwatchImageUrl = (
    map: CustomSwatchImageMap | undefined,
    axisId: string,
    value: string
): string | undefined => {
    if (!map || !axisId || !value) {
        return undefined;
    }
    return resolveCustomSwatchImagePath(map[axisId]?.[value]);
};
