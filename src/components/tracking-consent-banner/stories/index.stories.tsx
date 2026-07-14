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
import { action } from 'storybook/actions';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
import { TrackingConsent } from '@/types/tracking-consent';
import { TrackingConsentBanner } from '../index';
import Cookies from 'js-cookie';

/**
 * Builds an `AppConfig` clone with `engagement.analytics.trackingConsent.position` overridden
 * for position-variant stories. Returning a fresh object preserves the rest of `mockConfig`
 * and lets a per-story `<ConfigProvider>` shadow the global one.
 */
function withTrackingConsentPosition(position: 'bottom-left' | 'bottom-right' | 'bottom-center'): AppConfig {
    return {
        ...mockConfig,
        engagement: {
            ...mockConfig.engagement,
            analytics: {
                ...mockConfig.engagement.analytics,
                trackingConsent: {
                    ...mockConfig.engagement.analytics.trackingConsent,
                    position,
                },
            },
        },
    } as AppConfig;
}

const meta: Meta<typeof TrackingConsentBanner> = {
    title: 'COMMON/Tracking Consent Banner',
    component: TrackingConsentBanner,
    parameters: {
        layout: 'fullscreen',
        // The banner reads useRouteLoaderData('root') and suppresses itself when
        // pageDesignerMode is true. Stories run inside a memory router that defaults
        // to no `root` ancestor; we explicitly inject a non-page-designer root so
        // the suppression branch isn't accidentally hit.
        routeLoaderData: { root: { pageDesignerMode: false } },
        docs: {
            description: {
                component: `
# Tracking Consent Banner Component

A non-intrusive banner that collects user consent for tracking cookies and analytics.

**Keywords:** tracking-consent, DNT, do-not-track, cookie-banner, cookie-consent, privacy, GDPR, analytics-consent

## Features

The banner:
- Only shows if tracking consent is enabled in config and the visitor's session has no tracking consent yet
- Submits the chosen value to \`/action/update-tracking-consent\`, which refreshes the SLAS token (server sets the dw_dnt cookie via Set-Cookie header)
- Supports a custom \`onConsentChange\` callback for external analytics integration
- Can be positioned at bottom-left, bottom-right, or bottom-center via \`config.engagement.analytics.trackingConsent.position\`
- Shows loading spinners during async operations
- Includes a close button (X) that applies the configured default consent

## Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader friendly

## Responsive Design

- Mobile and desktop optimized
- Smooth animations
- Loading states for all actions
                `,
            },
        },
    },
    tags: ['autodocs', 'interaction', 'tracking-consent', 'engagement', 'dnt', 'do-not-track'],
    decorators: [
        (Story) => {
            // Client-only banner now reads dw_dnt directly; ensure a clean slate per story.
            Cookies.remove('dw_dnt');
            return (
                <div style={{ minHeight: '100vh', position: 'relative', padding: '2rem' }}>
                    <div>
                        <h1>Sample Page Content</h1>
                        <p>This is sample content to demonstrate the banner positioning.</p>
                    </div>
                    <Story />
                </div>
            );
        },
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default story showing the banner when it should be displayed.
 *
 * The global Storybook AuthProvider supplies a guest session with `trackingConsent: undefined`,
 * and `mockConfig.engagement.analytics.trackingConsent.enabled === true`, so the real
 * useTrackingConsent hook returns `shouldShowBanner === true`.
 */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const banner = await canvas.findByRole('dialog', {}, { timeout: 3000 });
        await expect(banner).toBeInTheDocument();

        // Title and description are rendered from the trackingConsent translation namespace
        const title = canvas.getByText('Tracking Consent');
        await expect(title).toBeInTheDocument();
        const description = canvas.getByText(/lorem ipsum/i);
        await expect(description).toBeInTheDocument();

        const acceptButton = canvas.getByRole('button', { name: 'Accept' });
        const declineButton = canvas.getByRole('button', { name: 'Decline' });
        const closeButton = canvas.getByRole('button', { name: /close/i });

        await expect(acceptButton).toBeInTheDocument();
        await expect(declineButton).toBeInTheDocument();
        await expect(closeButton).toBeInTheDocument();

        await expect(acceptButton).not.toBeDisabled();
        await expect(declineButton).not.toBeDisabled();
        await expect(closeButton).not.toBeDisabled();
    },
};

