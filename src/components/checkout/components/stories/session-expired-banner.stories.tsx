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
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { SessionExpiredBanner } from '../session-expired-banner';

const meta: Meta<typeof SessionExpiredBanner> = {
    component: SessionExpiredBanner,
    title: 'Checkout/Session Expired Banner',
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
### SessionExpiredBanner Component

An inline persistent alert shown when a mid-checkout action fails with a session-expired or unauthorized error. Displays the localized session-expired message alongside a Sign In link that returns the shopper to checkout after authenticating.

**Key Features:**
- Uses the \`Alert\` primitive with the destructive variant so the banner is visually prominent.
- The Sign In link points to the login page with \`returnUrl\` and \`error=session_expired\` query parameters.
- Uses the site-context-aware \`Link\` wrapper so the URL carries the site/locale prefix in multi-site deployments.
                `,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    decorators: [
        (Story) => (
            <div className="max-w-2xl mx-auto p-6">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        returnUrl: {
            control: 'text',
            description: 'Path to return to after signing in. Defaults to the checkout path.',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story: 'Default state with the checkout return URL.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('session-expired-banner')).toBeInTheDocument();
        const link = canvas.getByRole('link');
        await expect(link).toBeInTheDocument();
        await expect(link.getAttribute('href')).toContain('returnUrl=');
        await expect(link.getAttribute('href')).toContain('error=session_expired');
    },
};

export const WithCustomReturnUrl: Story = {
    args: {
        returnUrl: '/checkout?step=payment',
    },
    parameters: {
        docs: {
            description: {
                story: 'Banner with a custom return URL preserving checkout step context.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('session-expired-banner')).toBeInTheDocument();
        const link = canvas.getByRole('link');
        await expect(link.getAttribute('href')).toContain(encodeURIComponent('/checkout?step=payment'));
    },
};
