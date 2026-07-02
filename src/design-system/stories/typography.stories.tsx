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
import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * `Theme/Typography` — the typographic baseline for the active vertical.
 *
 * Typography is the single highest-value visual-regression surface (a font swap
 * or scale drift shows up everywhere), so this renders a real baseline rather
 * than a token footnote. Two layers, honestly labeled:
 *
 *   1. **Font families** — the only custom typographic *tokens* we define:
 *      `--font-sans` / `--font-serif` / `--font-mono`. These are vertical-specific
 *      (fashion = "Sen"; cosmetic = "Lora" / "Courier New"), so each row uses the
 *      `font-sans` / `font-serif` / `font-mono` utility — never a hard-coded family
 *      — and renders the active vertical's font.
 *   2. **Type scale** — sizes/weights/line-heights are **Tailwind framework
 *      defaults**, not custom type-scale tokens. We render a representative slice
 *      of the scale the storefront uses — a subset of the `Typography` component's
 *      variants, type-relevant classes only (layout modifiers like paragraph
 *      spacing are omitted) — so font regressions are caught, and label it as
 *      framework-default so the absence of custom scale tokens reads as
 *      intentional. The full set of variants lives in the `UI/Typography` story.
 *      (The one custom size token, `--text-error-status`, is a single-use
 *      error-page display size, not part of the scale.)
 */

const PANGRAM = 'The quick brown fox jumps over the lazy dog — 0123456789';

/** Font-family tokens → the utility that consumes each. */
const FONT_FAMILIES: { token: string; utility: string; label: string }[] = [
    { token: '--font-sans', utility: 'font-sans', label: 'Sans' },
    { token: '--font-serif', utility: 'font-serif', label: 'Serif' },
    { token: '--font-mono', utility: 'font-mono', label: 'Mono' },
];

/** One type-scale row: a LITERAL className (so Tailwind's scanner emits it),
 *  copied from a `Typography` component variant — the real scale, not invented. */
type TypeStep = { className: string; label: string; sample: string };

/**
 * Type-scale rows split into headings vs body/text so each becomes its own
 * sidebar leaf. `className` strings stay LITERAL (never built from data). Each
 * row copies the type-relevant classes from a `Typography` component variant —
 * a representative subset; the full set lives in the `UI/Typography` story.
 *
 * KEEP IN SYNC with `typographyVariants` in `src/components/typography/index.tsx`.
 * Because the classes are hard-copied (Tailwind can't emit a class built from
 * data), a change to a variant there will NOT propagate here — update both.
 */
const HEADINGS: TypeStep[] = [
    { className: 'text-4xl font-bold tracking-tight', label: 'h1 · text-4xl / bold', sample: 'Heading 1' },
    { className: 'text-3xl font-semibold tracking-tight', label: 'h2 · text-3xl / semibold', sample: 'Heading 2' },
    { className: 'text-2xl font-semibold tracking-tight', label: 'h3 · text-2xl / semibold', sample: 'Heading 3' },
    { className: 'text-base font-semibold tracking-tight', label: 'h6 · text-base / semibold', sample: 'Heading 6' },
];

const BODY_AND_TEXT: TypeStep[] = [
    { className: 'leading-7', label: 'p · base / leading-7', sample: PANGRAM },
    { className: 'text-2xl text-muted-foreground', label: 'lead · text-2xl / muted', sample: 'Lead paragraph' },
    { className: 'text-sm font-semibold', label: 'large · text-sm / semibold', sample: 'Large label' },
    { className: 'text-sm font-medium leading-none', label: 'small · text-sm / medium', sample: 'Small text' },
    { className: 'text-sm text-muted-foreground', label: 'muted · text-sm / muted', sample: 'Muted text' },
];

const meta: Meta = {
    title: 'Theme/Typography',
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Typographic baseline for the active vertical. Font families render live from `--font-sans` / `--font-serif` / `--font-mono` (vertical-specific). The type scale below uses Tailwind framework defaults (no custom type-scale tokens are defined) and shows a representative subset of the `Typography` component’s variants (type-relevant classes only; the full set lives in the `UI/Typography` story).',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/** Font-family section: each row renders the active vertical's font live via
 *  its consuming utility (`font-sans` / `font-serif` / `font-mono`). */
function FontFamiliesSection() {
    return (
        <section aria-label="Font families" className="space-y-4">
            <div className="space-y-1 border-b border-border pb-2">
                <div className="flex items-baseline gap-3">
                    <h2 className="text-base font-semibold tracking-tight">Font families</h2>
                    <span className="text-xs text-muted-foreground">{FONT_FAMILIES.length} families</span>
                </div>
                <p className="text-sm text-muted-foreground">
                    The only custom typographic tokens. Vertical-specific — rendered live via the consuming utility.
                </p>
            </div>
            <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {FONT_FAMILIES.map(({ token, utility, label }) => (
                    <div key={token} className="space-y-2 px-5 py-4">
                        <dt className="flex items-baseline gap-2">
                            <span className="text-sm font-medium">{label}</span>
                            <code className="text-xs text-muted-foreground">{token}</code>
                        </dt>
                        <dd className={`${utility} text-xl text-foreground`}>{PANGRAM}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

/** Type-scale section: a labeled slice of the scale (headings, or body/text).
 *  Sizes/weights/line-heights are Tailwind framework defaults — no custom
 *  type-scale tokens exist — so this is the regression baseline, not tokens. */
function TypeScaleSection({ heading, steps }: { heading: string; steps: TypeStep[] }) {
    return (
        <section aria-label={heading} className="space-y-4">
            <div className="space-y-1 border-b border-border pb-2">
                <div className="flex items-baseline gap-3">
                    <h2 className="text-base font-semibold tracking-tight">{heading}</h2>
                    <span className="text-xs text-muted-foreground">{steps.length} steps</span>
                </div>
                <p className="text-sm text-muted-foreground">
                    Sizes, weights, and line-heights are Tailwind framework defaults — no custom type-scale tokens are
                    defined. Shown here as the regression baseline.
                </p>
            </div>
            <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {steps.map(({ className, label, sample }) => (
                    <div key={label} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-6">
                        <dt className="shrink-0 sm:w-48">
                            <code className="text-xs text-muted-foreground">{label}</code>
                        </dt>
                        <dd className={`min-w-0 flex-1 text-foreground ${className}`}>{sample}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

// One story per typographic facet — mirrors the design-system tree.
export const FontFamilies: Story = {
    name: 'Font Families',
    render: () => (
        <div className="mx-auto max-w-4xl">
            <FontFamiliesSection />
        </div>
    ),
};

export const Headings: Story = {
    name: 'Headings',
    render: () => (
        <div className="mx-auto max-w-4xl">
            <TypeScaleSection heading="Headings" steps={HEADINGS} />
        </div>
    ),
};

export const BodyAndText: Story = {
    name: 'Body & Text',
    render: () => (
        <div className="mx-auto max-w-4xl">
            <TypeScaleSection heading="Body & text" steps={BODY_AND_TEXT} />
        </div>
    ),
};
