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
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { expect, within } from 'storybook/test';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { useNavigate } from '@/hooks/use-navigate';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import Footer from '../index';

// The footer hides "Join Our Community" on non-homepage routes (see main-footer.tsx).
// The global Storybook router pins the initial path to '/', so the newsletter always
// renders by default. This wrapper navigates the existing router so the conditional
// branch in MainFooter exercises the same `useLocation()` logic production uses,
// without nesting an extra MemoryRouter (Pattern 4) or mocking `useLocation`.
function FooterWithNewsletterToggle({ showNewsletter }: { showNewsletter: boolean }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const target = showNewsletter ? '/' : '/cart';
    useEffect(() => {
        if (pathname !== target) navigate(target, { replace: true });
    }, [navigate, pathname, target]);
    return <Footer />;
}

interface FooterStoryArgs {
    showNewsletter: boolean;
}

const meta: Meta<FooterStoryArgs> = {
    title: 'Layout/Footer',
    tags: ['autodocs', 'interaction', 'chromatic-core'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Site footer with policy links, switchers, legal links, social icons, and (homepage-only) newsletter signup. The `variant="checkout"` prop renders a stripped-down trust-marks-only layout used on checkout pages — see the `CheckoutVariant` story.',
            },
        },
    },
    argTypes: {
        showNewsletter: {
            control: 'boolean',
            description:
                'Drives the newsletter "Join Our Community" section. The footer renders it only on the homepage; toggling this navigates the story between `/` and `/cart` so the real `useLocation()` branch is exercised.',
        },
    },
    args: {
        showNewsletter: true,
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <Story />
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
    render: ({ showNewsletter }) => <FooterWithNewsletterToggle showNewsletter={showNewsletter} />,
};

export default meta;
type Story = StoryObj<FooterStoryArgs>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        // Policy row contains the four expected links, with About Us before
        // Accessibility Statement (per W-22495110).
        await expect(canvas.getAllByRole('link', { name: /about us/i }).length).toBeGreaterThan(0);
        await expect(canvas.getAllByRole('link', { name: /accessibility/i }).length).toBeGreaterThan(0);
        await expect(canvas.getAllByRole('link', { name: /privacy policy/i }).length).toBeGreaterThan(0);
        await expect(canvas.getAllByRole('link', { name: /your privacy choices/i }).length).toBeGreaterThan(0);

        // Newsletter signup is rendered when showNewsletter is true (default).
        await expect(canvas.getByPlaceholderText(/your email/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
        await expect(canvas.getByRole('heading', { name: /join our community/i })).toBeInTheDocument();
    },
};

const iphoneViewport = {
    name: 'iPhone',
    styles: { width: '375px', height: '844px' },
    type: 'mobile' as const,
};

export const MobileView: Story = {
    globals: {
        viewport: { value: 'iphone', isRotated: false },
    },
    parameters: {
        viewport: {
            options: { iphone: iphoneViewport },
            value: 'iphone',
            isRotated: false,
        },
        docs: {
            description: {
                story: 'Footer at mobile breakpoint (375×844) — verifies the stacked switchers + legal links and the wrapped policy row.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getAllByRole('link', { name: /about us/i }).length).toBeGreaterThan(0);
    },
};

/**
 * `variant="checkout"` renders the stripped-down footer used on checkout pages
 * (`_checkout.tsx`): no newsletter, no policy-links section, no social icons,
 * no switchers — just the copyright line and the legal links row.
 */
export const CheckoutVariant: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Stripped-down checkout footer — copyright + legal links only. Used on `_checkout.tsx` so trust marks remain visible without distracting from the checkout flow.',
            },
        },
    },
    render: () => <Footer variant="checkout" />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        // Legal links remain.
        await expect(canvas.getAllByRole('link', { name: /privacy policy/i }).length).toBeGreaterThan(0);

        // Newsletter, switchers, and social icons are stripped out.
        await expect(canvas.queryByPlaceholderText(/your email/i)).not.toBeInTheDocument();
        await expect(canvas.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument();
        await expect(canvas.queryByRole('heading', { name: /join our community/i })).not.toBeInTheDocument();
    },
};
