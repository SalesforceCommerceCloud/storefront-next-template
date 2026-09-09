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
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import type { BaseConfig } from '../config/schema';

// Mock @react-router/fs-routes
vi.mock('@react-router/fs-routes', () => ({
    flatRoutes: vi.fn(),
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
    default: {
        readdir: vi.fn(() => Promise.reject(new Error('ENOENT'))),
        access: vi.fn(() => Promise.reject(new Error('ENOENT'))),
    },
}));

// Mock loadConfig — returns empty config by default (no URL customisation)
vi.mock('../config/load-config', () => ({
    loadConfig: vi.fn().mockResolvedValue({} as BaseConfig),
}));

import { flatRoutes } from './flat-routes';
import { flatRoutes as _flatRoutes } from '@react-router/fs-routes';
import { loadConfig } from '../config/load-config';
import fs from 'node:fs/promises';
import path from 'node:path';

const mockFlatRoutes = vi.mocked(_flatRoutes);
const mockLoadConfig = vi.mocked(loadConfig);

// Helpers to build test route entries
function layoutRoute(id: string, file: string, children: RouteConfigEntry[]): RouteConfigEntry {
    return { id, file, children } as RouteConfigEntry;
}

function indexRoute(id: string, file: string): RouteConfigEntry {
    return { id, file, index: true } as RouteConfigEntry;
}

function route(id: string, file: string, routePath: string): RouteConfigEntry {
    return { id, file, path: routePath } as RouteConfigEntry;
}

function findRoute(routes: RouteConfigEntry[], id: string): RouteConfigEntry | undefined {
    for (const entry of routes) {
        if (entry.id === id) return entry;
        const match = entry.children ? findRoute(entry.children, id) : undefined;
        if (match) return match;
    }
    return undefined;
}

