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
import { Button } from '@/components/ui/button';
import { HeartIcon } from 'lucide-react';

/**
 * `UI/Button` — the design-system reference for the shadcn `Button` primitive.
 *
 * The primitive is imported from the shared UI primitives, never modified
 * here. This is a **multi-state gallery**: one story renders every
 * variant × size, plus disabled and icon-only states, side by side in a single
 * snapshot. That keeps the Chromatic cost at one image while covering the full
 * surface a restyle could regress.
 *
 * Only **resting** states are shown. Interactive pseudo-states (`:hover`,
 * `:active`, `:focus-visible`) can't be forced deterministically in a static
 * snapshot, so rendering them would flake — they're intentionally omitted.
 */

/** The button variants, in the order they're declared in `buttonVariants`. */
const VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const;

/** The text sizes (icon sizes get their own row below). */
const SIZES = ['sm', 'default', 'lg'] as const;

/** One labeled section wrapping a row of related buttons. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
            <div className="flex flex-wrap items-center gap-4">{children}</div>
        </div>
    );
}

const meta: Meta<typeof Button> = {
    title: 'UI/Button',
    component: Button,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Multi-state gallery for the `Button` primitive: every variant across every size, plus disabled and icon-only states, in one snapshot. Only resting states are shown (hover/active/focus can’t be captured deterministically). The primitive is imported from the shared UI primitives and is not modified here.',
            },
        },
    },
    tags: ['autodocs', 'chromatic-core'],
};

export default meta;
type Story = StoryObj<typeof Button>;

/** Every variant × size, plus disabled and icon states, in a single snapshot. */
export const Gallery: Story = {
    render: () => (
        <div className="mx-auto max-w-4xl space-y-8">
            {SIZES.map((size) => (
                <Row key={size} label={`Size: ${size}`}>
                    {VARIANTS.map((variant) => (
                        <Button key={variant} variant={variant} size={size}>
                            {variant}
                        </Button>
                    ))}
                </Row>
            ))}

            <Row label="Disabled">
                {VARIANTS.map((variant) => (
                    <Button key={variant} variant={variant} disabled>
                        {variant}
                    </Button>
                ))}
            </Row>

            <Row label="With icon">
                <Button>
                    <HeartIcon /> Add to wishlist
                </Button>
                <Button variant="secondary">
                    <HeartIcon /> Saved
                </Button>
                <Button variant="outline">
                    <HeartIcon /> Wishlist
                </Button>
            </Row>

            <Row label="Icon only">
                <Button size="icon-sm" aria-label="Add to wishlist">
                    <HeartIcon />
                </Button>
                <Button size="icon" aria-label="Add to wishlist">
                    <HeartIcon />
                </Button>
                <Button size="icon-lg" aria-label="Add to wishlist">
                    <HeartIcon />
                </Button>
                <Button size="icon" variant="outline" aria-label="Add to wishlist">
                    <HeartIcon />
                </Button>
            </Row>
        </div>
    ),
};
