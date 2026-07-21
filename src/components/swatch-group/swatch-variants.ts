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
import { cva } from 'class-variance-authority';

// Individual swatch component variants
const swatchVariants = cva(
    'border-[length:var(--swatch-border-width)] border-black/50 text-foreground flex-shrink-0 relative group transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    {
        variants: {
            size: {
                sm: 'min-w-4 min-h-4',
                md: 'min-w-6 min-h-6',
                lg: 'min-w-8 min-h-8',
                auto: 'min-w-8 min-h-8',
            },
            shape: {
                color: ' w-[var(--swatch-pill-size)] h-[var(--swatch-pill-size)] p-[var(--swatch-pill-padding)]',
                label: ' px-3 py-1',
            },
            selected: {
                true: 'border-black',
                false: '',
            },
            labeled: {
                true: '',
                false: '',
            },
            disabled: {
                true: 'cursor-not-allowed before:content-[""] before:absolute before:top-1/2 before:left-1/2 before:h-[32px] before:w-[1px] before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-black before:z-[1]',
                false: 'cursor-pointer',
            },
        },
        compoundVariants: [
            // Labeled swatches (PDP) — override size constraints and padding
            {
                labeled: true,
                class: '!w-auto !h-auto !min-w-[var(--swatch-labeled-min-size)] !min-h-[var(--swatch-labeled-min-size)] !p-[var(--swatch-labeled-padding)]',
            },
            // Color with label (PDP pill style with additional sizing)
            {
                shape: 'color',
                labeled: true,
                class: 'gap-[var(--swatch-color-gap,0px)]',
            },
            // Circle default (not selected, not disabled)
            {
                shape: 'color',
                selected: false,
                disabled: false,
                class: 'border-[var(--swatch-color-border,transparent)] bg-[var(--swatch-color-bg,transparent)] text-[var(--swatch-color-text,inherit)] hover:border-[var(--swatch-color-border-hover,transparent)]',
            },
            // Circle selected (not disabled)
            {
                shape: 'color',
                selected: true,
                disabled: false,
                class: 'border-[var(--swatch-color-border-selected,black)] bg-[var(--swatch-color-bg-selected,transparent)] text-[var(--swatch-color-text-selected,inherit)] shadow-[var(--swatch-color-shadow,none)]',
            },
            // Circle disabled (not selected)
            {
                shape: 'color',
                selected: false,
                disabled: true,
                class: 'border-[var(--swatch-color-border,transparent)] bg-[var(--swatch-color-bg,transparent)] text-[var(--swatch-color-text,inherit)] opacity-50',
            },
            // Circle selected and disabled
            {
                shape: 'color',
                selected: true,
                disabled: true,
                class: 'border-[var(--swatch-color-border-selected,black)] bg-[var(--swatch-color-bg-selected,transparent)] text-[var(--swatch-color-text-selected,inherit)] shadow-[var(--swatch-color-shadow,none)] opacity-50',
            },
            // Square default (not selected, not disabled)
            {
                shape: 'label',
                selected: false,
                disabled: false,
                class: 'bg-swatch-bg border border-swatch-border text-swatch-text shadow-2xs hover:border-[var(--swatch-color-border-hover,transparent)]',
            },
            // Square selected (not disabled)
            {
                shape: 'label',
                selected: true,
                disabled: false,
                class: 'bg-swatch-bg-selected border border-swatch-border-selected text-swatch-text-selected shadow-2xs',
            },
            // Square disabled (not selected) — WCAG 1.4.3: a sold-out size renders as a navigable NavLink
            // (still focusable/clickable in uncontrolled PDP mode), so the inactive-component exemption does
            // not apply and its label text must meet 4.5:1. The diagonal strikethrough (`before:` pseudo)
            // already conveys the unavailable state, so we drop `opacity-50` here to keep the label at full
            // contrast (~11:1) rather than dimming it to ~3.9:1.
            {
                shape: 'label',
                selected: false,
                disabled: true,
                class: 'bg-swatch-bg border border-swatch-border text-swatch-text shadow-2xs',
            },
            // Square selected and disabled — same rationale as the unselected disabled label above.
            {
                shape: 'label',
                selected: true,
                disabled: true,
                class: 'bg-swatch-bg-selected border border-swatch-border-selected text-swatch-text-selected shadow-2xs',
            },
        ],
        defaultVariants: {
            size: 'lg',
            selected: false,
            disabled: false,
            shape: 'color',
            labeled: false,
        },
    }
);

export { swatchVariants };
