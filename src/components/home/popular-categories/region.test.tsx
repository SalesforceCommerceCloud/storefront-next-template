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
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { Region, type ComponentType } from '@/components/region';
import { registry } from '@/lib/page-designer/registry';
import { initializeRegistry } from '@/lib/page-designer/static-registry';

afterEach(() => {
    cleanup();
    registry.clear();
});

test('renders above labels from standalone and collection Page Designer configuration', async () => {
    initializeRegistry();
    await registry.loadAndRegister('Content.popularCategory');
    await registry.loadAndRegister('Layout.popularCategories');
    // The generated SCAPI schema leaves component-specific attributes as Record<string, never>.
    const card = (id: string, labelPosition: string) =>
        ({ id, typeId: 'Content.popularCategory', data: { category: id, labelPosition } }) as unknown as ComponentType;
    const collection = {
        id: 'collection',
        typeId: 'Layout.popularCategories',
        data: { title: 'Above collection', layout: 'row', labelPosition: 'above', eagerImageCount: 1 },
        regions: [{ id: 'categories', components: [card('nested', 'below'), card('trailing', 'below')] }],
    } as unknown as ComponentType;
    const page = {
        id: 'homepage',
        typeId: 'homePage',
        regions: [{ id: 'main', components: [card('standalone', 'above'), collection] }],
        componentData: {
            standalone: Promise.resolve({
                id: 'standalone',
                name: 'Standalone category',
                image: 'https://images.example.com/standalone.webp',
            }),
            nested: Promise.resolve({
                id: 'nested',
                name: 'Nested category',
                image: 'https://images.example.com/nested.webp',
            }),
            trailing: Promise.resolve({
                id: 'trailing',
                name: 'Trailing category',
                image: 'https://images.example.com/trailing.webp',
            }),
        },
    };
    const router = createMemoryRouter([
        {
            path: '*',
            element: (
                <AllProvidersWrapper>
                    <Region page={page} regionId="main" />
                </AllProvidersWrapper>
            ),
        },
    ]);
    render(<RouterProvider router={router} />);
    for (const name of ['Standalone category', 'Nested category', 'Trailing category']) {
        const link = await screen.findByRole('link', { name });
        const label = link.querySelector<HTMLSpanElement>('[data-slot="category-label"]');
        const media = link.querySelector<HTMLDivElement>('[data-slot="category-media"]');
        if (!label || !media) throw new Error('Expected category label and media');
        expect(Boolean(label.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(link.querySelector('img')).toHaveAttribute('alt', '');
        expect(link.querySelector('img')).toHaveAttribute('loading', name === 'Nested category' ? 'eager' : 'lazy');
    }
});
