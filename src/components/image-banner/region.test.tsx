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
import { Region, type ComponentType } from '@/components/region';
import ImageBanner from './index';

afterEach(() => {
    cleanup();
    registry.clear();
});

test('supports explicit application registration in a custom Page Designer region', async () => {
    registry.registerImporter('merchant.imageBanner', () => Promise.resolve({ default: ImageBanner }));
    await registry.loadAndRegister('merchant.imageBanner');
    // Page Designer's generic SCAPI schema types authored component data as Record<string, never>.
    const authored = {
        id: 'campaign-banner',
        typeId: 'merchant.imageBanner',
        data: {
            imageUrl: { url: '/authored-wide.webp', metaData: { width: 1600, height: 240 } },
            imageAlt: 'Authored campaign',
            linkUrl: '/c/campaign',
            disclosure: 'Sponsored',
        },
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
    const { container } = render(<RouterProvider router={router} />);
    expect(await screen.findByRole('link', { name: 'Authored campaign' })).toHaveAttribute(
        'href',
        '/global/en-GB/c/campaign'
    );
    expect(container.querySelector('source')).not.toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
});
