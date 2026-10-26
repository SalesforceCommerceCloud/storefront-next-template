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

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { ConfigWrapper, createConfigWrapper, mockBuildConfig, mockConfig, mockSiteObject } from './config';

describe('Config Test Utils', () => {
    describe('ConfigWrapper', () => {
        it('should provide config context to hooks', () => {
            const { result } = renderHook(() => useConfig(), { wrapper: ConfigWrapper });

            expect(result.current).toBeDefined();
            expect(result.current.commerce.api.clientId).toBe('test-client');
            expect(result.current.commerce.sites[0].defaultLocale).toBe('en-GB');
        });

        it('should provide access to all config sections', () => {
            const { result } = renderHook(() => useConfig(), { wrapper: ConfigWrapper });

            expect(result.current.commerce).toBeDefined();
            expect(result.current.commerce.sites).toBeDefined();
            expect(result.current.global).toBeDefined();
            expect(result.current.pages).toBeDefined();
            expect(result.current.performance).toBeDefined();
            expect(result.current.development).toBeDefined();
        });
    });

    describe('createConfigWrapper', () => {
        it('should create a wrapper with default config when no overrides provided', () => {
            const CustomWrapper = createConfigWrapper();
            const { result } = renderHook(() => useConfig(), { wrapper: CustomWrapper });

            expect(result.current.commerce.api.clientId).toBe('test-client');
            expect(result.current.commerce.sites[0].defaultLocale).toBe('en-GB');
        });

        it('should merge overrides with base config', () => {
            const CustomWrapper = createConfigWrapper({
                app: {
                    ...mockBuildConfig.app,
                    commerce: {
                        ...mockBuildConfig.app.commerce,
                        api: {
                            ...mockBuildConfig.app.commerce.api,
                            clientId: 'custom-client',
                        },
                    },
                },
            });

            const { result } = renderHook(() => useConfig(), { wrapper: CustomWrapper });

            expect(result.current.commerce.api.clientId).toBe('custom-client');
            expect(result.current.commerce.sites[0].defaultLocale).toBe('en-GB'); // Original value preserved
        });

        it('should allow overriding site configuration', () => {
            const CustomWrapper = createConfigWrapper({
                app: {
                    ...mockBuildConfig.app,
                    commerce: {
                        ...mockBuildConfig.app.commerce,
                        sites: [
                            {
                                ...mockSiteObject,
                                defaultLocale: 'fr-FR',
                                defaultCurrency: 'EUR',
                            },
                        ],
                    },
                },
            });

            const { result } = renderHook(() => useConfig(), { wrapper: CustomWrapper });

            expect(result.current.commerce.sites[0].defaultLocale).toBe('fr-FR');
            expect(result.current.commerce.sites[0].defaultCurrency).toBe('EUR');
        });

        it('should allow overriding global configuration', () => {
            const CustomWrapper = createConfigWrapper({
                app: {
                    ...mockBuildConfig.app,
                    search: {
                        ...mockBuildConfig.app.search,
                        products: {
                            ...mockBuildConfig.app.search.products,
                            hits: {
                                ...mockBuildConfig.app.search.products.hits,
                                limit: 48,
                            },
                        },
                    },
                },
            });

            const { result } = renderHook(() => useConfig(), { wrapper: CustomWrapper });

            expect(result.current.search.products.hits.limit).toBe(48);
        });
    });

    describe('mockConfig', () => {
        it('should be a valid AppConfig object', () => {
            expect(mockConfig).toBeDefined();
            expect(mockConfig.commerce).toBeDefined();
            expect(mockSiteObject).toBeDefined();
            expect(mockConfig.global).toBeDefined();
        });

        it('should have expected test values', () => {
            expect(mockConfig.commerce.api.clientId).toBe('test-client');
            expect(mockConfig.commerce.api.organizationId).toBe('test-org');
            expect(mockSiteObject.defaultLocale).toBe('en-GB');
            expect(mockSiteObject.defaultCurrency).toBe('GBP');
        });
    });

    describe('mockBuildConfig', () => {
        it('should include metadata section', () => {
            expect(mockBuildConfig.metadata).toBeDefined();
            expect(mockBuildConfig.metadata.projectName).toBe('Test Project');
            expect(mockBuildConfig.metadata.projectSlug).toBe('test-project');
        });

        it('should include runtime section', () => {
            expect(mockBuildConfig.runtime).toBeDefined();
            expect(mockBuildConfig.runtime?.ssrParameters).toBeDefined();
            expect(mockBuildConfig.runtime?.ssrParameters?.ssrFunctionNodeVersion).toBe('24.x');
        });

        it('should include app section with all subsections', () => {
            expect(mockBuildConfig.app).toBeDefined();
            expect(mockBuildConfig.app.pages).toBeDefined();
            expect(mockBuildConfig.app.commerce).toBeDefined();
            expect(mockBuildConfig.app.commerce.sites[0]).toBeDefined();
            expect(mockBuildConfig.app.global).toBeDefined();
            expect(mockBuildConfig.app.performance).toBeDefined();
            expect(mockBuildConfig.app.development).toBeDefined();
        });

        it('should have valid commerce API configuration', () => {
            expect(mockBuildConfig.app.commerce.api.clientId).toBe('test-client');
            expect(mockBuildConfig.app.commerce.api.organizationId).toBe('test-org');
            expect(mockBuildConfig.app.commerce.api.shortCode).toBe('test123');
        });

        it('should have valid page configurations', () => {
            expect(mockBuildConfig.app.pages.home.featuredProductsCount).toBe(12);
            expect(mockBuildConfig.app.pages.cart.quantityUpdateDebounce).toBe(750);
            expect(mockBuildConfig.app.pages.cart.maxQuantityPerItem).toBe(999);
            expect(mockBuildConfig.app.pages.search.enableSearchSuggestions).toBe(true);
        });

        it('should have valid global configurations', () => {
            expect(mockBuildConfig.app.global.branding.name).toBe('Test Store');
            expect(mockBuildConfig.app?.search.products.hits.limit).toBe(24);
            expect(mockBuildConfig.app.global.carousel.defaultItemCount).toBe(5);
            expect(mockBuildConfig.app.global.badges).toHaveLength(2);
        });
    });
});
