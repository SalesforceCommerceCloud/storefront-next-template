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
/**
 * PageViewTracker Component Tests
 *
 * Tests the page view tracking functionality including:
 * - Page view event tracking
 * - Blocklist functionality
 * - Duplicate tracking prevention
 * - User context handling
 * - Error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { PageViewTracker } from './page-view-tracker';
import type { SessionData } from '@/lib/api/types';
import { mockSiteObject } from '@/test-utils/config';

import { createEvent, sendViewPageEvent, getEventMediator } from '@salesforce/storefront-next-runtime/events';
import { getAllAdapters, buildConsentPreferences } from '@/lib/adapters';
import { initializeEngagementAdapters } from '@/lib/adapters/engagement/register';
import { ensureAdaptersInitialized } from '@/lib/adapters/engagement/initialize';
import { TrackingConsent } from '@/types/tracking-consent';
import { resourceRoutes } from '@/route-paths';

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => mockLogger),
}));

// Mock dependencies
const mockUseAuth = vi.fn();
const mockUseConfig = vi.fn();
const mockUseTrackingConsent = vi.fn();
const mockUseSite = vi.fn();
const mockUseTranslation = vi.fn();

// Don't mock useLocation - let it use the actual router location

vi.mock('@/providers/auth', () => ({
    useAuth: () => mockUseAuth(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => mockUseConfig(),
}));

vi.mock('@/hooks/use-tracking-consent', () => ({
    useTrackingConsent: () => mockUseTrackingConsent(),
}));

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: () => mockUseSite(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => mockUseTranslation(),
}));

// Mock dynamic imports - these are loaded asynchronously
vi.mock('@salesforce/storefront-next-runtime/events', async () => {
    const actual = await vi.importActual('@salesforce/storefront-next-runtime/events');
    return {
        ...actual,
        createEvent: vi.fn(),
        sendViewPageEvent: vi.fn(),
        getEventMediator: vi.fn(),
    };
});

vi.mock('@/lib/adapters', () => ({
    getAllAdapters: vi.fn(),
    buildConsentPreferences: vi.fn(),
}));

vi.mock('@/lib/adapters/engagement/register', () => ({
    initializeEngagementAdapters: vi.fn(),
}));

vi.mock('@/lib/adapters/engagement/initialize', () => ({
    ensureAdaptersInitialized: vi.fn(),
}));

describe('PageViewTracker', () => {
    const mockEventMediator = {
        track: vi.fn(),
    };

    const mockEvent = {
        eventType: 'view_page' as const,
        path: '/test-page',
        payload: {
            userType: 'guest' as const,
            usid: undefined,
        },
    };

    const mockConsentCategories = ['necessary', 'analytics', 'marketing', 'personalization'];
    const mockConsentPreferences = [...mockConsentCategories];

    const defaultConfig = {
        engagement: {
            analytics: {
                pageViewsBlocklist: [],
                pageViewsResetDuration: 1500, // 1.5 seconds
                trackingConsent: {
                    consentCategories: mockConsentCategories,
                },
            },
        },
    };

    // Default guest auth object for tests (auth must be defined to track)
    const defaultGuestAuth: SessionData = {
        userType: 'guest',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mocks - auth must be defined for tracking to occur
        mockUseAuth.mockReturnValue(defaultGuestAuth);
        mockUseConfig.mockReturnValue(defaultConfig);
        mockUseSite.mockReturnValue({
            site: { id: mockSiteObject.id },
            language: mockSiteObject.defaultLocale,
            currency: mockSiteObject.defaultCurrency,
        });
        mockUseTranslation.mockReturnValue({ i18n: { language: mockSiteObject.defaultLocale } });

        // Default to tracking consent accepted for all existing tests
        mockUseTrackingConsent.mockReturnValue({
            trackingConsent: TrackingConsent.Accepted,
            isTrackingConsentEnabled: true,
            shouldShowBanner: false,
            setTrackingConsent: vi.fn(),
            defaultTrackingConsent: TrackingConsent.Declined,
        });

        // Default: accepted consent returns all categories
        vi.mocked(buildConsentPreferences).mockReturnValue(mockConsentPreferences);

        // Setup dynamic import mocks
        vi.mocked(createEvent).mockReturnValue(mockEvent);
        vi.mocked(sendViewPageEvent).mockImplementation(() => {});
        vi.mocked(getAllAdapters).mockReturnValue([]);
        vi.mocked(initializeEngagementAdapters).mockResolvedValue(undefined);
        vi.mocked(ensureAdaptersInitialized).mockResolvedValue(undefined);
        vi.mocked(getEventMediator).mockReturnValue(mockEventMediator);

        // Ensure window is defined (client-side)
        Object.defineProperty(window, 'window', {
            value: globalThis,
            writable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const renderPageViewTracker = (initialPath = '/test-page') => {
        const router = createMemoryRouter(
            [
                {
                    path: '*',
                    element: <PageViewTracker />,
                },
            ],
            {
                initialEntries: [initialPath],
            }
        );

        return { ...render(<RouterProvider router={router} />), router };
    };

    // Helper to wait for async tracking operations to complete
    const waitForAsyncTracking = async (delay = 100) => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, delay));
        });
    };

    // Helper to wait for tracking to complete and verify call count
    const waitForTracking = async (expectedCallCount: number, timeout = 2000) => {
        await waitFor(
            () => {
                expect(createEvent).toHaveBeenCalledTimes(expectedCallCount);
            },
            { timeout }
        );
        await waitForAsyncTracking();
    };

    // Helper to wait and verify no tracking occurred
    const waitForNoTracking = async () => {
        await waitForAsyncTracking();
        expect(createEvent).not.toHaveBeenCalled();
        expect(sendViewPageEvent).not.toHaveBeenCalled();
    };

    // Helper to create an updated config object (new reference to trigger re-render)
    const createUpdatedConfig = (baseConfig = defaultConfig) => ({
        ...baseConfig,
        engagement: {
            ...baseConfig.engagement,
            analytics: {
                ...baseConfig.engagement.analytics,
                pageViewsBlocklist: [], // Same blocklist, but new object reference
            },
        },
    });

    // Helper to re-render the PageViewTracker component
    const rerenderPageViewTracker = (rerender: ReturnType<typeof render>['rerender'], path: string) => {
        const updatedConfig = createUpdatedConfig();
        mockUseConfig.mockReturnValue(updatedConfig);

        rerender(
            <RouterProvider
                router={createMemoryRouter(
                    [
                        {
                            path: '*',
                            element: <PageViewTracker />,
                        },
                    ],
                    {
                        initialEntries: [path],
                    }
                )}
            />
        );
    };

    // Helper to wait for the reset duration to pass
    const waitForResetDuration = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1600));
        });
    };

    // Helper to verify a page view event was tracked
    const expectPageViewTracked = (
        path: string,
        payload: { userType: string; usid?: string; customerId?: string },
        callNumber?: number
    ) => {
        if (callNumber) {
            expect(createEvent).toHaveBeenNthCalledWith(callNumber, 'view_page', { path, payload });
        } else {
            expect(createEvent).toHaveBeenCalledWith('view_page', { path, payload });
        }
    };

    describe('Basic tracking', () => {
        it('should wait for auth to be defined before tracking', async () => {
            mockUseAuth.mockReturnValue(undefined);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitForNoTracking();
        });

        it('should track page view for guest user', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expectPageViewTracked('/test-page', { userType: 'guest', usid: undefined });
            });

            await waitFor(() => {
                expect(sendViewPageEvent).toHaveBeenCalledWith(
                    mockEvent,
                    mockEventMediator,
                    {
                        siteId: mockSiteObject.id,
                        localeId: mockSiteObject.defaultLocale,
                    },
                    mockConsentPreferences
                );
            });
        });

        it('should track page view for registered user', async () => {
            const mockAuth: SessionData = {
                accessToken: 'test-token',
                customerId: 'test-customer',
                usid: 'test-usid',
                userType: 'registered',
            };

            mockUseAuth.mockReturnValue(mockAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expectPageViewTracked('/test-page', {
                    userType: 'registered',
                    usid: 'test-usid',
                    customerId: 'test-customer',
                });
            });

            await waitFor(() => {
                expect(sendViewPageEvent).toHaveBeenCalledWith(
                    mockEvent,
                    mockEventMediator,
                    {
                        siteId: mockSiteObject.id,
                        localeId: mockSiteObject.defaultLocale,
                    },
                    mockConsentPreferences
                );
            });
        });
    });

    describe('Blocklist functionality', () => {
        it('should not track page views for blocked paths', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue({
                engagement: {
                    analytics: {
                        pageViewsBlocklist: ['/action'],
                    },
                },
            });

            renderPageViewTracker(resourceRoutes.cartItemRemove);

            await waitForNoTracking();
        });
    });

    describe('Duplicate tracking prevention', () => {
        it('should not track the same path twice if page re-renders before reset duration', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            const { rerender } = renderPageViewTracker('/test-page');

            await waitForTracking(1);

            // Force a re-render immediately (within reset duration of 1.5 seconds)
            rerenderPageViewTracker(rerender, '/test-page');

            await waitForAsyncTracking();

            expect(createEvent).toHaveBeenCalledTimes(1);
        });

        it('should track the same path again after reset duration when page re-renders', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            const { rerender } = renderPageViewTracker('/test-page');

            await waitForTracking(1);

            // Wait for the reset duration to pass (1.5 seconds + buffer)
            await waitForResetDuration();

            // Force a re-render by changing the config (which is a dependency of useEffect)
            rerenderPageViewTracker(rerender, '/test-page');

            await waitForTracking(2);

            // Verify both calls were for the exact same path /test-page (no query params, no hash)
            expectPageViewTracked('/test-page', { userType: 'guest', usid: undefined }, 1);
            expectPageViewTracked('/test-page', { userType: 'guest', usid: undefined }, 2);
        });

        it('should track different paths separately', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            const { router } = renderPageViewTracker('/page1');

            await waitForTracking(1);

            await act(async () => {
                await router.navigate('/page2');
            });

            await waitForTracking(2);
        });

        it('should track same pathname with different query params separately', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            const { router } = renderPageViewTracker('/test-page?param1=value1');

            await waitForTracking(1);

            await act(async () => {
                await router.navigate('/test-page?param2=value2');
            });

            await waitForTracking(2);
        });
    });

    describe('Error handling', () => {
        it('should skip tracking when analytics initialization fails', async () => {
            vi.mocked(getEventMediator).mockReturnValue(undefined);
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitForNoTracking();
        });

        it('should handle sendPageViewEvent errors gracefully', async () => {
            vi.mocked(sendViewPageEvent).mockImplementation(() => {
                throw new Error('Send failed');
            });

            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expect(createEvent).toHaveBeenCalled();
            });

            await waitForAsyncTracking();

            if (import.meta.env.DEV) {
                expect(mockLogger.warn).toHaveBeenCalledWith('Failed to load and send page view tracking', {
                    error: expect.any(Error),
                });
            }
        });
    });

    describe('User context', () => {
        it('should use guest when userType is undefined', async () => {
            const mockAuth = {
                usid: 'test-usid',
                userType: undefined,
            };

            mockUseAuth.mockReturnValue(mockAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expectPageViewTracked('/test-page', { userType: 'guest', usid: 'test-usid' });
            });

            await waitFor(() => {
                expect(sendViewPageEvent).toHaveBeenCalledWith(
                    mockEvent,
                    mockEventMediator,
                    {
                        siteId: mockSiteObject.id,
                        localeId: mockSiteObject.defaultLocale,
                    },
                    mockConsentPreferences
                );
            });
        });

        it('should handle undefined usid gracefully', async () => {
            const mockAuth: SessionData = {
                accessToken: 'test-token',
                customerId: 'test-customer',
                userType: 'registered',
                usid: undefined,
            };

            mockUseAuth.mockReturnValue(mockAuth);
            mockUseConfig.mockReturnValue(defaultConfig);

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expectPageViewTracked('/test-page', {
                    userType: 'registered',
                    usid: undefined,
                    customerId: 'test-customer',
                });
            });

            await waitFor(() => {
                expect(sendViewPageEvent).toHaveBeenCalledWith(
                    mockEvent,
                    mockEventMediator,
                    {
                        siteId: mockSiteObject.id,
                        localeId: mockSiteObject.defaultLocale,
                    },
                    mockConsentPreferences
                );
            });
        });
    });

    describe('Component rendering', () => {
        it('should render nothing (returns null)', () => {
            const { container } = renderPageViewTracker('/test-page');
            expect(container.firstChild).toBeNull();
        });
    });

    describe('Tracking consent', () => {
        it('should not track when tracking consent is declined', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);
            mockUseTrackingConsent.mockReturnValue({
                trackingConsent: TrackingConsent.Declined,
                isTrackingConsentEnabled: true,
                shouldShowBanner: false,
                setTrackingConsent: vi.fn(),
                defaultTrackingConsent: TrackingConsent.Declined,
            });
            vi.mocked(buildConsentPreferences).mockReturnValue([]);

            renderPageViewTracker('/test-page');

            await waitForNoTracking();
        });

        it('should not track when tracking consent is undefined', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);
            mockUseTrackingConsent.mockReturnValue({
                trackingConsent: undefined,
                isTrackingConsentEnabled: true,
                shouldShowBanner: true,
                setTrackingConsent: vi.fn(),
                defaultTrackingConsent: TrackingConsent.Declined,
            });
            vi.mocked(buildConsentPreferences).mockReturnValue(undefined);

            renderPageViewTracker('/test-page');

            await waitForNoTracking();
        });

        it('should track when tracking consent is accepted', async () => {
            mockUseAuth.mockReturnValue(defaultGuestAuth);
            mockUseConfig.mockReturnValue(defaultConfig);
            mockUseTrackingConsent.mockReturnValue({
                trackingConsent: TrackingConsent.Accepted,
                isTrackingConsentEnabled: true,
                shouldShowBanner: false,
                setTrackingConsent: vi.fn(),
                defaultTrackingConsent: TrackingConsent.Declined,
            });

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expectPageViewTracked('/test-page', { userType: 'guest', usid: undefined });
            });

            await waitFor(() => {
                expect(sendViewPageEvent).toHaveBeenCalledWith(
                    mockEvent,
                    mockEventMediator,
                    {
                        siteId: mockSiteObject.id,
                        localeId: mockSiteObject.defaultLocale,
                    },
                    mockConsentPreferences
                );
            });
        });
    });

    describe('Dynamic site/locale', () => {
        it('should pass correct siteInfo for a different site and locale', async () => {
            mockUseSite.mockReturnValue({ site: { id: 'SiteGenesis' }, language: 'fr-FR', currency: 'USD' });
            mockUseTranslation.mockReturnValue({ i18n: { language: 'fr-FR' } });

            renderPageViewTracker('/test-page');

            await waitFor(() => {
                expect(sendViewPageEvent).toHaveBeenCalledWith(
                    mockEvent,
                    mockEventMediator,
                    {
                        siteId: 'SiteGenesis',
                        localeId: 'fr-FR',
                    },
                    mockConsentPreferences
                );
            });
        });

        it('should not track when useSite returns undefined site', async () => {
            mockUseSite.mockReturnValue({
                site: undefined,
                language: mockSiteObject.defaultLocale,
                currency: mockSiteObject.defaultCurrency,
            });

            renderPageViewTracker('/test-page');

            await waitForAsyncTracking();
            expect(sendViewPageEvent).not.toHaveBeenCalled();
        });
    });
});
