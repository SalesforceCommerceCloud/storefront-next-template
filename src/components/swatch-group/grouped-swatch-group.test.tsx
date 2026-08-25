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
import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { GroupedSwatchGroup, splitGroupedSwatchName, type GroupedSwatchValue } from './grouped-swatch-group';

const renderInRouter = (element: React.ReactElement) => {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{element}</AllProvidersWrapper> }], {
        initialEntries: ['/'],
    });
    return render(<RouterProvider router={router} />);
};

const fabricValues: GroupedSwatchValue[] = [
    {
        name: 'Navy, Velvet',
        value: 'navy',
        href: '/p?fabric=navy',
        image: { link: 'https://example.com/navy.jpg', alt: 'Navy velvet' },
        orderable: true,
        description: '+US$200',
    },
    {
        name: 'Emerald, Velvet',
        value: 'emerald',
        href: '/p?fabric=emerald',
        image: { link: 'https://example.com/emerald.jpg', alt: 'Emerald velvet' },
        orderable: true,
    },
    {
        name: 'Oatmeal, Linen',
        value: 'oatmeal',
        href: '/p?fabric=oatmeal',
        image: { link: 'https://example.com/oatmeal.jpg', alt: 'Oatmeal linen' },
        orderable: true,
    },
];

describe('splitGroupedSwatchName', () => {
    test('splits on the FIRST comma into label + family', () => {
        expect(splitGroupedSwatchName('Navy, Velvet')).toEqual({ label: 'Navy', family: 'Velvet' });
    });

    test('treats everything after the first comma as the family', () => {
        expect(splitGroupedSwatchName('Navy, Deep, Velvet')).toEqual({ label: 'Navy', family: 'Deep, Velvet' });
    });

    test('returns only a label (no family) when there is no comma', () => {
        expect(splitGroupedSwatchName('Charcoal')).toEqual({ label: 'Charcoal' });
    });
});

describe('GroupedSwatchGroup', () => {
    test('renders an "All" tab plus one tab per unique family', () => {
        renderInRouter(<GroupedSwatchGroup label="Fabric" value="navy" values={fabricValues} useHref allLabel="All" />);

        const filters = screen.getByRole('group', { name: 'Fabric' });
        const tabs = within(filters).getAllByRole('button');
        expect(tabs.map((b) => b.textContent)).toEqual(['All', 'Velvet', 'Linen']);
    });

    test('shows the SHORT label on each swatch and renders image tiles', () => {
        renderInRouter(<GroupedSwatchGroup label="Fabric" value="navy" values={fabricValues} useHref allLabel="All" />);

        const navy = screen.getByRole('radio', { name: /navy/i });
        // Grouped image swatches fill their grid cell (`imageTile`) rather than the fixed `image` tile.
        expect(navy).toHaveAttribute('data-swatch-type', 'imageTile');
        expect(within(navy).getByRole('img', { name: 'Navy velvet' })).toBeInTheDocument();

        // Short-label caption is rendered beneath the image tile.
        expect(screen.getByText('Navy', { selector: '[data-slot="swatch-short-label"]' })).toBeInTheDocument();
        expect(screen.getByText('Emerald', { selector: '[data-slot="swatch-short-label"]' })).toBeInTheDocument();
    });

    test('renders the per-option price-delta hint when present', () => {
        renderInRouter(<GroupedSwatchGroup label="Fabric" value="navy" values={fabricValues} useHref allLabel="All" />);

        const navy = screen.getByRole('radio', { name: /navy/i });
        const option = navy.closest('[data-slot="grouped-swatch-option"]');
        expect(option?.querySelector('[data-slot="swatch-description"]')).toHaveTextContent('+US$200');
    });

    test('filters visible swatches to the selected family', async () => {
        const user = userEvent.setup();
        renderInRouter(<GroupedSwatchGroup label="Fabric" value="navy" values={fabricValues} useHref allLabel="All" />);

        // All families visible initially.
        expect(screen.getByRole('radio', { name: /navy/i })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /oatmeal/i })).toBeInTheDocument();

        // Select the Linen family → only Oatmeal remains.
        await user.click(screen.getByRole('button', { name: 'Linen' }));
        expect(screen.queryByRole('radio', { name: /navy/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: /emerald/i })).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /oatmeal/i })).toBeInTheDocument();

        // The active tab reflects the selection.
        expect(screen.getByRole('button', { name: 'Linen' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    });

    test('renders a text swatch (label shape) when a value has no image', () => {
        const noImage: GroupedSwatchValue[] = [
            { name: 'Loveseat', value: 'loveseat', href: '/p?size=loveseat', orderable: true },
        ];
        renderInRouter(<GroupedSwatchGroup label="Size" value="loveseat" values={noImage} useHref allLabel="All" />);

        const swatch = screen.getByRole('radio', { name: /loveseat/i });
        expect(swatch).toHaveAttribute('data-swatch-type', 'label');
    });

    test('omits the family filter row when no value carries a family', () => {
        const flat: GroupedSwatchValue[] = [
            { name: 'Loveseat', value: 'loveseat', href: '/p?size=loveseat', orderable: true },
            { name: 'Sectional', value: 'sectional', href: '/p?size=sectional', orderable: true },
        ];
        renderInRouter(<GroupedSwatchGroup label="Size" value="loveseat" values={flat} useHref allLabel="All" />);

        expect(screen.queryByRole('group', { name: 'Size' })).not.toBeInTheDocument();
    });
});
