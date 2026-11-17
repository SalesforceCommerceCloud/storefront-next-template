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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import StoreLocator from '@/extensions/store-locator/components/store-locator';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

const meta: Meta<typeof StoreLocator> = {
    title: 'Extensions/Store Locator/Store Locator',
    component: StoreLocator,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        // The luxury store-locator override seeds its branded boutique list from this route (via useFetcher) on
        // render; providing it supplies the router the hook needs. Harmless for the fashion form, which doesn't fetch.
        mockRoutes: [
            {
                path: '/resource/boutiques',
                loader: () => ({ success: true, stores: [] }),
            },
            {
                // use-boutique-list now also fetches from territories as primary source.
                path: '/resource/appointment-territories',
                loader: () => ({ success: false, error: 'SCHEDULER_NOT_CONFIGURED' }),
            },
        ],
        docs: {
            description: {
                component:
                    'The composed Store Locator experience: a search form followed by results that appear only after a search, loading state, or error.',
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoreLocatorProvider>
                <Story />
            </StoreLocatorProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Initial Store Locator state with the search form visible and no results before a search.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify the store locator section is rendered (common to both fashion form and luxury boutique locator)
        const section = canvasElement.querySelector('section[aria-labelledby="store-locator-heading"]');
        await expect(section).toBeInTheDocument();

        // Verify the locator content is present — could be a form (fashion) or the boutique finder (luxury)
        const locatorContent = section?.querySelector(
            '[data-slot="luxury-boutique-finder"], [data-slot="luxury-boutique-locator"], form, [data-testid="boutique-locator"]'
        );
        await expect(locatorContent).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator optimized for mobile devices. Shows:
- Stacked layout for better mobile viewing
- Touch-friendly inputs and buttons
- Mobile-optimized spacing

The component automatically adapts for mobile screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify the store locator section is rendered (common to both fashion form and luxury boutique locator)
        const section = canvasElement.querySelector('section[aria-labelledby="store-locator-heading"]');
        await expect(section).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator for desktop devices. Shows:
- Proper spacing and layout
- All form fields clearly displayed
- Desktop-optimized interaction

The component provides a clean layout for desktop screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify the store locator section is rendered (common to both fashion form and luxury boutique locator)
        const section = canvasElement.querySelector('section[aria-labelledby="store-locator-heading"]');
        await expect(section).toBeInTheDocument();

        // Verify the locator content is present — could be a form (fashion) or the boutique finder (luxury)
        const locatorContent = section?.querySelector(
            '[data-slot="luxury-boutique-finder"], [data-slot="luxury-boutique-locator"], form, [data-testid="boutique-locator"]'
        );
        await expect(locatorContent).toBeInTheDocument();
    },
};
