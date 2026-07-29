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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Cookies from 'js-cookie';
import { TrackingConsentBanner } from './index';
import { TrackingConsent } from '@/types/tracking-consent';

// Mock the tracking-consent hook so we control the async write outcome (resolve vs reject).
const mockSetTrackingConsent = vi.fn();
vi.mock('@/hooks/use-tracking-consent', () => ({
    useTrackingConsent: () => ({
        setTrackingConsent: mockSetTrackingConsent,
        defaultTrackingConsent: TrackingConsent.Declined,
        isTrackingConsentEnabled: true,
    }),
}));

// The banner reads config only for positioning; a minimal stub is enough.
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({ engagement: { analytics: { trackingConsent: { position: 'bottom-center' } } } }),
}));

// Identity translation so button labels are stable, queryable strings.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Not in Page Designer authoring mode.
vi.mock('react-router', () => ({
    useRouteLoaderData: () => ({ pageDesignerMode: false }),
}));

describe('TrackingConsentBanner — optimistic dismissal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Cookies.remove('dw_dnt');
    });

    afterEach(() => {
        Cookies.remove('dw_dnt');
    });

    it('shows after client mount when no dw_dnt cookie is present', async () => {
        render(<TrackingConsentBanner />);
        // Client-only: appears only after the mount effect fires.
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('reappears when the consent write fails so the shopper can retry', async () => {
        // Simulate a network failure on the server write.
        mockSetTrackingConsent.mockRejectedValueOnce(new Error('network error'));

        render(<TrackingConsentBanner />);
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'accept' }));

        // Optimistically hidden immediately...
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        // ...then restored once the rejected write settles (no dw_dnt cookie was set).
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(mockSetTrackingConsent).toHaveBeenCalledWith(TrackingConsent.Accepted);
    });

    it('stays hidden when the consent write succeeds', async () => {
        // On success the server sets dw_dnt; emulate that so the durable gate also holds.
        mockSetTrackingConsent.mockImplementationOnce(() => {
            Cookies.set('dw_dnt', TrackingConsent.Accepted); // '0'
            return Promise.resolve();
        });

        render(<TrackingConsentBanner />);
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'accept' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        // Give any pending microtasks a chance to (incorrectly) re-show the banner.
        await Promise.resolve();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
