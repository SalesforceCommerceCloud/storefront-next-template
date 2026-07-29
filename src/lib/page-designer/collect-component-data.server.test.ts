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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience } from '@/scapi';
import { collectFromRegions } from './collect-component-data.server';
import { registry } from '@/lib/page-designer/registry';

vi.mock('@/lib/page-designer/registry', () => ({
    registry: {
        callLoader: vi.fn(),
        hasLoaders: vi.fn(),
    },
}));

const mockedRegistry = vi.mocked(registry);

const TEST_CONTEXT = { get: vi.fn(), set: vi.fn() };

const createCtx = (context = TEST_CONTEXT) =>
    ({
        request: new Request('https://example.com/page'),
        url: new URL('https://example.com/page'),
        context,
        params: {},
        pattern: '/',
    }) as LoaderFunctionArgs;

const createComponent = (id: string, typeId: string, regions: any[] = []) =>
    ({
        id,
        typeId,
        regions,
    }) as unknown as ShopperExperience.schemas['Component'];

const createRegion = (components: any[]) => ({ components }) as unknown as ShopperExperience.schemas['Region'];

describe('collectFromRegions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('does nothing when regions is undefined', () => {
        const map: Record<string, Promise<unknown>> = {};

        collectFromRegions(createCtx(), undefined, map);

        expect(map).toEqual({});
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.hasLoaders).not.toHaveBeenCalled();
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).not.toHaveBeenCalled();
    });

    test('does nothing for empty regions array', () => {
        const map: Record<string, Promise<unknown>> = {};

        collectFromRegions(createCtx(), [], map);

        expect(map).toEqual({});
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.hasLoaders).not.toHaveBeenCalled();
    });

    test('handles regions with null or undefined components', () => {
        const map: Record<string, Promise<unknown>> = {};
        const regions = [
            { components: null } as unknown as ShopperExperience.schemas['Region'],
            { components: undefined } as unknown as ShopperExperience.schemas['Region'],
            createRegion([]),
        ];

        collectFromRegions(createCtx(), regions, map);

        expect(map).toEqual({});
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.hasLoaders).not.toHaveBeenCalled();
    });

    test('adds a promise for each component that has a loader', () => {
        const heroData = { title: 'Hero' };
        const footerData = { title: 'Footer' };

        mockedRegistry.hasLoaders.mockReturnValue(true);
        mockedRegistry.callLoader
            .mockReturnValueOnce(Promise.resolve(heroData))
            .mockReturnValueOnce(Promise.resolve(footerData));

        const map: Record<string, Promise<unknown>> = {};
        const regions = [createRegion([createComponent('hero-1', 'hero'), createComponent('footer-1', 'footer')])];

        collectFromRegions(createCtx(), regions, map);

        expect(Object.keys(map)).toEqual(['hero-1', 'footer-1']);
    });

    test('skips components that do not have a loader', () => {
        mockedRegistry.hasLoaders.mockReturnValueOnce(false).mockReturnValueOnce(false);

        const map: Record<string, Promise<unknown>> = {};
        const regions = [createRegion([createComponent('a', 'noLoader1'), createComponent('b', 'noLoader2')])];

        collectFromRegions(createCtx(), regions, map);

        expect(map).toEqual({});
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).not.toHaveBeenCalled();
    });

    test('passes component data and context to the registry callLoader', async () => {
        const expected = { loaded: true };
        mockedRegistry.hasLoaders.mockReturnValue(true);
        mockedRegistry.callLoader.mockReturnValue(Promise.resolve(expected));

        const ctx = createCtx();
        const component = createComponent('hero-1', 'hero');
        const map: Record<string, Promise<unknown>> = {};

        collectFromRegions(ctx, [createRegion([component])], map);

        await expect(map['hero-1']).resolves.toEqual(expected);
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).toHaveBeenCalledWith(
            'hero',
            { componentData: component, context: ctx.context, request: ctx.request },
            'loader'
        );
    });

    test('recursively collects data from nested regions', () => {
        mockedRegistry.hasLoaders
            .mockReturnValueOnce(true) // outer
            .mockReturnValueOnce(true); // nested
        mockedRegistry.callLoader
            .mockReturnValueOnce(Promise.resolve({ id: 'outer' }))
            .mockReturnValueOnce(Promise.resolve({ id: 'nested' }));

        const nested = createComponent('nested-1', 'nested');
        const outer = createComponent('outer-1', 'outer', [createRegion([nested])]);
        const map: Record<string, Promise<unknown>> = {};

        collectFromRegions(createCtx(), [createRegion([outer])], map);

        expect(Object.keys(map)).toEqual(['outer-1', 'nested-1']);
    });

    test('recurses into nested regions even when the parent has no loader', () => {
        mockedRegistry.hasLoaders
            .mockReturnValueOnce(false) // parent without loader
            .mockReturnValueOnce(true); // nested with loader
        mockedRegistry.callLoader.mockReturnValueOnce(Promise.resolve({ id: 'nested' }));

        const nested = createComponent('nested-1', 'nested');
        const parent = createComponent('parent-1', 'noLoader', [createRegion([nested])]);
        const map: Record<string, Promise<unknown>> = {};

        collectFromRegions(createCtx(), [createRegion([parent])], map);

        expect(Object.keys(map)).toEqual(['nested-1']);
    });

    test('preserves existing entries in the map', () => {
        mockedRegistry.hasLoaders.mockReturnValue(true);
        mockedRegistry.callLoader.mockReturnValue(Promise.resolve({ id: 'new' }));

        const existing = Promise.resolve({ id: 'existing' });
        const map: Record<string, Promise<unknown>> = { existing };

        collectFromRegions(createCtx(), [createRegion([createComponent('new-1', 'new')])], map);

        expect(map.existing).toBe(existing);
        expect(map['new-1']).toBeDefined();
    });

    test('stores rejected promises without throwing', async () => {
        const error = new Error('Loader failed');
        mockedRegistry.hasLoaders.mockReturnValue(true);
        mockedRegistry.callLoader.mockReturnValue(Promise.reject(error));

        const map: Record<string, Promise<unknown>> = {};

        expect(() =>
            collectFromRegions(createCtx(), [createRegion([createComponent('failing', 'hero')])], map)
        ).not.toThrow();

        await expect(map.failing).rejects.toThrow('Loader failed');
    });
});
