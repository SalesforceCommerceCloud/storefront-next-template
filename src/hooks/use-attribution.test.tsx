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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTrackingConsent } from '@/hooks/use-tracking-consent';
import { TrackingConsent } from '@/types/tracking-consent';
import { captureAttribution, clearAttribution } from '@/lib/attribution';
import { useAttribution } from './use-attribution';

// Hoisted so the `js-cookie` mock factory can close over it; referencing the fn directly (rather
// than `vi.mocked(Cookies.get)`) also avoids the unbound-method lint on the method reference.
const { getCookieMock } = vi.hoisted(() => ({ getCookieMock: vi.fn() }));
vi.mock('js-cookie', () => ({ default: { get: getCookieMock } }));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: vi.fn() }));
vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: vi.fn() }));
vi.mock('@/hooks/use-tracking-consent', () => ({ useTrackingConsent: vi.fn() }));
vi.mock('@/lib/attribution', () => ({ captureAttribution: vi.fn(), clearAttribution: vi.fn() }));

const setDnt = (value: string | undefined) => getCookieMock.mockReturnValue(value as never);
const setConsent = (trackingConsent: TrackingConsent | undefined) =>
    vi.mocked(useTrackingConsent).mockReturnValue({ trackingConsent } as never);

describe('useAttribution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: per-site cookie domain set, no global override, no consent recorded, no dw_dnt.
        vi.mocked(useSite).mockReturnValue({ site: { cookies: { domain: '.example.com' } } } as never);
        vi.mocked(useConfig).mockReturnValue({ cookies: { domain: undefined } } as never);
        setConsent(undefined);
        setDnt(undefined);
    });

    test('captures first-touch attribution when no consent has been recorded (optimistic default)', () => {
        renderHook(() => useAttribution());

        expect(captureAttribution).toHaveBeenCalledWith({ cookieDomain: '.example.com' });
        expect(clearAttribution).not.toHaveBeenCalled();
    });

    test('captures when the shopper has accepted tracking (dw_dnt=0)', () => {
        setConsent(TrackingConsent.Accepted);
        setDnt(TrackingConsent.Accepted); // '0'

        renderHook(() => useAttribution());

        expect(captureAttribution).toHaveBeenCalledWith({ cookieDomain: '.example.com' });
        expect(clearAttribution).not.toHaveBeenCalled();
    });

    test('clears (and does not capture) when the shopper has opted out (dw_dnt=1)', () => {
        setConsent(TrackingConsent.Declined);
        setDnt(TrackingConsent.Declined); // '1'

        renderHook(() => useAttribution());

        expect(clearAttribution).toHaveBeenCalledWith({ cookieDomain: '.example.com' });
        expect(captureAttribution).not.toHaveBeenCalled();
    });

    test('honors an existing dw_dnt=1 even when the consent config flag is off (trackingConsent undefined)', () => {
        // The removed server middleware read dw_dnt unconditionally; the raw-cookie read keeps that
        // behavior independent of `engagement.analytics.trackingConsent.enabled`.
        setConsent(undefined);
        setDnt(TrackingConsent.Declined); // '1'

        renderHook(() => useAttribution());

        expect(clearAttribution).toHaveBeenCalledWith({ cookieDomain: '.example.com' });
        expect(captureAttribution).not.toHaveBeenCalled();
    });

    test('clears immediately on an in-session opt-out (reacts to a trackingConsent change)', () => {
        setConsent(TrackingConsent.Accepted);
        setDnt(TrackingConsent.Accepted);

        const { rerender } = renderHook(() => useAttribution());
        expect(captureAttribution).toHaveBeenCalledTimes(1);
        expect(clearAttribution).not.toHaveBeenCalled();

        // Shopper opts out: the server action sets dw_dnt=1 and the auth context updates, so
        // trackingConsent flips — the effect must re-run and clear the cookie without a full reload.
        setConsent(TrackingConsent.Declined);
        setDnt(TrackingConsent.Declined);
        rerender();

        expect(clearAttribution).toHaveBeenCalledWith({ cookieDomain: '.example.com' });
        expect(captureAttribution).toHaveBeenCalledTimes(1); // not called again
    });

    test('resolves the cookie domain as per-site override, else the global app.cookies.domain', () => {
        vi.mocked(useSite).mockReturnValue({ site: { cookies: { domain: undefined } } } as never);
        vi.mocked(useConfig).mockReturnValue({ cookies: { domain: '.global.com' } } as never);

        renderHook(() => useAttribution());

        expect(captureAttribution).toHaveBeenCalledWith({ cookieDomain: '.global.com' });
    });
});
