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
import { allModes } from '../../../../.storybook/modes';
import Features from '../features';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

function FeaturesStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logRender = action('features-render');

        // Log when component renders
        logRender({});

        return () => {
            // Cleanup if needed
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof Features> = {
    title: 'Home/Features',
    component: Features,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Features component that displays a grid of feature cards.

### Features:
- Responsive grid layout
- Feature cards with titles and descriptions
- Static content showcasing app features
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <FeaturesStoryHarness>
                <div className="py-16 bg-background">
                    <Story />
                </div>
            </FeaturesStoryHarness>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Features>;

export const Default: Story = {
    render: () => <Features />,
    parameters: {
        docs: {
            description: {
                story: 'Standard features component rendering 6 example feature cards.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for main heading (use role to be more specific)
        const heading = await canvas.findByRole('heading', { name: /^features$/i }, { timeout: 5000 });
        await expect(heading).toBeInTheDocument();

        // Check for feature cards
        const cartFeature = await canvas.findByText(/cart & checkout/i, {}, { timeout: 5000 });
        await expect(cartFeature).toBeInTheDocument();

        const einsteinFeature = await canvas.findByText(/einstein recommendations/i, {}, { timeout: 5000 });
        await expect(einsteinFeature).toBeInTheDocument();

        const accountFeature = await canvas.findByText(/my account/i, {}, { timeout: 5000 });
        await expect(accountFeature).toBeInTheDocument();
    },
};
