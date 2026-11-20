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
import { registry } from '@/lib/page-designer/registry';
import ContentCard from '@/components/content-card';
import { Region, type ComponentType } from '@/components/region';
import ContentCarousel from './index';

afterEach(() => {
    cleanup();
    registry.clear();
});

test('renders authored content cards through the real Page Designer region and registry', async () => {
    registry.registerImporter('Layout.contentCarousel', () => Promise.resolve({ default: ContentCarousel }));
    registry.registerImporter('Content.contentCard', () => Promise.resolve({ default: ContentCard }));
    await registry.loadAndRegister('Layout.contentCarousel');
    await registry.loadAndRegister('Content.contentCard');
    const authored = {
        id: 'campaigns',
        typeId: 'Layout.contentCarousel',
        data: { title: 'Authored campaigns' },
        regions: [
            {
                id: 'items',
                components: [
                    {
                        id: 'first',
                        typeId: 'Content.contentCard',
                        data: {
                            title: 'Authored portrait',
                            imageUrl: { url: '/first.webp' },
                            imageAspectRatio: '3:4',
                            buttonText: 'Shop authored',
                            buttonLink: '/authored',
                        },
                    },
                    {
                        id: 'second',
                        typeId: 'Content.contentCard',
                        data: {
                            layout: 'image',
                            imageUrl: { url: '/second.webp' },
                            imageAlt: 'Second campaign artwork',
                            buttonLink: '/second',
                            badge: 'Sponsored',
                        },
                    },
                ],
            },
        ],
    } as unknown as ComponentType;
    const page = { id: 'page', typeId: 'storePage', regions: [{ id: 'main', components: [authored] }] };
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
    expect(await screen.findByRole('heading', { name: 'Authored campaigns' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Authored portrait' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop authored' })).toHaveAttribute('href', '/global/en-GB/authored');
    expect(screen.getByRole('link', { name: 'Second campaign artwork' })).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
});
