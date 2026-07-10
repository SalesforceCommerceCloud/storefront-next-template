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
import { registry } from '@/lib/page-designer/registry';
import type { ComponentWithComponentData } from './component-loader.server';
import { PREVIEW_REGION_ID, resolvePreviewPageId, injectIntoPreviewRegion } from './preview-page.server';

vi.mock('@/lib/page-designer/registry', () => ({
    registry: {
        callLoader: vi.fn(),
        hasLoaders: vi.fn(),
    },
}));

const mockedRegistry = vi.mocked(registry);

const TEST_CONTEXT = { get: vi.fn(), set: vi.fn() };

const createArgs = (context = TEST_CONTEXT) =>
    ({
        request: new Request('https://example.com/RefArch/en-US/preview/component?mode=PREVIEW&componentId=c-1'),
        context,
        params: {},
        pattern: '/',
    }) as unknown as LoaderFunctionArgs;

const createComponent = (
    id: string,
    typeId: string,
    extra: Partial<ComponentWithComponentData> = {}
): ComponentWithComponentData =>
    ({
        id,
        typeId,
        ...extra,
    }) as unknown as ComponentWithComponentData;

describe('resolvePreviewPageId', () => {
    test('returns a non-empty string', () => {
        expect(resolvePreviewPageId()).toBeTruthy();
        expect(typeof resolvePreviewPageId()).toBe('string');
    });

    test('returns a stable constant across calls', () => {
        expect(resolvePreviewPageId()).toBe(resolvePreviewPageId());
    });
});

describe('injectIntoPreviewRegion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedRegistry.hasLoaders.mockReturnValue(false);
    });

    test('produces a page with a single region whose id is the preview region id', () => {
        const component = createComponent('c-1', 'hero');

        const page = injectIntoPreviewRegion(component, createArgs());

        expect(page.id).toBe(resolvePreviewPageId());
        expect(page.regions).toHaveLength(1);
        expect(page.regions?.[0]?.id).toBe(PREVIEW_REGION_ID);
        expect(PREVIEW_REGION_ID).toBe('preview');
    });

    test('places the previewed component in the preview region', () => {
        const component = createComponent('c-1', 'hero');

        const page = injectIntoPreviewRegion(component, createArgs());

        expect(page.regions?.[0]?.components).toHaveLength(1);
        expect(page.regions?.[0]?.components?.[0]?.id).toBe('c-1');
    });

    test('strips the componentData field off the injected component (it belongs at page level)', () => {
        const component = createComponent('c-1', 'hero', {
            componentData: { 'child-1': Promise.resolve({ a: 1 }) },
        });

        const page = injectIntoPreviewRegion(component, createArgs());

        const injected = page.regions?.[0]?.components?.[0] as ComponentWithComponentData;
        expect(injected.componentData).toBeUndefined();
    });

    test('carries the descendant componentData entries on the page', () => {
        const childPromise = Promise.resolve({ a: 1 });
        const component = createComponent('c-1', 'hero', {
            componentData: { 'child-1': childPromise },
        });

        const page = injectIntoPreviewRegion(component, createArgs());

        // identity preserved — not re-wrapped
        expect(page.componentData?.['child-1']).toBe(childPromise);
    });

    test('registers the previewed ROOT component own loader data when it has a loader', async () => {
        const rootData = { headline: 'Root' };
        mockedRegistry.hasLoaders.mockReturnValue(true);
        mockedRegistry.callLoader.mockReturnValue(Promise.resolve(rootData));

        const childPromise = Promise.resolve({ a: 1 });
        const component = createComponent('c-1', 'hero', {
            componentData: { 'child-1': childPromise },
        });
        const args = createArgs();

        const page = injectIntoPreviewRegion(component, args);

        // root data registered under the root component id
        await expect(page.componentData?.['c-1']).resolves.toEqual(rootData);
        // descendant entry still present and untouched
        expect(page.componentData?.['child-1']).toBe(childPromise);
        // callLoader invoked with the stripped component (no componentData field)
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).toHaveBeenCalledWith(
            'hero',
            { componentData: { id: 'c-1', typeId: 'hero' }, context: args.context, request: args.request },
            'loader'
        );
    });

    test('does not register a root entry when the root component has no loader', () => {
        mockedRegistry.hasLoaders.mockReturnValue(false);
        const component = createComponent('c-1', 'hero', {
            componentData: { 'child-1': Promise.resolve({ a: 1 }) },
        });

        const page = injectIntoPreviewRegion(component, createArgs());

        expect(page.componentData?.['c-1']).toBeUndefined();
        expect(Object.keys(page.componentData ?? {})).toEqual(['child-1']);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedRegistry.callLoader).not.toHaveBeenCalled();
    });

    test('returns an empty componentData map when component has no descendants and no loader', () => {
        const component = createComponent('c-1', 'hero');

        const page = injectIntoPreviewRegion(component, createArgs());

        expect(page.componentData).toEqual({});
    });

    test('does not await the loader promises (passes references through)', () => {
        mockedRegistry.hasLoaders.mockReturnValue(true);
        const rootPromise = new Promise(() => {
            /* never resolves */
        });
        mockedRegistry.callLoader.mockReturnValue(rootPromise);
        const component = createComponent('c-1', 'hero');

        const page = injectIntoPreviewRegion(component, createArgs());

        expect(page.componentData?.['c-1']).toBe(rootPromise);
    });
});
