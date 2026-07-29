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
import Help from '../help';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';

function HelpStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logNavigate = action('help-navigate');
        const logClick = action('help-button-click');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const link = target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const text = link.textContent?.trim() || '';
                event.preventDefault();
                logNavigate({ href, text });
                logClick({ href, text });
                return;
            }

            const button = target.closest('button');
            if (button) {
                const label = button.textContent?.trim() || button.getAttribute('aria-label') || '';
                logClick({ label });
            }
        };

        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof Help> = {
    title: 'Home/Help',
    component: Help,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Help component that displays a help section with a contact button.

### Features:
- Heading and description
- Contact Us button/link
- Responsive layout
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <HelpStoryHarness>
                <div className="py-16 bg-background">
                    <Story />
                </div>
            </HelpStoryHarness>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Help>;

export const Default: Story = {
    render: () => <Help />,
    parameters: {
        docs: {
            description: {
                story: 'Standard help component with a contact button.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for heading
        const heading = await canvas.findByText(/we're here to help/i, {}, { timeout: 5000 });
        await expect(heading).toBeInTheDocument();

        // Check for contact button
        const contactButton = await canvas.findByRole('link', { name: /contact us/i }, { timeout: 5000 });
        await expect(contactButton).toBeInTheDocument();
        await expect(contactButton).toHaveAttribute('href', `${SITE_PREFIX}/contact`);
    },
};
