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
import PriceRangeInput from '../index';
import { action } from 'storybook/actions';
import { useEffect, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';

// ---------------------------------------------------------------------------
// PriceRangeInput is a leaf input component — its visible state is fully a
// function of the four props it accepts: `minPrice`, `maxPrice`,
// `minAllowed`, `maxAllowed`. All four fold cleanly into Controls. The
// `OutOfRange` story is kept because it demonstrates a fundamentally
// different visual state (both inputs in destructive styling) that's worth
// a single bookmarkable URL — even though the same state can be reached
// from FullyFeatured by tweaking values.
// ---------------------------------------------------------------------------

const mockSite = mockSiteObject;

function PriceRangeInputStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logInput = action('price-range-input');
        const logChange = action('price-range-change');

        const handleInput = (event: Event) => {
            const target = event.target as HTMLInputElement | null;
            if (!target || !root.contains(target) || target.type !== 'number') return;
            logInput({ value: target.value, field: target.placeholder || '' });
        };

        const handleChange = (event: Event) => {
            const target = event.target as HTMLInputElement | null;
            if (!target || !root.contains(target) || target.type !== 'number') return;
            logChange({ value: target.value });
        };

        root.addEventListener('input', handleInput);
        root.addEventListener('change', handleChange);
        return () => {
            root.removeEventListener('input', handleInput);
            root.removeEventListener('change', handleChange);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof PriceRangeInput> = {
    title: 'Core/Forms/Price Range Input',
    component: PriceRangeInput,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Min/max price input pair with currency-aware formatting and live out-of-range/inverted-range validation. Used inside `RefinePrice` but also stands alone in any price-filter context.',
            },
        },
    },
    decorators: [
        (Story) => (
            <SiteProvider
                site={mockSite}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <PriceRangeInputStoryHarness>
                    <Story />
                </PriceRangeInputStoryHarness>
            </SiteProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

type SyntheticArgs = {
    initialMin: string;
    initialMax: string;
    minAllowed?: number;
    maxAllowed?: number;
};

function PriceRangeInputExample({ initialMin = '', initialMax = '', minAllowed, maxAllowed }: SyntheticArgs) {
    const [minPrice, setMinPrice] = useState(initialMin);
    const [maxPrice, setMaxPrice] = useState(initialMax);

    return (
        <div className="space-y-4 w-96">
            <PriceRangeInput
                minPrice={minPrice}
                maxPrice={maxPrice}
                onChange={(min, max) => {
                    setMinPrice(min);
                    setMaxPrice(max);
                }}
                onApply={() => {
                    action('price-range-applied')({ min: minPrice, max: maxPrice });
                }}
                minAllowed={minAllowed}
                maxAllowed={maxAllowed}
            />
        </div>
    );
}

/**
 * Rich-but-realistic baseline — empty inputs with no allowed limits set.
 * Use Controls to seed values, set `minAllowed`/`maxAllowed`, or trigger
 * the validation states (out-of-range, inverted).
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        initialMin: '',
        initialMax: '',
    },
    argTypes: {
        initialMin: {
            description: 'Synthetic: initial value of the min input (empty = placeholder shown).',
            control: 'text',
            table: { category: 'Synthetic (initial state)' },
        },
        initialMax: {
            description: 'Synthetic: initial value of the max input (empty = placeholder shown).',
            control: 'text',
            table: { category: 'Synthetic (initial state)' },
        },
        minAllowed: {
            description: 'Direct prop: lower validation bound — the smallest value the inputs accept without an error.',
            control: { type: 'number', min: 0, step: 1 },
        },
        maxAllowed: {
            description:
                'Direct prop: upper validation bound — values larger than this trigger out-of-range error styling.',
            control: { type: 'number', min: 0, step: 1 },
        },
    },
    render: (args) => (
        <PriceRangeInputExample
            initialMin={args.initialMin ?? ''}
            initialMax={args.initialMax ?? ''}
            minAllowed={args.minAllowed}
            maxAllowed={args.maxAllowed}
        />
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const inputs = canvasElement.querySelectorAll('input[type="number"]');
        await expect(inputs.length).toBeGreaterThanOrEqual(2);
    },
};

/**
 * Both inputs in destructive styling: min=600 exceeds maxAllowed=500
 * (out-of-range) AND max=50 is less than min (inverted range). Worth a
 * single bookmarkable URL because the resulting visual state is
 * fundamentally different from the empty/normal-values case.
 */
export const OutOfRange: Story = {
    render: () => <PriceRangeInputExample initialMin="600" initialMax="50" minAllowed={0} maxAllowed={500} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const inputs = canvasElement.querySelectorAll('input[type="number"]');
        await expect(inputs.length).toBeGreaterThanOrEqual(2);
        const errorInputs = canvasElement.querySelectorAll('.text-destructive');
        await expect(errorInputs.length).toBeGreaterThan(0);
    },
};