/**
 * Demonstrates user interactions with the banner buttons.
 *
 * The banner hides itself immediately when the user responds (component-local `responded`
 * flips synchronously), so the assertion checks that the banner is gone after clicking Accept.
 */
export const Interaction: Story = {
    args: {
        onConsentChange: action('consent-changed'),
    },
    parameters: {
        docs: {
            description: {
                story: 'Demonstrates user interactions with the banner buttons (Accept, Decline, Close). The banner dismisses immediately upon interaction for minimal user disruption.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const acceptButton = await canvas.findByRole('button', { name: 'Accept' }, { timeout: 3000 });
        const declineButton = canvas.getByRole('button', { name: 'Decline' });
        const closeButton = canvas.getByRole('button', { name: /close/i });

        await expect(acceptButton).toBeInTheDocument();
        await expect(declineButton).toBeInTheDocument();
        await expect(closeButton).toBeInTheDocument();

        await userEvent.click(acceptButton);

        // The hook flips `hasResponded` synchronously, hiding the banner.
        await waitFor(() => {
            expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
        });
    },
};

/**
 * Banner positioned at bottom-left via a config override.
 */
export const PositionBottomLeft: Story = {
    decorators: [
        (Story) => (
            <ConfigProvider config={withTrackingConsentPosition('bottom-left')}>
                <Story />
            </ConfigProvider>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Banner positioned at the bottom-left corner of the screen.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const banner = await canvas.findByRole('dialog', {}, { timeout: 3000 });
        await expect(banner).toBeInTheDocument();
        await expect(banner.className).toMatch(/left-0/);
    },
};

/**
 * Banner positioned at bottom-right via a config override.
 */
export const PositionBottomRight: Story = {
    decorators: [
        (Story) => (
            <ConfigProvider config={withTrackingConsentPosition('bottom-right')}>
                <Story />
            </ConfigProvider>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Banner positioned at the bottom-right corner of the screen.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const banner = await canvas.findByRole('dialog', {}, { timeout: 3000 });
        await expect(banner).toBeInTheDocument();
        await expect(banner.className).toMatch(/right-0/);
    },
};

/**
 * Banner with a custom consent callback that fires after the SLAS token is refreshed.
 */
export const WithCustomCallback: Story = {
    args: {
        onConsentChange: (consent) => {
            action('custom-analytics-integration')({
                consent: consent === TrackingConsent.Accepted ? 'accepted' : 'declined',
                timestamp: new Date().toISOString(),
            });
        },
    },
    parameters: {
        chromatic: { disableSnapshot: true },
        docs: {
            description: {
                story: 'Demonstrates using the onConsentChange callback for custom analytics integration.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const banner = await canvas.findByRole('dialog', {}, { timeout: 3000 });
        await expect(banner).toBeInTheDocument();

        const acceptButton = canvas.getByRole('button', { name: 'Accept' });
        await expect(acceptButton).toBeInTheDocument();
    },
};

/**
 * Banner is suppressed when `useRouteLoaderData('root').pageDesignerMode === true`.
 *
 * This guards against authoring-time noise and is part of the real component's behavior —
 * not the mock's. Verifying it ensures the real `useRouteLoaderData('root')` branch is wired.
 */
export const HiddenInPageDesignerMode: Story = {
    parameters: {
        routeLoaderData: { root: { pageDesignerMode: true } },
        docs: {
            description: {
                story: 'When the root loader exposes `pageDesignerMode: true`, the banner returns null. Used by Page Designer authoring environments.',
            },
        },
        chromatic: { disableSnapshot: true },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    },
};

/**
 * When the `dw_dnt` cookie is present (shopper already responded), the client-only banner
 * stays hidden — the gate keys off cookie presence, not the SSR-baked auth value. (W-23424582)
 */
export const HiddenWhenConsentCookiePresent: Story = {
    parameters: {
        chromatic: { disableSnapshot: true },
    },
    decorators: [
        (Story) => {
            Cookies.set('dw_dnt', TrackingConsent.Declined); // '1'
            return <Story />;
        },
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    },
};

/**
 * With no `dw_dnt` cookie, the banner mounts client-side and shows. Confirms the cookie-absent
 * branch of the client-only gate. (W-23424582)
 */
export const ShownWhenNoConsentCookie: Story = {
    decorators: [
        (Story) => {
            Cookies.remove('dw_dnt');
            return <Story />;
        },
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const banner = await canvas.findByRole('dialog', {}, { timeout: 3000 });
        await expect(banner).toBeInTheDocument();
    },
};
