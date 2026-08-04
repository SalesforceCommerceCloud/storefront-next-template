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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import type { Plugin } from 'vite';
import { normalizePath } from '../test-utils';

// Global console mocking to prevent test output noise
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
};

beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
});

afterEach(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    delete process.env.SFCC_LOG_LEVEL;
});

// Mock fs to use memfs
vi.mock('fs', async () => {
    const memfs = await import('memfs');
    return {
        ...memfs.fs,
        readFileSync: vi.fn(),
    };
});

vi.mock('glob', () => ({
    glob: vi.fn(),
}));

// Mock the config loader module
vi.mock('./configLoader', () => ({
    loadEngagementConfig: vi.fn(),
}));

import { readFileSync } from 'fs';
import { glob } from 'glob';
import { loadEngagementConfig } from './configLoader';
import { eventInstrumentationValidatorPlugin } from './eventInstrumentationValidator';

const mockReadFileSync = vi.mocked(readFileSync);
const mockGlob = vi.mocked(glob);
const mockLoadEngagementConfig = vi.mocked(loadEngagementConfig);

function callHook(hook: any, context: any, ...args: any[]) {
    if (typeof hook === 'function') {
        return hook.call(context, ...args);
    }
    if (hook && typeof hook.handler === 'function') {
        return hook.handler.call(context, ...args);
    }
}

async function callPluginHooks(plugin: Plugin, projectRoot: string) {
    callHook(plugin.configResolved, null, { root: projectRoot });
    const context = { error: vi.fn() };
    await callHook(plugin.buildStart, context, {});
}

