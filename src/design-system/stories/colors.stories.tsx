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
import { useLayoutEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * `Theme/Colors` — the canonical color-token reference for the active theme.
 *
 * Each swatch renders via a **literal `bg-*` utility class** (e.g. `bg-primary`),
 * never an inline `style` and never a class built from data. Two rules make this
 * work, and they're worth understanding:
 *   1. The token bridge in `theme/tailwind.css` is a `@theme inline {}` block, so
 *      Tailwind compiles `bg-primary` straight to `background-color: var(--primary)`
 *      — i.e. it resolves to the live `:root` source token, per the active theme.
 *      (Reading `var(--color-primary)` directly would NOT work: the `--color-*`
 *      bridge names are inlined into utilities, not emitted as `:root` variables.)
 *   2. Tailwind's scanner only emits utilities it sees as **literal** strings in
 *      source. A class built from data (`` `bg-${name}` ``) is never generated and
 *      renders blank. So every class below is stored as a literal string in the
 *      data array; the scanner picks them up there.
 *
 * The list is every `--color-*` bridge entry the canonical (fashion) theme
 * defines (111 tokens), in the order they appear in `theme/tailwind.css`. The
 * card border keeps near-white / transparent swatches legible on the white
 * canvas (no hard-coded values either way).
 */

/** One token: the literal `bg-*` utility that paints the chip + its source name. */
type ColorToken = {
    /** Literal Tailwind utility, e.g. `bg-primary`. MUST be a literal string. */
    className: string;
    /** Source `:root` token name shown as the label, e.g. `--primary`. */
    token: string;
};

/** One labeled color group rendered as an `<h2>` + responsive swatch grid. */
type ColorGroup = {
    /** Visible group heading (also the swatch grid's accessible name). */
    heading: string;
    tokens: ColorToken[];
};

const COLOR_GROUPS: ColorGroup[] = [
    {
        heading: 'Core',
        tokens: [
            { className: 'bg-background', token: '--background' },
            { className: 'bg-foreground', token: '--foreground' },
            { className: 'bg-card', token: '--card' },
            { className: 'bg-card-foreground', token: '--card-foreground' },
            { className: 'bg-popover', token: '--popover' },
            { className: 'bg-popover-foreground', token: '--popover-foreground' },
            { className: 'bg-primary', token: '--primary' },
            { className: 'bg-primary-foreground', token: '--primary-foreground' },
            { className: 'bg-secondary', token: '--secondary' },
            { className: 'bg-secondary-foreground', token: '--secondary-foreground' },
            { className: 'bg-tertiary', token: '--tertiary' },
            { className: 'bg-tertiary-foreground', token: '--tertiary-foreground' },
            { className: 'bg-muted', token: '--muted' },
            { className: 'bg-muted-foreground', token: '--muted-foreground' },
            { className: 'bg-muted-hover', token: '--muted-hover' },
            { className: 'bg-accent', token: '--accent' },
            { className: 'bg-accent-foreground', token: '--accent-foreground' },
            { className: 'bg-border', token: '--border' },
            { className: 'bg-border-subtle', token: '--border-subtle' },
            { className: 'bg-input', token: '--input' },
            { className: 'bg-ring', token: '--ring' },
            { className: 'bg-separator', token: '--separator' },
            { className: 'bg-separator-foreground', token: '--separator-foreground' },
            { className: 'bg-rating', token: '--rating' },
            { className: 'bg-rating-foreground', token: '--rating-foreground' },
        ],
    },
    {
        heading: 'Sidebar',
        tokens: [
            { className: 'bg-sidebar', token: '--sidebar' },
            { className: 'bg-sidebar-foreground', token: '--sidebar-foreground' },
            { className: 'bg-sidebar-primary', token: '--sidebar-primary' },
            { className: 'bg-sidebar-primary-foreground', token: '--sidebar-primary-foreground' },
            { className: 'bg-sidebar-accent', token: '--sidebar-accent' },
            { className: 'bg-sidebar-accent-foreground', token: '--sidebar-accent-foreground' },
            { className: 'bg-sidebar-border', token: '--sidebar-border' },
            { className: 'bg-sidebar-ring', token: '--sidebar-ring' },
        ],
    },
    {
        heading: 'Status & feedback',
        tokens: [
            { className: 'bg-destructive', token: '--destructive' },
            { className: 'bg-destructive-foreground', token: '--destructive-foreground' },
            { className: 'bg-success', token: '--success' },
            { className: 'bg-success-foreground', token: '--success-foreground' },
            { className: 'bg-info', token: '--info' },
            { className: 'bg-info-foreground', token: '--info-foreground' },
            { className: 'bg-warning', token: '--warning' },
            { className: 'bg-warning-foreground', token: '--warning-foreground' },
            { className: 'bg-warning-bg', token: '--warning-bg' },
            { className: 'bg-warning-border', token: '--warning-border' },
            { className: 'bg-active-bg', token: '--active-bg' },
            { className: 'bg-active-foreground', token: '--active-foreground' },
            { className: 'bg-account-action-destructive', token: '--account-action-destructive' },
            { className: 'bg-account-action-destructive-foreground', token: '--account-action-destructive-foreground' },
            { className: 'bg-status-positive', token: '--status-positive' },
            { className: 'bg-status-warning', token: '--status-warning' },
            { className: 'bg-status-critical', token: '--status-critical' },
            { className: 'bg-status-critical-strong', token: '--status-critical-strong' },
            { className: 'bg-status-critical-bg', token: '--status-critical-bg' },
            { className: 'bg-status-critical-foreground', token: '--status-critical-foreground' },
            { className: 'bg-status-critical-border', token: '--status-critical-border' },
            { className: 'bg-status-info', token: '--status-info' },
        ],
    },
    {
        heading: 'Swatch',
        tokens: [
            { className: 'bg-swatch-group-bg', token: '--swatch-group-bg' },
            { className: 'bg-swatch-bg', token: '--swatch-bg' },
            { className: 'bg-swatch-bg-selected', token: '--swatch-bg-selected' },
            { className: 'bg-swatch-border', token: '--swatch-border' },
            { className: 'bg-swatch-border-selected', token: '--swatch-border-selected' },
            { className: 'bg-swatch-text', token: '--swatch-text' },
            { className: 'bg-swatch-text-selected', token: '--swatch-text-selected' },
        ],
    },
    {
        heading: 'Header & navigation',
        tokens: [
            { className: 'bg-header-background', token: '--header-background' },
            { className: 'bg-header-foreground', token: '--header-foreground' },
            { className: 'bg-header-border', token: '--header-border' },
            { className: 'bg-header-divider', token: '--header-divider' },
            { className: 'bg-header-menu-background', token: '--header-menu-background' },
            { className: 'bg-header-menu-foreground', token: '--header-menu-foreground' },
            { className: 'bg-header-menu-border', token: '--header-menu-border' },
            { className: 'bg-header-menu-hover-background', token: '--header-menu-hover-background' },
            { className: 'bg-header-menu-active-background', token: '--header-menu-active-background' },
            { className: 'bg-header-menu-icon', token: '--header-menu-icon' },
        ],
    },
    {
        heading: 'Footer',
        tokens: [
            { className: 'bg-footer-background', token: '--footer-background' },
            { className: 'bg-footer-foreground', token: '--footer-foreground' },
        ],
    },
    {
        heading: 'Agentic',
        tokens: [
            { className: 'bg-agentic', token: '--agentic' },
            { className: 'bg-agentic-foreground', token: '--agentic-foreground' },
            { className: 'bg-agentic-primary', token: '--agentic-primary' },
            { className: 'bg-agentic-primary-foreground', token: '--agentic-primary-foreground' },
            { className: 'bg-agentic-accent', token: '--agentic-accent' },
            { className: 'bg-agentic-accent-foreground', token: '--agentic-accent-foreground' },
            { className: 'bg-agentic-border', token: '--agentic-border' },
            { className: 'bg-agentic-ring', token: '--agentic-ring' },
            { className: 'bg-agentic-muted', token: '--agentic-muted' },
            { className: 'bg-agentic-muted-foreground', token: '--agentic-muted-foreground' },
            { className: 'bg-agentic-border-subtle', token: '--agentic-border-subtle' },
            { className: 'bg-agentic-message-output', token: '--agentic-message-output' },
            { className: 'bg-agentic-message-input', token: '--agentic-message-input' },
        ],
    },
    {
        heading: 'Brand (Market Street)',
        tokens: [
            { className: 'bg-brand-black', token: '--brand-black' },
            { className: 'bg-brand-black-off', token: '--brand-black-off' },
            { className: 'bg-brand-black-charcoal', token: '--brand-black-charcoal' },
            { className: 'bg-brand-white', token: '--brand-white' },
            { className: 'bg-brand-white-bone', token: '--brand-white-bone' },
            { className: 'bg-brand-white-ivory', token: '--brand-white-ivory' },
            { className: 'bg-brand-gray-50', token: '--brand-gray-50' },
            { className: 'bg-brand-gray-100', token: '--brand-gray-100' },
            { className: 'bg-brand-gray-200', token: '--brand-gray-200' },
            { className: 'bg-brand-gray-300', token: '--brand-gray-300' },
            { className: 'bg-brand-gray-400', token: '--brand-gray-400' },
            { className: 'bg-brand-gray-500', token: '--brand-gray-500' },
            { className: 'bg-brand-gray-600', token: '--brand-gray-600' },
            { className: 'bg-brand-gray-700', token: '--brand-gray-700' },
            { className: 'bg-brand-gray-800', token: '--brand-gray-800' },
            { className: 'bg-brand-gray-900', token: '--brand-gray-900' },
        ],
    },
    {
        heading: 'Misc semantic',
        tokens: [
            { className: 'bg-review-verified-bg', token: '--review-verified-bg' },
            { className: 'bg-review-verified-text', token: '--review-verified-text' },
            { className: 'bg-paypal-gold', token: '--paypal-gold' },
            { className: 'bg-venmo-blue', token: '--venmo-blue' },
            { className: 'bg-product-badge-promo-bg', token: '--product-badge-promo-bg' },
            { className: 'bg-product-badge-promo-foreground', token: '--product-badge-promo-foreground' },
            { className: 'bg-filter-selected', token: '--filter-selected' },
            { className: 'bg-filter-selected-border', token: '--filter-selected-border' },
        ],
    },
];

/** A single token rendered as a card: the color fills the top, the source token
 *  name sits in a divided footer. The card border keeps white / near-white /
 *  transparent swatches legible on the white canvas.
 *
 *  Tokens are NOT inherited across verticals — each vertical loads only its own
 *  token files (there is no canonical `src/theme/`), so a token family a vertical
 *  opts out of (e.g. `agentic-*` under cosmetic) is undefined at `:root` and its
 *  `bg-*` utility paints nothing. Rather than render a blank chip, detect the
 *  undefined source token and show an explicit "not defined in this vertical"
 *  placeholder. This reads the real `:root` source token (`--agentic`), not the
 *  compile-time-inlined `--color-*` bridge, so `getPropertyValue` returns `''`
 *  only when genuinely undeclared — distinguishing "not defined" from a token
 *  that is defined but transparent. Vertical-agnostic: works for any omitted
 *  token, not just agentic. */
function Swatch({ className, token }: ColorToken) {
    const [defined, setDefined] = useState(true);
    useLayoutEffect(() => {
        const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        setDefined(value.length > 0);
    }, [token]);

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {defined ? (
                <div className={`h-20 w-full shrink-0 ${className}`} />
            ) : (
                <div className="flex h-20 w-full shrink-0 items-center justify-center bg-muted px-2 text-center text-[10px] leading-tight text-muted-foreground">
                    not defined in this vertical
                </div>
            )}
            <div className="flex flex-1 items-center border-t border-border px-3 py-2">
                <code className="text-xs text-foreground break-all">{token}</code>
            </div>
        </div>
    );
}