describe('flatRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: no URL config
        mockLoadConfig.mockResolvedValue({} as BaseConfig);
        // Default: no VERTICAL env override (some tests below set it explicitly)
        delete process.env.VERTICAL;
    });

    it('should return routes as-is when no options are provided', async () => {
        const baseRoutes: RouteConfigEntry[] = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
        ];
        mockFlatRoutes.mockResolvedValue(baseRoutes);

        const result = await flatRoutes();

        expect(result).toBe(baseRoutes);
        expect(mockFlatRoutes).toHaveBeenCalledWith({
            ignoredRouteFiles: ['**/*.test.{ts,tsx}'],
            rootDirectory: undefined,
        });
    });

    it('should pass rootDirectory to _flatRoutes', async () => {
        const baseRoutes: RouteConfigEntry[] = [];
        mockFlatRoutes.mockResolvedValue(baseRoutes);

        await flatRoutes({ rootDirectory: 'custom/routes' });

        expect(mockFlatRoutes).toHaveBeenCalledWith({
            ignoredRouteFiles: ['**/*.test.{ts,tsx}'],
            rootDirectory: 'custom/routes',
        });
    });

    it('should merge extension routes when extensions directory exists', async () => {
        const baseRoutes: RouteConfigEntry[] = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
        ];
        const extensionRoutes: RouteConfigEntry[] = [layoutRoute('routes/_app', 'routes/_app.tsx', [])];

        mockFlatRoutes.mockResolvedValueOnce(baseRoutes).mockResolvedValueOnce(extensionRoutes);

        vi.mocked(fs.readdir).mockResolvedValue(['my-ext'] as any);
        vi.mocked(fs.access).mockImplementation((p) => {
            if (String(p) === path.join('.', 'src', 'extensions', 'my-ext', 'routes')) return Promise.resolve();
            return Promise.reject(new Error('ENOENT'));
        });

        const result = await flatRoutes();

        expect(mockFlatRoutes).toHaveBeenCalledTimes(2);
        expect(mockFlatRoutes).toHaveBeenCalledWith({
            ignoredRouteFiles: ['**/*.test.{ts,tsx}'],
            rootDirectory: 'extensions/my-ext/routes',
        });
        expect(result).toBe(baseRoutes);
    });

    it('should apply URL config with default wrapperFile', async () => {
        const baseRoutes: RouteConfigEntry[] = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
        ];
        mockFlatRoutes.mockResolvedValue(baseRoutes);
        mockLoadConfig.mockResolvedValue({
            metadata: { projectName: 'Test', projectSlug: 'test' },
            app: {
                commerce: { api: { clientId: '', organizationId: '', siteId: '', shortCode: '' }, sites: [] },
                defaultSiteId: '',
                url: {
                    prefix: '/:siteId/:localeId',
                    excludeRoutes: [],
                },
            },
        } as BaseConfig);

        vi.mocked(fs.access).mockImplementation((p) => {
            if (String(p) === path.join('.', 'src', 'app-wrapper.tsx')) return Promise.resolve();
            return Promise.reject(new Error('ENOENT'));
        });

        const result = await flatRoutes();

        const wrapper = result.find((r) => r.id === 'site-context-wrapper');
        expect(wrapper).toBeDefined();
        expect(wrapper?.path).toBe(':siteId/:localeId');
        expect(wrapper?.file).toBe('app-wrapper.tsx');
    });

    it('should register SEO aliases before applying the site and locale wrapper', async () => {
        const baseRoutes: RouteConfigEntry[] = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [
                indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                route('routes/_app.product.$productId', 'routes/_app.product.$productId.tsx', 'product/:productId'),
                route(
                    'routes/_app.category.$categoryId',
                    'routes/_app.category.$categoryId.tsx',
                    'category/:categoryId'
                ),
            ]),
        ];
        mockFlatRoutes.mockResolvedValue(baseRoutes);
        mockLoadConfig.mockResolvedValue({
            metadata: { projectName: 'Test', projectSlug: 'test' },
            app: {
                commerce: { api: { clientId: '', organizationId: '', siteId: '', shortCode: '' }, sites: [] },
                defaultSiteId: '',
                url: {
                    prefix: '/:siteId/:localeId',
                    excludeRoutes: [],
                    seoRoutes: {
                        RefArchGlobal: {
                            product: { prefix: 'p' },
                            category: { prefix: 'c', mode: 'id-suffix' },
                        },
                    },
                },
            },
        } as BaseConfig);

        vi.mocked(fs.access).mockImplementation((p) => {
            if (String(p) === path.join('.', 'src', 'app-wrapper.tsx')) return Promise.resolve();
            return Promise.reject(new Error('ENOENT'));
        });

        const result = await flatRoutes();

        const siteWrapper = findRoute(result, 'site-context-wrapper');
        const product = findRoute(result, 'routes/_app.product.$productId');
        const category = findRoute(result, 'routes/_app.category.$categoryId');
        expect(siteWrapper?.path).toBe(':siteId/:localeId');
        expect(product?.path).toBeUndefined();
        expect(product?.children?.[0]).toMatchObject({ path: 'p/*', file: 'app-wrapper.tsx' });
        expect(category?.path).toBeUndefined();
        expect(category?.children?.[0]).toMatchObject({ path: 'c/*', file: 'app-wrapper.tsx' });
        expect(mockLoadConfig).toHaveBeenCalledOnce();
    });

    it('should require the pass-through wrapper when SEO routes are configured without an outer prefix', async () => {
        mockFlatRoutes.mockResolvedValue([
            layoutRoute('routes/_app', 'routes/_app.tsx', [
                route('routes/_app.product.$productId', 'routes/_app.product.$productId.tsx', 'product/:productId'),
                route(
                    'routes/_app.category.$categoryId',
                    'routes/_app.category.$categoryId.tsx',
                    'category/:categoryId'
                ),
            ]),
        ]);
        mockLoadConfig.mockResolvedValue({
            metadata: { projectName: 'Test', projectSlug: 'test' },
            app: {
                commerce: { api: { clientId: '', organizationId: '', siteId: '', shortCode: '' }, sites: [] },
                defaultSiteId: '',
                url: {
                    seoRoutes: {
                        RefArchGlobal: {
                            product: { prefix: 'p' },
                            category: { prefix: 'c', mode: 'id-suffix' },
                        },
                    },
                },
            },
        } as BaseConfig);
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        await expect(flatRoutes()).rejects.toThrow(/"src\/app-wrapper\.tsx" does not exist/);
    });

    it('should throw if wrapper file does not exist', async () => {
        mockFlatRoutes.mockResolvedValue([]);
        mockLoadConfig.mockResolvedValue({
            metadata: { projectName: 'Test', projectSlug: 'test' },
            app: {
                commerce: { api: { clientId: '', organizationId: '', siteId: '', shortCode: '' }, sites: [] },
                defaultSiteId: '',
                url: {
                    prefix: '/:siteId/:localeId',
                },
            },
        } as BaseConfig);

        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        await expect(flatRoutes()).rejects.toThrow(/"src\/app-wrapper\.tsx" does not exist/);
    });

    it('should not apply URL config when loadConfig returns empty object', async () => {
        const baseRoutes: RouteConfigEntry[] = [
            layoutRoute('routes/_app', 'routes/_app.tsx', [indexRoute('routes/_app._index', 'routes/_app._index.tsx')]),
        ];
        mockFlatRoutes.mockResolvedValue(baseRoutes);
        mockLoadConfig.mockResolvedValue({} as BaseConfig);

        const result = await flatRoutes();

        // applyUrlConfig returns routes unchanged when no prefix
        expect(result).toBe(baseRoutes);
    });

    it('should call loadConfig to get URL configuration', async () => {
        mockFlatRoutes.mockResolvedValue([]);
        mockLoadConfig.mockResolvedValue({} as BaseConfig);

        await flatRoutes();

        expect(mockLoadConfig).toHaveBeenCalledOnce();
    });

    it('should not scan verticals/ when VERTICAL env var is unset', async () => {
        mockFlatRoutes.mockResolvedValue([]);

        await flatRoutes();

        // Only one call: the base scan. No vertical pass — the discovery
        // function short-circuits before any fs probe when VERTICAL is unset.
        expect(mockFlatRoutes).toHaveBeenCalledTimes(1);
        const accessCalls = vi.mocked(fs.access).mock.calls.map(([p]) => String(p));
        expect(accessCalls.some((p) => p.includes(`src${path.sep}verticals`))).toBe(false);
    });

    it('should merge vertical routes when VERTICAL is set and the directory exists', async () => {
        process.env.VERTICAL = 'cosmetic';
        try {
            const baseRoutes: RouteConfigEntry[] = [
                layoutRoute('routes/_app', 'routes/_app.tsx', [
                    indexRoute('routes/_app._index', 'routes/_app._index.tsx'),
                ]),
            ];
            const verticalRoutes: RouteConfigEntry[] = [
                indexRoute('verticals/cosmetic/routes/_app._index', 'verticals/cosmetic/routes/_app._index.tsx'),
            ];
            mockFlatRoutes.mockResolvedValueOnce(baseRoutes).mockResolvedValueOnce(verticalRoutes);

            vi.mocked(fs.access).mockImplementation((p) => {
                if (String(p) === path.join('.', 'src', 'verticals', 'cosmetic', 'routes')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });

            const result = await flatRoutes();

            expect(mockFlatRoutes).toHaveBeenCalledTimes(2);
            expect(mockFlatRoutes).toHaveBeenCalledWith({
                ignoredRouteFiles: ['**/*.test.{ts,tsx}'],
                rootDirectory: 'verticals/cosmetic/routes',
            });
            // Vertical overrode the matching index route's file
            const appLayout = result.find((r) => r.id === 'routes/_app');
            const idx = appLayout?.children?.find((r) => r.id === 'routes/_app._index');
            expect(idx?.file).toBe('verticals/cosmetic/routes/_app._index.tsx');
        } finally {
            delete process.env.VERTICAL;
        }
    });

    it('should skip the vertical pass when the directory does not exist', async () => {
        process.env.VERTICAL = 'cosmetic';
        try {
            mockFlatRoutes.mockResolvedValue([]);
            // fs.access rejects for both extensions/ and verticals/cosmetic/routes
            vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

            await flatRoutes();

            // Only the base scan ran; vertical lookup short-circuited on access failure
            expect(mockFlatRoutes).toHaveBeenCalledTimes(1);
        } finally {
            delete process.env.VERTICAL;
        }
    });
});
