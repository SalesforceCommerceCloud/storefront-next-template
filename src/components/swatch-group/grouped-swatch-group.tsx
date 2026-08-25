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
import { useId, useState } from 'react';
import type { ShopperProducts } from '@/scapi';
import { cn } from '@/lib/utils';
import { Swatch } from './swatch';
import { DynamicImage } from '@/components/dynamic-image';

/**
 * Split a categorized swatch display name of the form `"Label, Family"` on the FIRST comma.
 * The part before the comma is the short label shown on the swatch; the part after it is the
 * family used for the filter tabs. A name with no comma has no family (renders in every tab).
 *
 * @example splitGroupedSwatchName('Navy, Velvet') // { label: 'Navy', family: 'Velvet' }
 * @example splitGroupedSwatchName('Charcoal')     // { label: 'Charcoal' }
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const splitGroupedSwatchName = (name: string): { label: string; family?: string } => {
    const idx = name.indexOf(',');
    if (idx === -1) {
        return { label: name.trim() || name };
    }
    const label = name.slice(0, idx).trim();
    const family = name.slice(idx + 1).trim();
    return { label: label || name.trim(), family: family || undefined };
};

/** A single option for the grouped selector. Values are pre-resolved by the caller. */
export interface GroupedSwatchValue {
    /** Full localized display name, e.g. "Navy, Velvet". Split into label + family for display. */
    name: string;
    /** The variation value id (e.g. "navy"). */
    value: string;
    /** Navigation target used in uncontrolled (URL) mode. */
    href?: string;
    /** Swatch image; when present the option renders as an image tile. */
    image?: ShopperProducts.schemas['Image'];
    /** Whether this value is available to sell. */
    orderable?: boolean;
    /** Localized per-option hint (e.g. a price delta "+US$200"), rendered verbatim. */
    description?: string;
}

interface GroupedSwatchGroupProps {
    /** Attribute label, e.g. "Fabric". */
    label: string;
    /** Selected value's short label, shown beside the header (mirrors SwatchGroup's displayName). */
    displayName?: string;
    /** Currently selected value id. */
    value?: string;
    values: GroupedSwatchValue[];
    /** Selection callback for controlled/local mode. Ignored when `useHref` is set. */
    handleChange?: (value: string) => void;
    /** When true, swatches navigate via `href` (uncontrolled/URL mode) instead of calling `handleChange`. */
    useHref?: boolean;
    /** Localized label for the "all families" tab. @default 'All' */
    allLabel?: string;
    /** Translated out-of-stock suffix forwarded to disabled swatches. */
    outOfStockSuffix?: string;
    /**
     * When true, suppress the internal label header — the caller supplies the header elsewhere
     * (e.g. a CollapsibleSection summary). The radiogroup stays labeled via `aria-label`.
     */
    hideHeader?: boolean;
    className?: string;
}

/**
 * A two-level ("categorized") swatch selector: a family filter row (`["All", ...families]`) above
 * a set of swatches filtered to the selected family. Each option's display name is split on the
 * first comma into a short label (shown on the swatch) and a family (drives the tabs). Image swatches
 * reuse the `image` tile shape when the value carries a swatch image.
 *
 * Presentational and config-agnostic — the caller (PDP) decides when to use it (gated on
 * `uiConfig.pages.product.groupedSwatchAxes`) and pre-resolves each value's href / orderability.
 */
export const GroupedSwatchGroup = ({
    label,
    displayName,
    value,
    values,
    handleChange,
    useHref = false,
    allLabel = 'All',
    outOfStockSuffix,
    hideHeader = false,
    className,
}: GroupedSwatchGroupProps) => {
    const labelId = `grouped-swatch-label-${useId()}`;
    const [activeFamily, setActiveFamily] = useState<string>('all');

    const decorated = values.map((v) => ({ ...v, ...splitGroupedSwatchName(v.name) }));
    const families = Array.from(new Set(decorated.map((d) => d.family).filter((f): f is string => Boolean(f))));
    // A family that no longer exists (e.g. data change) falls back to showing everything.
    const familyIsValid = activeFamily === 'all' || families.includes(activeFamily);
    const effectiveFamily = familyIsValid ? activeFamily : 'all';
    const visible = effectiveFamily === 'all' ? decorated : decorated.filter((d) => d.family === effectiveFamily);

    const tabs = ['all', ...families];

    return (
        <div data-slot="grouped-swatch-group" className={cn('flex flex-col gap-3', className)}>
            {!hideHeader && (
                <div
                    id={labelId}
                    className="flex items-center gap-2 text-base font-semibold leading-6 text-card-foreground">
                    <span>{label}:</span>
                    {displayName && <span>{displayName}</span>}
                </div>
            )}

            {families.length > 0 && (
                <div role="group" aria-label={label} className="flex flex-wrap gap-2" data-slot="swatch-family-filters">
                    {tabs.map((family) => {
                        const active = effectiveFamily === family;
                        return (
                            <button
                                key={family}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setActiveFamily(family)}
                                data-slot="swatch-family-filter"
                                className={cn(
                                    'rounded-ui px-2.5 py-1 text-xs font-medium transition-colors',
                                    active
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted-hover'
                                )}>
                                {family === 'all' ? allLabel : family}
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                role="radiogroup"
                aria-labelledby={hideHeader ? undefined : labelId}
                aria-label={hideHeader ? label : undefined}
                className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
                data-slot="grouped-swatch-container">
                {visible.map(({ value: swatchValue, label: shortLabel, image, href, orderable, description }) => {
                    const selected = swatchValue === value;
                    // Image swatches fill their grid cell (`imageTile`); non-image values keep the label tile.
                    const swatchShape = image ? 'imageTile' : 'label';
                    return (
                        <div
                            key={swatchValue}
                            data-slot="grouped-swatch-option"
                            className="flex flex-col gap-1 text-left">
                            <Swatch
                                href={useHref ? href : undefined}
                                handleSelect={useHref ? undefined : handleChange}
                                disabled={!orderable}
                                value={swatchValue}
                                name={shortLabel}
                                selected={selected}
                                isFocusable
                                shape={swatchShape}
                                outOfStockSuffix={outOfStockSuffix}>
                                {image ? (
                                    <DynamicImage
                                        src={image.disBaseLink || image.link || ''}
                                        alt={image.alt || shortLabel}
                                        widths={[48, 64, 96]}
                                        className="absolute inset-0 h-full w-full"
                                        imageProps={{ className: 'h-full w-full object-cover' }}
                                    />
                                ) : (
                                    <span className="text-xs font-medium">{shortLabel}</span>
                                )}
                            </Swatch>
                            {/* Image tiles show no text inside the tile, so surface the short label below it. */}
                            {image && (
                                <span
                                    data-slot="swatch-short-label"
                                    className="truncate text-xs font-medium text-foreground">
                                    {shortLabel}
                                </span>
                            )}
                            {description && (
                                <span
                                    data-slot="swatch-description"
                                    className="text-[length:var(--swatch-description-size,0.75rem)] text-muted-foreground">
                                    {description}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

GroupedSwatchGroup.displayName = 'GroupedSwatchGroup';
