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
import { emitPageDesignerResourceHints, prepareCriticalRegion } from './critical-region';

const mocks = vi.hoisted(() => ({
    loaded: new Set<string>(),
    errors: new Map<string, Error>(),
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
    default: { resources: [], components: {} },
}));
vi.mock('@salesforce/storefront-next-runtime/design/preload', () => ({
    resolvePreloadResources: mocks.resolvePreloadResources,
}));
vi.mock('@salesforce/storefront-next-runtime/assets', () => ({
    getClientBundlePath: () => '/bundle/',
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: mocks.warn }) }));
vi.mock('@/lib/page-designer/registry', () => ({
    registry: {
        hasConcreteComponent: (typeId: string) => mocks.loaded.has(typeId),
        consumeRegistrationError: (typeId: string) => {
            const error = mocks.errors.get(typeId);
            mocks.errors.delete(typeId);
            return error;
        },
    },
}));
vi.mock('./registry-components', () => ({
    registerComponentTypes: mocks.loadAndRegister,
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
        mocks.errors.clear();
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

    it('suspends until direct component modules are concretely registered', async () => {
        const criticalRegion = region('hero', [
            component('outer', 'Layout.hero', [region('nested', [component('inner', 'Content.nestedOnly')])]),
            component('direct', 'Content.hero'),
        ]);
        let preparation: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            preparation = thrown as Promise<void>;
        }

        expect(preparation).toBeInstanceOf(Promise);
        expect(mocks.loadAndRegister).toHaveBeenCalledWith(['Layout.hero', 'Content.hero']);
        await preparation;
        expect(prepareCriticalRegion(criticalRegion)).toBeUndefined();
        expect(mocks.resolvePreloadResources).not.toHaveBeenCalled();
    });

    it('emits every regional resource in component-type discovery order', () => {
        mocks.resolvePreloadResources.mockImplementation((_manifest, typeIds: Iterable<string>) =>
            [...typeIds].map((typeId) => ({ kind: 'style' as const, href: `/bundle/${typeId}.css` }))
        );

        emitPageDesignerResourceHints(['Layout.orderZ', 'Content.orderA']);

        expect(mocks.resolvePreloadResources).toHaveBeenCalledOnce();
        expect(mocks.resolvePreloadResources.mock.calls[0]?.[1]).toEqual(['Layout.orderZ', 'Content.orderA']);
        expect(mocks.preinit.mock.calls.map(([href]) => href)).toEqual([
            '/bundle/Layout.orderZ.css',
            '/bundle/Content.orderA.css',
        ]);
    });

    it('does nothing for an empty region', () => {
        expect(prepareCriticalRegion(region('empty', []))).toBeUndefined();
        expect(mocks.resolvePreloadResources).not.toHaveBeenCalled();
        expect(mocks.loadAndRegister).not.toHaveBeenCalled();
    });

    it('retries when a registration resolved without a concrete export', async () => {
        const criticalRegion = region('unknown', [component('unknown-instance', 'Content.unknown')]);
        mocks.loadAndRegister.mockResolvedValueOnce(undefined);

        let preparation: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            preparation = thrown as Promise<void>;
        }

        await preparation;
        let retry: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            retry = thrown as Promise<void>;
        }
        await retry;
        expect(prepareCriticalRegion(criticalRegion)).toBeUndefined();
        expect(mocks.loadAndRegister).toHaveBeenCalledTimes(2);
    });

    it('lets a later request retry a failed module preparation', async () => {
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
        let retry: Promise<void> | undefined;
        try {
            prepareCriticalRegion(criticalRegion);
        } catch (thrown) {
            retry = thrown as Promise<void>;
        }
        await retry;
        expect(prepareCriticalRegion(criticalRegion)).toBeUndefined();
    });
});
