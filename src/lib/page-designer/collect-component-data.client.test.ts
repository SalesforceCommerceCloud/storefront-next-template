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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ShopperExperience } from '@/scapi';
import { collectClientComponentData } from './collect-component-data.client';
import { registry } from '@/lib/page-designer/registry';

vi.mock('@/lib/page-designer/registry', () => ({
    registry: {
        getLoaderNames: vi.fn(),
        callLoader: vi.fn(),
    },
}));

const mockedRegistry = vi.mocked(registry);

const createComponent = (id: string, typeId: string, regions: unknown[] = []) =>
    ({
        id,
        typeId,
        regions,
    }) as unknown as ShopperExperience.schemas['Component'];

const createRegion = (components: unknown[], id = 'region') =>
    ({ id, components }) as unknown as ShopperExperience.schemas['Region'];

describe('collectClientComponentData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('does nothing when regions are undefined or contain no components', () => {
        const map: Record<string, Promise<unknown>> = {};

        collectClientComponentData({}, undefined, map);
        collectClientComponentData({}, [createRegion([])], map);

        expect(map).toEqual({});
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.getLoaderNames).not.toHaveBeenCalled();
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).not.toHaveBeenCalled();
    });

    test('ignores components without a client loader', () => {
        mockedRegistry.getLoaderNames.mockReturnValue({ loader: 'loader' });
        const map: Record<string, Promise<unknown>> = {};

        collectClientComponentData({}, [createRegion([createComponent('hero-1', 'hero')])], map);

        expect(map).toEqual({});
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).not.toHaveBeenCalled();
    });

    test('stores client loader promises and passes the component and locale', async () => {
        const component = createComponent('hero-1', 'hero');
        const expected = { title: 'Hero' };
        const promise = Promise.resolve(expected);
        mockedRegistry.getLoaderNames.mockReturnValue({ clientLoader: 'clientLoader' });
        mockedRegistry.callLoader.mockReturnValue(promise);
        const map: Record<string, Promise<unknown>> = {};

        collectClientComponentData({ locale: 'fr-FR' }, [createRegion([component])], map);

        expect(map['hero-1']).toBe(promise);
        await expect(map['hero-1']).resolves.toEqual(expected);
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).toHaveBeenCalledWith(
            'hero',
            { componentData: component, locale: 'fr-FR' },
            'clientLoader'
        );
    });

    test('recursively collects nested components even when their parent has no client loader', () => {
        const nested = createComponent('nested-1', 'nested');
        const parent = createComponent('parent-1', 'parent', [createRegion([nested])]);
        const promise = Promise.resolve({ id: 'nested' });
        mockedRegistry.getLoaderNames
            .mockReturnValueOnce(undefined)
            .mockReturnValueOnce({ clientLoader: 'clientLoader' });
        mockedRegistry.callLoader.mockReturnValue(promise);
        const map: Record<string, Promise<unknown>> = {};

        collectClientComponentData({}, [createRegion([parent])], map);

        expect(map).toEqual({ 'nested-1': promise });
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).toHaveBeenCalledTimes(1);
    });

    test('preserves existing map entries and retains rejected loader promises', async () => {
        const existing = Promise.resolve({ id: 'existing' });
        const error = new Error('Loader failed');
        const rejected = Promise.reject(error);
        mockedRegistry.getLoaderNames.mockReturnValue({ clientLoader: 'clientLoader' });
        mockedRegistry.callLoader.mockReturnValue(rejected);
        const map: Record<string, Promise<unknown>> = { existing };

        expect(() =>
            collectClientComponentData({}, [createRegion([createComponent('failing-1', 'hero')])], map)
        ).not.toThrow();

        expect(map.existing).toBe(existing);
        expect(map['failing-1']).toBe(rejected);
        await expect(map['failing-1']).rejects.toThrow('Loader failed');
    });
});
