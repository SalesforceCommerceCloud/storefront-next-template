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
import '@testing-library/jest-dom';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

// Lift the default `waitFor` / `findBy*` timeout from 1s to 10s. Windows CI runners
// resolve lazy chunks and Suspense boundaries noticeably slower than macOS/Linux,
// and the 1s ceiling causes intermittent flakes (e.g. account orders, cart
// recommendations) without making the underlying tests any wronger.
configure({ asyncUtilTimeout: 10000 });
import { mockConfig } from '@/test-utils/config';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import resources from '@/locales';
import 'vitest-localstorage-mock';

// Clear engagement-related PUBLIC__ env vars before any modules load
// The engagement config is protected from env var overrides, so these must be cleared
// to prevent defineConfig from throwing during module initialization
for (const key of Object.keys(process.env)) {
    if (key.startsWith('PUBLIC__') && key.toLowerCase().includes('engagement')) {
        delete process.env[key];
    }
}

// Set window.__APP_CONFIG__ before any modules are imported
// This ensures getConfig() works during module initialization in tests where it is used before the config provider is rendered.
// to initialize AuthContext for hydration.
(window as unknown as Window & { __APP_CONFIG__: typeof mockConfig }).__APP_CONFIG__ = mockConfig;

// Initialize i18next for tests that use components with useTranslation
// This runs before all tests but individual tests can reinitialize as needed
beforeAll(() => {
    if (!i18next.isInitialized) {
        void i18next.use(initReactI18next).init({
            lng: 'en-GB',
            fallbackLng: 'en-GB',
            resources,
            interpolation: {
                escapeValue: false,
                format: (value, format) => {
                    if (format === 'number' && typeof value === 'number') {
                        return value.toLocaleString('en-GB');
                    }
                    return value;
                },
            },
        });
    }
});

// Mock useAnalytics hook globally for all tests
// Individual tests can override this if they need specific behavior
//
// TRADE-OFF: This global mock means components that should call tracking functions but don't
// will pass tests silently. Missing track calls are only caught via:
// 1. Storybook interaction tests (if the story exercises the analytics path)
// 2. Production telemetry (if monitoring alerts on missing events)
//
// Tests that need to assert on specific track-function calls must use vi.unmock('@/hooks/use-analytics')
// in a beforeEach block, then provide their own mock implementation that can be spied on.
vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({
        trackViewPage: vi.fn(),
        trackViewProduct: vi.fn(),
        trackCartItemAdd: vi.fn(),
        trackCheckoutStart: vi.fn(),
        trackCheckoutStep: vi.fn(),
        trackViewSearch: vi.fn(),
        trackViewCategory: vi.fn(),
        trackClickProductInCategory: vi.fn(),
        trackClickProductInSearch: vi.fn(),
        trackViewSearchSuggestions: vi.fn(),
        trackClickSearchSuggestion: vi.fn(),
        trackWishlistItemAdded: vi.fn(),
        trackWishlistItemRemoved: vi.fn(),
        trackWishlistViewed: vi.fn(),
        trackWishlistItemMerged: vi.fn(),
        trackWishlistMerged: vi.fn(),
    }),
}));

// Mock getI18nextInstance to return an i18next instance for server actions
// Individual tests can override this if needed
vi.mock('@/middlewares/i18next', async () => {
    const actual = await vi.importActual('@/middlewares/i18next');
    // Create a simple mock i18next that has the t function with proper namespaces
    const mockI18next = {
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        t: (key: string, options?: any) => {
            // Handle namespace:key format
            if (key.includes(':')) {
                const [ns, ...keyParts] = key.split(':');
                const keyPath = keyParts.join(':'); // rejoin in case there are multiple colons

                // Navigate nested object using dot notation
                const keys = keyPath.split('.');
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                let value: any = resources['en-GB'][ns as keyof (typeof resources)['en-GB']];
                for (const k of keys) {
                    if (value && typeof value === 'object') {
                        value = value[k];
                    } else {
                        break;
                    }
                }

                if (typeof value === 'string' && options) {
                    // Simple interpolation for {{variable}} and {{variable, number}} syntax
                    return value.replace(/\{\{(\w+)(?:,\s*number)?\}\}/g, (_, prop) => {
                        const val = options[prop];
                        if (val === undefined) return `{{${prop}}}`;
                        // Format numbers with locale-specific thousands separators
                        if (typeof val === 'number') {
                            return val.toLocaleString('en-GB');
                        }
                        return val;
                    });
                }
                return value || key;
            }
            return key;
        },
        language: 'en-GB',
    };

    return {
        ...actual,
        getI18nextInstance: () => mockI18next,
        getLocale: () => 'en-GB',
    };
});

afterEach(() => {
    cleanup();
});

// Mock window.matchMedia for required components
// Use a regular function instead of vi.fn() to prevent vi.restoreAllMocks() from clearing it
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {
            // noop
        },
        removeListener: () => {
            // noop
        },
        addEventListener: () => {
            // noop
        },
        removeEventListener: () => {
            // noop
        },
        dispatchEvent: () => true,
    }),
});

// Mock ResizeObserver - use class for Vitest 4 compatibility
global.ResizeObserver = class ResizeObserver {
    observe() {
        // noop for test mock
    }
    unobserve() {
        // noop for test mock
    }
    disconnect() {
        // noop for test mock
    }
};

// Mock IntersectionObserver for carousel components - use class for Vitest 4 compatibility
global.IntersectionObserver = class IntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    observe() {
        // noop for test mock
    }
    unobserve() {
        // noop for test mock
    }
    disconnect() {
        // noop for test mock
    }
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
};