describe('eventInstrumentationValidatorPlugin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vol.reset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Plugin Configuration', () => {
        it('creates plugin with default configuration', () => {
            const plugin = eventInstrumentationValidatorPlugin();

            expect(plugin).toBeDefined();
            expect(plugin.name).toBe('storefrontnext:event-instrumentation-validator');
            expect(plugin.apply).toBe('build');
        });

        it('creates plugin with custom configuration', () => {
            const config = {
                configPath: 'custom/config.ts',
                scanPaths: ['custom/src'],
                failOnMissing: true,
            };

            const plugin = eventInstrumentationValidatorPlugin(config);

            expect(plugin).toBeDefined();
            expect(plugin.name).toBe('storefrontnext:event-instrumentation-validator');
        });
    });

    describe('Event Detection Patterns', () => {
        // Realistic file content that resembles actual use-analytics.ts
        const COMPLEX_ANALYTICS_FILE = `
'use client';

import { useRef, useEffect } from 'react';
import { useAuth } from '@/providers/auth';
import type { SessionData } from '@/lib/api/types';
import type { ShopperBasketsV2, ShopperProducts, ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import {
    createEvent,
    getEventMediator,
    type EventMediator,
    type AnalyticsEvent,
} from '@salesforce/storefront-next-runtime/events';
import { useConfig, type AppConfig } from '@/config';
import { ensureAdaptersInitialized } from '@/lib/adapters/initialize-adapters';
import { getAllAdapters } from '@/lib/adapters';
import { useTrackingConsent } from './use-tracking-consent';
import { TrackingConsent } from '@/types/tracking-consent';

/**
 * Ensures adapters are initialized and returns the event mediator
 */
async function getInitializedMediator(appConfig: AppConfig): Promise<EventMediator | undefined> {
    await ensureAdaptersInitialized(appConfig);
    return getEventMediator(getAllAdapters);
}

/**
 * Helper function to track an event with auth validation
 */
async function trackEvent<TEventType extends AnalyticsEvent['eventType']>(
    authPromise: Promise<SessionData | undefined>,
    appConfig: AppConfig,
    consentPreferences: ConsentPreferences | undefined,
    siteInfo: EventSiteInfo | undefined,
    eventType: TEventType,
    eventData: Omit<Parameters<typeof createEvent<TEventType>>[1], 'payload'>
): Promise<void> {
    if (trackingConsent !== TrackingConsent.Accepted) {
        return;
    }
    const auth = await authPromise;
    if (auth === undefined) return;
    const mediator = await getInitializedMediator(appConfig);
    if (!mediator) return;
    const event = createEvent(eventType, {
        ...eventData,
        payload: { userType: auth.userType ?? 'guest', usid: auth.usid },
    } as Parameters<typeof createEvent<TEventType>>[1]);
    return void mediator.track(event);
}

export const useAnalytics = () => {
    const auth = useAuth();
    const appConfig = useConfig();
    const { trackingConsent } = useTrackingConsent();
    const authResolverRef = useRef<((value: SessionData | undefined) => void) | null>(null);
    const authPromiseRef = useRef<Promise<SessionData | undefined>>(
        auth !== undefined
            ? Promise.resolve(auth)
            : new Promise<SessionData | undefined>((resolve) => { authResolverRef.current = resolve; })
    );

    useEffect(() => {
        if (auth !== undefined) {
            if (authResolverRef.current) {
                authResolverRef.current(auth);
                authResolverRef.current = null;
            }
            authPromiseRef.current = Promise.resolve(auth);
        }
    }, [auth]);

    if (typeof window === 'undefined') {
        return {
            trackViewPage: () => {},
            trackViewProduct: () => {},
            trackViewSearch: () => {},
            trackViewCategory: () => {},
        };
    }

    const trackViewPage = async (data: { url: string }) => {
        return trackEvent(authPromiseRef.current, appConfig, consentPreferences, siteInfo, 'view_page', {
            path: data.url,
        });
    };

    const trackViewProduct = async (data: { product: ShopperProducts.schemas['Product'] }) => {
        return trackEvent(authPromiseRef.current, appConfig, consentPreferences, siteInfo, 'view_product', {
            product: data.product,
        });
    };

    const trackViewSearch = async (data: {
        searchInputText: string;
        searchResults: ShopperSearch.schemas['ProductSearchHit'][];
        sort: string;
        refinements: ShopperSearch.schemas['ProductSearchResult']['selectedRefinements'];
    }) => {
        return trackEvent(authPromiseRef.current, appConfig, consentPreferences, siteInfo, 'view_search', {
            searchInputText: data.searchInputText,
            searchResults: data.searchResults,
            sort: data.sort || '',
            refinements: data.refinements || {},
        });
    };

    const trackViewCategory = async (data: {
        category: ShopperProducts.schemas['Category'];
        searchResults: ShopperSearch.schemas['ProductSearchHit'][];
    }) => {
        return trackEvent(authPromiseRef.current, appConfig, consentPreferences, siteInfo, 'view_category', {
            category: data.category,
            searchResults: data.searchResults,
            sort: '',
            refinements: {},
        });
    };

    return { trackViewPage, trackViewProduct, trackViewSearch, trackViewCategory };
};
`;

        // Realistic page-view-tracker.tsx content
        const COMPLEX_PAGE_VIEW_TRACKER_FILE = `
'use client';

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useConfig } from '@/config';
import { useAuth } from '@/providers/auth';
import { ensureAdaptersInitialized } from '@/lib/adapters/initialize-adapters';
import { getAllAdapters } from '@/lib/adapters';
import { useTrackingConsent } from '@/hooks/use-tracking-consent';
import { TrackingConsent } from '@/types/tracking-consent';

/**
 * Component that tracks page view events asynchronously
 */
export function PageViewTracker() {
    const location = useLocation();
    const config = useConfig();
    const auth = useAuth();
    const { trackingConsent } = useTrackingConsent();
    const trackedRef = useRef<{ path: string; timestamp: number } | null>(null);
    const trackingResetDuration = config.engagement.analytics.pageViewsResetDuration;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (trackingConsent !== TrackingConsent.Accepted) return;

        const pathname = location.pathname;
        const queryParams = location.search;
        const hash = location.hash;
        const fullPath = \`\${pathname}\${queryParams}\${hash}\`;
        const now = Date.now();

        if (auth === undefined) return;

        if (trackedRef.current?.path === fullPath && now - trackedRef.current.timestamp < trackingResetDuration) {
            return;
        }

        const blockedPaths = config.engagement.analytics.pageViewsBlocklist;
        const shouldTrackPath = !blockedPaths.some((blocked) => pathname.startsWith(blocked));
        if (!shouldTrackPath) return;

        const trackPageView = async () => {
            try {
                await ensureAdaptersInitialized(config);
                const { createEvent, getEventMediator, sendViewPageEvent } = await import(
                    '@salesforce/storefront-next-runtime/events'
                );
                const mediator = getEventMediator(getAllAdapters);
                if (!mediator) return;

                const event = createEvent('view_page', {
                    path: pathname,
                    payload: { userType: auth.userType ?? 'guest', usid: auth.usid },
                });
                sendViewPageEvent(event, mediator);
            } catch (error) {
                trackedRef.current = null;
                if (import.meta.env.DEV) {
                    console.warn('Failed to load and send page view tracking:', error);
                }
            }
        };

        void trackPageView();
        trackedRef.current = { path: fullPath, timestamp: now };
    }, [location.pathname, location.search, location.hash, config, auth, trackingConsent, trackingResetDuration]);

    return null;
}
`;

        it('detects trackEvent calls with single quotes in complex file', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_search: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockReturnValue(COMPLEX_ANALYTICS_FILE);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should not warn because view_search is instrumented in the complex file
            expect(console.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining("'view_search' is never instrumented")
            );
        });

        it('detects multiple trackEvent calls in same file', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_page: true,
                            view_product: true,
                            view_search: true,
                            view_category: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockReturnValue(COMPLEX_ANALYTICS_FILE);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should find all 4 event types in the complex file
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("trackEvent('view_page')")
            );
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("trackEvent('view_product')")
            );
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("trackEvent('view_search')")
            );
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("trackEvent('view_category')")
            );
        });

        it('detects trackEvent calls with double quotes', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_product: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockReturnValue(`
import { useAuth } from '@/providers/auth';
import { createEvent, getEventMediator } from '@salesforce/storefront-next-runtime/events';

async function trackEvent(authPromise, appConfig, trackingConsent, eventType, eventData) {
    const mediator = await getInitializedMediator(appConfig);
    const event = createEvent(eventType, eventData);
    return void mediator.track(event);
}

export const useAnalytics = () => {
    const trackViewProduct = async (data) => {
        return trackEvent(authPromiseRef.current, appConfig, trackingConsent, "view_product", {
            product: data.product,
        });
    };

    return { trackViewProduct };
};
            `);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);
            // Verify plugin runs and detects the double-quoted event
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("trackEvent('view_product')")
            );
        });

        it('detects sendViewPageEvent and createEvent in complex page tracker', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_page: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/lib/page-view-tracker.tsx']);
            mockReadFileSync.mockReturnValue(COMPLEX_PAGE_VIEW_TRACKER_FILE);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should detect both createEvent('view_page') and sendViewPageEvent() in complex context
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("createEvent('view_page')")
            );
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining('sendViewPageEvent()')
            );
        });

        it('detects events across both config file and instrumented files', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_page: true,
                            view_search: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([
                '/test/project/src/hooks/use-analytics.ts',
                '/test/project/src/lib/page-view-tracker.tsx',
            ]);

            // Return different content based on file path
            mockReadFileSync.mockImplementation((filePath) => {
                const path = String(filePath);
                if (path.includes('use-analytics')) {
                    return COMPLEX_ANALYTICS_FILE;
                }
                if (path.includes('page-view-tracker')) {
                    return COMPLEX_PAGE_VIEW_TRACKER_FILE;
                }
                return '';
            });

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should not warn - both events are instrumented across the two files
            expect(console.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('is never instrumented')
            );
        });

        it('detects createEvent calls in isolation', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            cart_item_add: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/components/tracker.tsx']);
            mockReadFileSync.mockReturnValue(`
import { useEffect } from 'react';
import { createEvent, getEventMediator } from '@salesforce/storefront-next-runtime/events';

export function CartTracker({ items, onAdd }) {
    const handleAddToCart = async () => {
        const mediator = getEventMediator(getAllAdapters);
        if (!mediator) return;

        // Track the cart add event
        const event = createEvent('cart_item_add', { cartItems: items });
        mediator.track(event);

        onAdd();
    };

    return <button onClick={handleAddToCart}>Add to Cart</button>;
}
            `);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining("createEvent('cart_item_add')")
            );
        });
    });

    describe('Validation Logic', () => {
        it('skips validation when no engagement config found', async () => {
            mockLoadEngagementConfig.mockResolvedValue(null);
            mockGlob.mockResolvedValue([]);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining('Skipping validation')
            );
        });

        it('skips disabled adapters', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: false, // Disabled
                        eventToggles: {
                            view_search: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([]);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should not warn about view_search since adapter is disabled
            expect(console.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('view_search')
            );
        });

        it('skips test files when scanning', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_page: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([]);

            const plugin = eventInstrumentationValidatorPlugin();

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Verify glob was called with ignore patterns for test files
            expect(mockGlob).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    ignore: expect.arrayContaining(['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx']),
                })
            );
        });
    });

    describe('Error Reporting', () => {
        it('warns about missing instrumentation for enabled events', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_recommender: true, // Enabled but not instrumented
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockReturnValue(`
                // No view_recommender instrumentation
                function trackViewProduct() {
                    return trackEvent(authPromiseRef.current, appConfig, trackingConsent, 'view_product', {});
                }
            `);

            const plugin = eventInstrumentationValidatorPlugin();

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining(
                    "einstein.view_recommender is enabled but 'view_recommender' is never instrumented"
                )
            );
        });

        it('does not throw when failOnMissing is false (default) even with missing instrumentation', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_recommender: true,
                            click_product_in_recommender: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([]);
            mockReadFileSync.mockReturnValue('');

            // Explicitly set failOnMissing: false
            const plugin = eventInstrumentationValidatorPlugin({
                failOnMissing: false,
            });

            // Should NOT throw - just warn
            const path = normalizePath('/test/project');
            await expect(callPluginHooks(plugin, path)).resolves.not.toThrow();

            // But should still warn about the missing events
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('einstein.view_recommender')
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('einstein.click_product_in_recommender')
            );
        });

        it('does not throw with default config (failOnMissing defaults to false)', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    activeData: {
                        enabled: true,
                        eventToggles: {
                            checkout_start: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([]);
            mockReadFileSync.mockReturnValue('');

            // No failOnMissing passed - uses defaults
            const plugin = eventInstrumentationValidatorPlugin();

            // Should NOT throw with default config
            const path = normalizePath('/test/project');
            await expect(callPluginHooks(plugin, path)).resolves.not.toThrow();

            // Should warn about the missing event
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('activeData.checkout_start')
            );
        });

        it('reports missing instrumentation per adapter', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            click_product_in_recommender: true,
                        },
                    },
                    activeData: {
                        enabled: true,
                        eventToggles: {
                            click_product_in_search: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([]);
            mockReadFileSync.mockReturnValue('');

            const plugin = eventInstrumentationValidatorPlugin();

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('einstein.click_product_in_recommender')
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('activeData.click_product_in_search')
            );
        });

        it('throws error when failOnMissing is true', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_recommender: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue([]);
            mockReadFileSync.mockReturnValue('');

            const plugin = eventInstrumentationValidatorPlugin({
                failOnMissing: true,
            });
            const path = normalizePath('/test/project');
            await expect(callPluginHooks(plugin, path)).rejects.toThrow(/event\(s\) are enabled but not instrumented/);
        });

        it('validates custom event types defined in eventToggles', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    customAdapter: {
                        enabled: true,
                        eventToggles: {
                            custom_purchase: true, // Custom event type
                            custom_wishlist_add: true, // Another custom event
                            view_page: true, // Standard event
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/custom-analytics.ts']);
            mockReadFileSync.mockReturnValue(`
                // Only custom_purchase is instrumented
                const trackCustomPurchase = () => {
                    return trackEvent(auth, config, consent, 'custom_purchase', { orderId: '123' });
                };
            `);

            const plugin = eventInstrumentationValidatorPlugin();

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should warn about missing custom_wishlist_add and view_page
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining(
                    "customAdapter.custom_wishlist_add is enabled but 'custom_wishlist_add' is never instrumented"
                )
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining("customAdapter.view_page is enabled but 'view_page' is never instrumented")
            );
            // Should NOT warn about custom_purchase since it IS instrumented
            expect(console.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('custom_purchase is never instrumented')
            );
        });

        it('does not throw when all events are instrumented', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_page: true,
                            view_product: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockReturnValue(`
                trackEvent(a, b, c, 'view_page', {});
                trackEvent(a, b, c, 'view_product', {});
            `);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({
                failOnMissing: true,
            });

            // Should not throw
            const path = normalizePath('/test/project');
            await expect(callPluginHooks(plugin, path)).resolves.not.toThrow();
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:debug]'),
                expect.stringContaining('All enabled events are instrumented')
            );
        });

        it('handles engagement config with no adapters', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                // No adapters property
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockReturnValue(`trackEvent(a, b, c, 'view_page', {});`);

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await expect(callPluginHooks(plugin, path)).resolves.not.toThrow();
        });

        it('handles file read errors gracefully in verbose mode', async () => {
            mockLoadEngagementConfig.mockResolvedValue({
                adapters: {
                    einstein: {
                        enabled: true,
                        eventToggles: {
                            view_page: true,
                        },
                    },
                },
            });
            mockGlob.mockResolvedValue(['/test/project/src/hooks/use-analytics.ts']);
            mockReadFileSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            process.env.SFCC_LOG_LEVEL = 'debug';
            const plugin = eventInstrumentationValidatorPlugin({});

            const path = normalizePath('/test/project');
            await callPluginHooks(plugin, path);

            // Should warn about the file read error
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('Could not read')
            );
        });
    });
});
