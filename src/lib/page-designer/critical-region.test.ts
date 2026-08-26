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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopperExperience } from '@/scapi';
import { emitCriticalRegionResourceHints, prepareCriticalRegion } from './critical-region';

const mocks = vi.hoisted(() => ({
    loaded: new Set<string>(),
    preloadModule: vi.fn(),
    preinit: vi.fn(),
    resolvePreloadResources: vi.fn((_manifest: unknown, _typeIds: Iterable<string>, _options?: unknown) => [
        { kind: 'style' as const, href: '/bundle/hero.css' },
        { kind: 'module' as const, href: '/bundle/hero.js' },
    ]),
    loadAndRegister: vi.fn((typeIds: Iterable<string>) => {
        for (const typeId of typeIds) mocks.loaded.add(typeId);
        return Promise.resolve();
    }),
    warn: vi.fn(),
}));

vi.mock('react-dom', () => ({ preloadModule: mocks.preloadModule, preinit: mocks.preinit }));
vi.mock('virtual:storefront-next/page-designer-preload-manifest', () => ({
    default: { version: 1, compression: { brotli: { quality: 9 }, gzip: { level: 6 } }, resources: [], components: {} },
}));
vi.mock('@salesforce/storefront-next-runtime/design/preload', () => ({
    resolvePreloadResources: mocks.resolvePreloadResources,
}));
vi.mock('@salesforce/storefront-next-runtime/assets', () => ({
    getClientBundlePath: () => '/bundle/',
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: mocks.warn }) }));
vi.mock('@/lib/page-designer/registry', () => ({
    registry: { hasConcreteComponent: (typeId: string) => mocks.loaded.has(typeId) },
}));
vi.mock('./static-registry', () => ({
    loadAndRegisterRegistryComponents: mocks.loadAndRegister,
}));

function component(id: string, typeId: string, regions?: ShopperExperience.schemas['Region'][]) {
    return { id, typeId, regions } as ShopperExperience.schemas['Component'];
}

function region(id: string, components: ShopperExperience.schemas['Component'][]) {
    return { id, components } as ShopperExperience.schemas['Region'];
}

describe('prepareCriticalRegion', () => {
    beforeEach(() => {
        mocks.loaded.clear();
        vi.clearAllMocks();
        mocks.resolvePreloadResources.mockReturnValue([
            { kind: 'style', href: '/bundle/hero.css' },
            { kind: 'module', href: '/bundle/hero.js' },
        ]);
        mocks.loadAndRegister.mockImplementation((typeIds: Iterable<string>) => {
            for (const typeId of typeIds) mocks.loaded.add(typeId);
            return Promise.resolve();
        });
    });

    it('emits resource hints, suspends for concrete modules, and returns nested component IDs on retry', async () => {
        const criticalRegion = region('hero', [
            component('outer', 'Layout.hero', [region('nested', [component('inner', 'Content.hero')])]),
            component('duplicate-type', 'Content.hero'),
        ]);
        emitCriticalRegionResourceHints(['Layout.hero', 'Content.hero']);

        let preparation: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            preparation = thrown as Promise<void>;
        }

        expect(preparation).toBeInstanceOf(Promise);
        expect(mocks.loadAndRegister).toHaveBeenCalledWith(['Layout.hero', 'Content.hero']);
        expect(mocks.preinit).toHaveBeenCalledWith('/bundle/hero.css', {
            as: 'style',
            precedence: 'page-designer',
        });
        expect(mocks.preloadModule).toHaveBeenCalledWith('/bundle/hero.js', {
            as: 'script',
            crossOrigin: 'anonymous',
        });

        await preparation;
        const componentIds = prepareCriticalRegion(criticalRegion);
        expect(componentIds).toEqual(['outer', 'inner', 'duplicate-type']);
        expect(prepareCriticalRegion(criticalRegion)).toBe(componentIds);
        expect(mocks.resolvePreloadResources).toHaveBeenCalledOnce();
    });

    it('preserves component-type order through resource caching and hint emission', () => {
        mocks.resolvePreloadResources.mockImplementation((_manifest, typeIds: Iterable<string>) =>
            [...typeIds].map((typeId) => ({ kind: 'style' as const, href: `/bundle/${typeId}.css` }))
        );

        emitCriticalRegionResourceHints(['Layout.orderZ', 'Content.orderA']);
        emitCriticalRegionResourceHints(['Content.orderA', 'Layout.orderZ']);

        expect(mocks.resolvePreloadResources).toHaveBeenCalledTimes(2);
        expect(mocks.resolvePreloadResources.mock.calls.map(([, typeIds]) => typeIds)).toEqual([
            ['Layout.orderZ', 'Content.orderA'],
            ['Content.orderA', 'Layout.orderZ'],
        ]);
        expect(mocks.preinit.mock.calls.map(([href]) => href)).toEqual([
            '/bundle/Layout.orderZ.css',
            '/bundle/Content.orderA.css',
            '/bundle/Content.orderA.css',
            '/bundle/Layout.orderZ.css',
        ]);
    });

    it('does nothing for an empty region', () => {
        expect(prepareCriticalRegion(region('empty', []))).toEqual([]);
        expect(mocks.resolvePreloadResources).not.toHaveBeenCalled();
        expect(mocks.loadAndRegister).not.toHaveBeenCalled();
    });

    it('does not repeatedly suspend when an unknown type remains without a concrete export', async () => {
        const criticalRegion = region('unknown', [component('unknown-instance', 'Content.unknown')]);
        mocks.loadAndRegister.mockResolvedValueOnce(undefined);

        let preparation: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            preparation = thrown as Promise<void>;
        }

        await preparation;
        expect(prepareCriticalRegion(criticalRegion)).toEqual(['unknown-instance']);
        expect(mocks.loadAndRegister).toHaveBeenCalledOnce();
    });

    it('rethrows a failed module preparation on retry', async () => {
        const error = new Error('import failed');
        const criticalRegion = region('broken', [component('broken-instance', 'Content.broken')]);
        mocks.loadAndRegister.mockRejectedValueOnce(error);

        let preparation: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            preparation = thrown as Promise<void>;
        }

        await expect(preparation).rejects.toBe(error);
        expect(() => prepareCriticalRegion(criticalRegion)).toThrow(error);
    });
});
