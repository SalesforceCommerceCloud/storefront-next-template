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
import { type ReactElement } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import Header from '@/components/header';
import AnnouncementBanner from '@/components/announcement-banner';
import AuthProvider from '@/providers/auth';
import type { SessionData } from '@/lib/api/types';
import ResponsiveNavigationMenu from '@/components/navigation-menu-mega';
import {
    mockMegaMenuRootCategory,
    mockMegaMenuSubCategories,
} from '@/components/navigation-menu-mega/stories/mock-menu-data';

const guestSession: SessionData = { userType: 'guest' };
const registeredSession: SessionData = { userType: 'registered', customerId: 'test-customer-1' };

interface HeaderStoryArgs {
    authenticated: boolean;
}

function HeaderHarness({ authenticated }: HeaderStoryArgs): ReactElement {
    return (
        <AuthProvider value={authenticated ? registeredSession : guestSession}>
            <Header>
                <ResponsiveNavigationMenu
                    resolve={Promise.resolve(mockMegaMenuRootCategory)}
                    defer={Promise.resolve(mockMegaMenuSubCategories)}
                />
            </Header>
        </AuthProvider>
    );
}

function CheckoutHeaderHarness(): ReactElement {
    return (
        <AuthProvider value={guestSession}>
            <Header variant="checkout" />
        </AuthProvider>
    );
}

const meta: Meta<HeaderStoryArgs> = {
    title: 'Layout/Header',
    tags: ['autodocs', 'interaction', 'chromatic-core'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Top application header with brand, search, user actions, store locator, and cart, plus the responsive mega-menu navigation. Toggle **authenticated** in the controls panel to switch between guest (Sign In link) and registered (My Account link) states. The `variant="checkout"` prop renders a stripped-down version (logo + cart only) used on checkout pages — see the `CheckoutVariant` story.',
            },
        },
    },
    argTypes: {
        authenticated: {
            control: 'boolean',
            description: 'Off → guest session (Sign In link). On → registered session (My Account link).',
        },
    },
    args: {
        authenticated: false,
    },
    decorators: [
        (Story) => (
            <div className="min-h-screen bg-background">
                <Story />
            </div>
        ),
    ],
    render: (args) => <HeaderHarness {...args} />,
};

export default meta;
type Story = StoryObj<HeaderStoryArgs>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('header-logo')).toBeInTheDocument();

        if (args.authenticated) {
            await expect(canvas.getByRole('link', { name: /my account/i })).toBeInTheDocument();
        } else {
            await expect(canvas.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
        }
    },
};

const mobileViewport = {
    name: 'iPhone',
    styles: { width: '375px', height: '844px' },
    type: 'mobile' as const,
};

/**
 * `variant="checkout"` strips the header down to just the logo + cart badge.
 * Search, user actions, wishlist, and the navigation menu are all removed so the
 * checkout flow gets a distraction-free top bar. Used by `_checkout.tsx`.
 */
export const CheckoutVariant: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Checkout header — logo + cart only. No search, user actions, wishlist, or navigation menu.',
            },
        },
    },
    render: () => <CheckoutHeaderHarness />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('header-logo')).toBeInTheDocument();
        await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
        await expect(canvas.queryByRole('link', { name: /wishlist/i })).not.toBeInTheDocument();
    },
};

export const MobileView: Story = {
    render: (args) => (
        <div className="header-mobile-story">
            <style>{`
                .header-mobile-story button.lg\\:hidden {
                    display: inline-flex !important;
                }
                .header-mobile-story div.lg\\:hidden:not([aria-hidden]) {
                    display: block !important;
                }
                .header-mobile-story [aria-hidden="true"].lg\\:hidden,
                .header-mobile-story .hidden.lg\\:flex,
                .header-mobile-story .hidden.lg\\:block {
                    display: none !important;
                }
                .header-mobile-story [aria-hidden="false"].lg\\:hidden {
                    display: block !important;
                }
            `}</style>
            <HeaderHarness {...args} />
        </div>
    ),
    parameters: {
        viewport: { options: { iphone: mobileViewport }, value: 'iphone', isRotated: false },
        docs: { description: { story: 'Header at mobile breakpoint — collapsed actions and hamburger.' } },
    },
    globals: { viewport: { value: 'iphone', isRotated: false } },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByTestId('header-logo')).toBeInTheDocument();

        const hamburger = await canvas.findByRole('button', { name: /open menu/i }, { timeout: 5000 });
        await userEvent.click(hamburger);
        await expect(hamburger).toHaveAttribute('aria-expanded', 'true');
        await waitFor(() => {
            expect(canvas.getByRole('navigation', { name: /mobile navigation menu/i })).toBeInTheDocument();
        });
    },
};

export const WithAnnouncementBanner: Story = {
    render: (args) => (
        <AuthProvider value={guestSession}>
            <div data-skip-action-logger>
                <AnnouncementBanner message="FREE WORLDWIDE SHIPPING from $90" />
            </div>
            <HeaderHarness {...args} />
        </AuthProvider>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Header with an announcement banner stacked on top.',
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const banner = canvas.queryByRole('status');
        if (banner) {
            await expect(banner).toBeInTheDocument();
            await expect(banner).toHaveTextContent('FREE WORLDWIDE SHIPPING from $90');
        }
        const logo = canvas.queryByTestId('header-logo');
        if (logo) {
            await expect(logo).toBeInTheDocument();
        }
    },
};
