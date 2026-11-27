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

import type { AnalyticsEvent, ConsentPreferences, EventSiteInfo } from '@salesforce/storefront-next-runtime/events';
import { hasConsent, type EngagementAdapter } from '@/lib/adapters';
import { validateTikTokAdsConfig, TIKTOK_ADS_ADAPTER_NAME, type TikTokAdsClientConfig } from './tiktok-ads-config';

declare global {
    interface Window {
        TiktokAnalyticsObject?: string;
        ttq?: {
            load: (pixelId: string, options?: Record<string, unknown>) => void;
            page: () => void;
            track: (event: string, params?: Record<string, unknown>, options?: Record<string, unknown>) => void;
            identify: (...args: unknown[]) => void;
            holdConsent: () => void;
            grantConsent: () => void;
            revokeConsent: () => void;
            instance: (pixelId: string) => unknown[];
            instances: unknown[];
            _i: Record<string, unknown[] & { _u?: string }>;
            _t: Record<string, number>;
            _o: Record<string, Record<string, unknown>>;
        };
    }
}

const TIKTOK_SDK_URL = 'https://analytics.tiktok.com/i18n/pixel/events.js';

function bootstrapPixelSdk(pixelId: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.ttq) return;

    const ttq = Object.assign([] as unknown[], {
        _i: {} as Record<string, unknown[] & { _u?: string }>,
        _t: {} as Record<string, number>,
        _o: {} as Record<string, Record<string, unknown>>,
    }) as unknown as NonNullable<Window['ttq']>;

    const methods = [
        'page',
        'track',
        'identify',
        'instances',
        'debug',
        'on',
        'off',
        'once',
        'ready',
        'alias',
        'group',
        'enableCookie',
        'disableCookie',
        'holdConsent',
        'revokeConsent',
        'grantConsent',
    ];
    for (const method of methods) {
        (ttq as Record<string, unknown>)[method] = (...args: unknown[]) => {
            (ttq as unknown as unknown[]).push([method, ...args]);
        };
    }

    ttq.instance = (id: string) => {
        const instance = ttq._i[id] || [];
        for (const method of methods) {
            (instance as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
                (ttq as unknown as unknown[]).push([method, ...args]);
            };
        }
        return instance;
    };

    ttq.load = (id: string, options?: Record<string, unknown>) => {
        ttq._i[id] = [] as unknown[] & { _u?: string };
        ttq._i[id]._u = TIKTOK_SDK_URL;
        ttq._t[id] = Date.now();
        ttq._o[id] = options || {};

        const script = document.createElement('script');
        script.async = true;
        script.src = `${TIKTOK_SDK_URL}?sdkid=${encodeURIComponent(id)}&lib=ttq`;
        document.head.appendChild(script);
    };

    window.TiktokAnalyticsObject = 'ttq';
    window.ttq = ttq;
    ttq.holdConsent();
    ttq.load(pixelId);
}

const TIKTOK_EVENT_MAP: Partial<Record<AnalyticsEvent['eventType'], string>> = {
    view_product: 'ViewContent',
    cart_item_add: 'AddToCart',
    checkout_start: 'InitiateCheckout',
};

function buildPayload(event: AnalyticsEvent): Record<string, unknown> {
    switch (event.eventType) {
        case 'view_product':
            return { content_id: event.product.id, content_type: 'product', currency: event.currency };
        case 'cart_item_add': {
            const contents = event.cartItems.map((item) => ({
                content_id: item.productId,
                content_type: 'product',
                quantity: item.quantity ?? 1,
                price: item.price,
            }));
            const value = contents.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0);
            return { contents, value, currency: event.currency };
        }
        case 'checkout_start': {
            const items = event.basket.productItems ?? [];
            const contents = items.map((item) => ({
                content_id: item.productId,
                content_type: 'product',
                quantity: item.quantity ?? 1,
                price: item.basePrice,
            }));
            return {
                contents,
                value: event.basket.productSubTotal,
                currency: event.basket.currency ?? event.currency,
            };
        }
        default:
            return {};
    }
}

function getTtpCookie(): string {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|;\s*)_ttp=([^;]*)/);
    return match?.[1] ?? '';
}

function buildEventId(eventName: string, payload: Record<string, unknown>): string {
    const ttp = getTtpCookie();
    const contentId =
        typeof payload.content_id === 'string'
            ? payload.content_id
            : Array.isArray(payload.contents)
              ? (payload.contents as Array<Record<string, unknown>>).map((c) => c.content_id).join(',')
              : '';
    return `${eventName}.${ttp}.${contentId}`;
}

export function createTikTokAdsClientAdapter(config: TikTokAdsClientConfig): EngagementAdapter {
    const validationResult = validateTikTokAdsConfig(config);
    if (!validationResult.valid) {
        throw new Error(`TikTok Ads adapter configuration is invalid: ${validationResult.errors.join('; ')}`, {
            cause: validationResult.errors,
        });
    }

    const trimmedPixelId = config.pixelId.trim();
    let sdkInitialized = false;
    let consentGranted = false;

    function ensureSdk(): void {
        if (sdkInitialized) return;
        sdkInitialized = true;
        bootstrapPixelSdk(trimmedPixelId);
    }

    return {
        name: TIKTOK_ADS_ADAPTER_NAME,

        onConsentChange: (preferences: ConsentPreferences | undefined): void => {
            const hasMarketingConsent = hasConsent(config.consentCategory, preferences);
            if (!hasMarketingConsent) {
                if (consentGranted && sdkInitialized) {
                    consentGranted = false;
                    window.ttq?.revokeConsent();
                }
            } else if (!consentGranted && sdkInitialized) {
                consentGranted = true;
                window.ttq?.grantConsent();
            }
        },

        sendEvent: (
            event: AnalyticsEvent,
            _siteInfo?: EventSiteInfo,
            consentPreferences?: ConsentPreferences
        ): Promise<unknown> => {
            const hasMarketingConsent = hasConsent(config.consentCategory, consentPreferences);

            if (!hasMarketingConsent) {
                return Promise.resolve();
            }

            if (!config.eventToggles[event.eventType]) {
                return Promise.resolve();
            }

            ensureSdk();

            if (!consentGranted) {
                consentGranted = true;
                window.ttq?.grantConsent();
            }

            if (event.eventType === 'view_page') {
                if (typeof window.ttq?.page === 'function') {
                    window.ttq.page();
                }
                return Promise.resolve();
            }

            const tiktokEvent = TIKTOK_EVENT_MAP[event.eventType];
            if (!tiktokEvent) {
                return Promise.resolve();
            }

            if (typeof window.ttq?.track !== 'function') {
                return Promise.resolve();
            }

            const payload = buildPayload(event);
            const eventId = buildEventId(tiktokEvent, payload);
            window.ttq.track(tiktokEvent, payload, { event_id: eventId });
            return Promise.resolve();
        },
    };
}
