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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnalyticsEvent, ConsentPreferences } from '@salesforce/storefront-next-runtime/events';
import type { EngagementAdapter } from '@/lib/adapters';
import type { TikTokAdsClientConfig } from './tiktok-ads-config';
import { createTikTokAdsClientAdapter } from './tiktok-ads-client';

type TikTokAdsAdapter = EngagementAdapter & {
    sendEvent: (event: AnalyticsEvent, siteInfo?: unknown, consentPreferences?: ConsentPreferences) => Promise<unknown>;
    onConsentChange: (preferences: ConsentPreferences | undefined) => void;
};

const mockTtq = {
    load: vi.fn(),
    page: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    holdConsent: vi.fn(),
    grantConsent: vi.fn(),
    revokeConsent: vi.fn(),
    instance: vi.fn(),
    instances: [],
    _i: {} as Record<string, unknown[] & { _u?: string }>,
    _t: {} as Record<string, number>,
    _o: {} as Record<string, Record<string, unknown>>,
};

const validConfig: TikTokAdsClientConfig = {
    pixelId: 'C0000000000000000000',
    consentCategory: 'marketing',
    eventToggles: {
        view_page: true,
        view_product: true,
        view_search: false,
        view_category: false,
        view_recommender: false,
        click_product_in_category: false,
        click_product_in_search: false,
        click_product_in_recommender: false,
        cart_item_add: true,
        checkout_start: true,
        checkout_step: false,
        view_search_suggestion: false,
        click_search_suggestion: false,
        wishlist_item_added: false,
        wishlist_item_removed: false,
        wishlist_viewed: false,
        wishlist_item_merged: false,
        wishlist_merged: false,
    },
};

const consentGranted: ConsentPreferences = ['marketing'];
const consentDeclined: ConsentPreferences = [];