function ColorGroupSection({ group }: { group: ColorGroup }) {
    return (
        <section aria-label={group.heading} className="space-y-4">
            <div className="flex items-baseline gap-3 border-b border-border pb-2">
                <h2 className="text-base font-semibold tracking-tight">{group.heading}</h2>
                <span className="text-xs text-muted-foreground">{group.tokens.length} tokens</span>
            </div>
            <div className="grid auto-rows-fr grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {group.tokens.map(({ className, token }) => (
                    <Swatch key={token} className={className} token={token} />
                ))}
            </div>
        </section>
    );
}

const meta: Meta = {
    title: 'Theme/Colors',
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Canonical color-token reference. Each swatch renders live via a `bg-*` utility (e.g. `bg-primary`), which `@theme inline` compiles to `background-color: var(--primary)` — so each swatch reflects the active theme. The list is every `--color-*` bridge entry the canonical (fashion) theme defines (111 tokens), in `theme/tailwind.css` order. Under `VERTICAL=cosmetic`, shared tokens show cosmetic’s values while a token family the vertical opts out of (e.g. `agentic-*`, which cosmetic omits) shows a "not defined in this vertical" placeholder instead of a blank chip — tokens are not inherited across verticals.',
            },
        },
    },
    tags: ['autodocs', 'chromatic-core'],
};

export default meta;
type Story = StoryObj;

/** Look up a color group by heading; throws if a heading is renamed without
 *  updating the story below — fails loudly in CI rather than rendering blank. */
function groupByHeading(heading: string): ColorGroup {
    const group = COLOR_GROUPS.find((g) => g.heading === heading);
    if (!group) throw new Error(`No color group with heading "${heading}"`);
    return group;
}

/** Build a per-family story: one sidebar leaf, one family's swatch grid. */
const colorStory = (heading: string): Story => ({
    name: heading,
    render: () => (
        <div className="mx-auto max-w-6xl">
            <ColorGroupSection group={groupByHeading(heading)} />
        </div>
    ),
});

// One story per token family — mirrors the design-system tree (Core, Sidebar, …).
// Families and order follow `theme/tailwind.css`.
export const Core = colorStory('Core');
export const Sidebar = colorStory('Sidebar');
export const StatusAndFeedback = colorStory('Status & feedback');
export const Swatches = colorStory('Swatch');
export const HeaderAndNavigation = colorStory('Header & navigation');
export const Footer = colorStory('Footer');
export const Agentic = colorStory('Agentic');
export const Brand = colorStory('Brand (Market Street)');
export const MiscSemantic = colorStory('Misc semantic');