describe('createTikTokAdsClientAdapter', () => {
    beforeEach(() => {
        (window as unknown as Record<string, unknown>).ttq = mockTtq;
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).ttq;
        delete (window as unknown as Record<string, unknown>).TiktokAnalyticsObject;
    });

    it('throws on invalid config (empty pixelId)', () => {
        expect(() => createTikTokAdsClientAdapter({ ...validConfig, pixelId: '' })).toThrow();
    });

    it('returns adapter with name tiktokAds', () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        expect(adapter.name).toBe('tiktokAds');
    });

    it('does not inject SDK or call ttq.load during creation', () => {
        const appendChildSpy = vi.spyOn(document.head, 'appendChild');
        createTikTokAdsClientAdapter(validConfig);
        expect(appendChildSpy).not.toHaveBeenCalled();
        expect(mockTtq.load).not.toHaveBeenCalled();
        appendChildSpy.mockRestore();
    });

    it('sendEvent for view_product calls ttq.track ViewContent with product content_id', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            { eventType: 'view_product', product: { id: 'prod-123' } } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).toHaveBeenCalledWith(
            'ViewContent',
            { content_id: 'prod-123', content_type: 'product' },
            { event_id: 'ViewContent..prod-123' }
        );
    });

    it('sendEvent for cart_item_add calls ttq.track AddToCart with contents, value', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            {
                eventType: 'cart_item_add',
                cartItems: [
                    { productId: 'prod-456', quantity: 2, price: 29.99 },
                    { productId: 'prod-789', quantity: 1, price: 49.99 },
                ],
            } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).toHaveBeenCalledWith(
            'AddToCart',
            {
                contents: [
                    { content_id: 'prod-456', content_type: 'product', quantity: 2, price: 29.99 },
                    { content_id: 'prod-789', content_type: 'product', quantity: 1, price: 49.99 },
                ],
                value: 109.97,
            },
            { event_id: 'AddToCart..prod-456,prod-789' }
        );
    });

    it('sendEvent for cart_item_add includes non-default currency in payload', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            {
                eventType: 'cart_item_add',
                currency: 'EUR',
                cartItems: [{ productId: 'prod-456', quantity: 2, price: 29.99 }],
            } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).toHaveBeenCalledWith(
            'AddToCart',
            {
                contents: [{ content_id: 'prod-456', content_type: 'product', quantity: 2, price: 29.99 }],
                value: 59.98,
                currency: 'EUR',
            },
            { event_id: 'AddToCart..prod-456' }
        );
    });

    it('sendEvent for checkout_start calls ttq.track InitiateCheckout with contents, value, currency', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            {
                eventType: 'checkout_start',
                basket: {
                    productItems: [
                        { productId: 'prod-456', quantity: 2, basePrice: 29.99 },
                        { productId: 'prod-789', quantity: 1, basePrice: 49.99 },
                    ],
                    productSubTotal: 109.97,
                    currency: 'USD',
                },
            } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).toHaveBeenCalledWith(
            'InitiateCheckout',
            {
                contents: [
                    { content_id: 'prod-456', content_type: 'product', quantity: 2, price: 29.99 },
                    { content_id: 'prod-789', content_type: 'product', quantity: 1, price: 49.99 },
                ],
                value: 109.97,
                currency: 'USD',
            },
            { event_id: 'InitiateCheckout..prod-456,prod-789' }
        );
    });

    it('sendEvent skips checkout_step (no CompletePayment mapping)', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            { eventType: 'checkout_step', stepName: 'CONTACT_INFO', stepNumber: 1, basket: {} } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).not.toHaveBeenCalled();
    });

    it('sendEvent skips when consent declined', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            { eventType: 'view_product', product: { id: 'prod-123' } } as never,
            undefined,
            consentDeclined
        );
        expect(mockTtq.track).not.toHaveBeenCalled();
    });

    it('sendEvent skips when event toggle is false', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent(
            { eventType: 'wishlist_item_removed', productId: 'prod-123', surface: 'pdp' } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).not.toHaveBeenCalled();
    });

    it('sendEvent skips for unmapped events', async () => {
        const adapter = createTikTokAdsClientAdapter({
            ...validConfig,
            eventToggles: { ...validConfig.eventToggles, wishlist_item_merged: true },
        }) as TikTokAdsAdapter;
        await adapter.sendEvent(
            { eventType: 'wishlist_item_merged', productId: 'prod-123' } as never,
            undefined,
            consentGranted
        );
        expect(mockTtq.track).not.toHaveBeenCalled();
    });

    it('sendEvent does not throw when window.ttq is undefined (ad blocker)', async () => {
        delete (window as unknown as Record<string, unknown>).ttq;
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await expect(
            adapter.sendEvent(
                { eventType: 'view_product', product: { id: 'prod-123' } } as never,
                undefined,
                consentGranted
            )
        ).resolves.not.toThrow();
    });

    it('sendEvent for view_page calls ttq.page() not ttq.track()', async () => {
        const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
        await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
        expect(mockTtq.page).toHaveBeenCalled();
        expect(mockTtq.track).not.toHaveBeenCalled();
    });

    it('trims pixelId before passing to bootstrapPixelSdk', async () => {
        delete (window as unknown as Record<string, unknown>).ttq;
        const appendChildSpy = vi.spyOn(document.head, 'appendChild');
        const adapter = createTikTokAdsClientAdapter({
            ...validConfig,
            pixelId: '  C0000000000000000000  ',
        }) as TikTokAdsAdapter;
        await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
        const scriptEl = appendChildSpy.mock.calls.find((call) => call[0] instanceof HTMLScriptElement)?.[0] as
            | HTMLScriptElement
            | undefined;
        expect(scriptEl?.src).toContain('sdkid=C0000000000000000000');
        expect(scriptEl?.src).not.toContain('%20');
        appendChildSpy.mockRestore();
    });

    describe('consent-gated SDK injection', () => {
        it('does not inject SDK when consent is declined', async () => {
            delete (window as unknown as Record<string, unknown>).ttq;
            const appendChildSpy = vi.spyOn(document.head, 'appendChild');
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentDeclined);
            expect(appendChildSpy).not.toHaveBeenCalled();
            appendChildSpy.mockRestore();
        });

        it('injects SDK on first consented sendEvent with correct bootstrap', async () => {
            delete (window as unknown as Record<string, unknown>).ttq;
            const appendChildSpy = vi.spyOn(document.head, 'appendChild');
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            const scriptEl = appendChildSpy.mock.calls.find((call) => call[0] instanceof HTMLScriptElement)?.[0] as
                | HTMLScriptElement
                | undefined;
            expect(scriptEl).toBeDefined();
            expect(scriptEl?.src).toContain('analytics.tiktok.com');
            expect(scriptEl?.src).toContain('sdkid=C0000000000000000000');
            expect(scriptEl?.src).toContain('lib=ttq');
            expect(scriptEl?.async).toBe(true);
            expect((window as unknown as Record<string, unknown>).TiktokAnalyticsObject).toBe('ttq');
            appendChildSpy.mockRestore();
        });

        it('injects SDK only once across multiple consented events', async () => {
            delete (window as unknown as Record<string, unknown>).ttq;
            const appendChildSpy = vi.spyOn(document.head, 'appendChild');
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            await adapter.sendEvent({ eventType: 'view_page', path: '/plp' } as never, undefined, consentGranted);
            const scriptCalls = appendChildSpy.mock.calls.filter((call) => call[0] instanceof HTMLScriptElement);
            expect(scriptCalls).toHaveLength(1);
            appendChildSpy.mockRestore();
        });

        it('calls holdConsent before load during bootstrap', async () => {
            delete (window as unknown as Record<string, unknown>).ttq;
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            const ttq = window.ttq as unknown as typeof mockTtq;
            expect(ttq).toBeDefined();
        });

        it('calls grantConsent on first consented event', async () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            expect(mockTtq.grantConsent).toHaveBeenCalledTimes(1);
        });

        it('calls grantConsent only once across multiple consented events', async () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            await adapter.sendEvent({ eventType: 'view_page', path: '/plp' } as never, undefined, consentGranted);
            expect(mockTtq.grantConsent).toHaveBeenCalledTimes(1);
        });

        it('calls revokeConsent when consent is withdrawn after being granted', async () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            expect(mockTtq.grantConsent).toHaveBeenCalledTimes(1);
            void adapter.onConsentChange(consentDeclined);
            expect(mockTtq.revokeConsent).toHaveBeenCalledTimes(1);
        });

        it('does not call revokeConsent if consent was never granted', () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            void adapter.onConsentChange(consentDeclined);
            expect(mockTtq.revokeConsent).not.toHaveBeenCalled();
        });

        it('re-grants consent after revocation via onConsentChange', async () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            await adapter.sendEvent({ eventType: 'view_page', path: '/' } as never, undefined, consentGranted);
            void adapter.onConsentChange(consentDeclined);
            void adapter.onConsentChange(consentGranted);
            expect(mockTtq.grantConsent).toHaveBeenCalledTimes(2);
            expect(mockTtq.revokeConsent).toHaveBeenCalledTimes(1);
        });

        it('onConsentChange does not revoke when SDK not yet loaded', () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            void adapter.onConsentChange(consentDeclined);
            expect(mockTtq.revokeConsent).not.toHaveBeenCalled();
        });

        it('onConsentChange with undefined preferences does not revoke if not granted', () => {
            const adapter = createTikTokAdsClientAdapter(validConfig) as TikTokAdsAdapter;
            void adapter.onConsentChange(undefined);
            expect(mockTtq.revokeConsent).not.toHaveBeenCalled();
        });
    });
});
