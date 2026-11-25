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
import { render, screen } from '@testing-library/react';
import { RegionWrapper } from './region-wrapper';
import type { RegionDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import type { ShopperExperience } from '@/scapi';

vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: vi.fn(() => ({ isDesignMode: false, isPreviewMode: false })),
    createReactRegionDesignDecorator: () => {
        return (props: DecoratedProps) => {
            decoratedCalls.push(props);
            return <div data-testid="decorated-region">{props.children}</div>;
        };
    },
}));

type DecoratedProps = {
    region: ShopperExperience.schemas['Region'];
    className?: string;
    designMetadata?: RegionDesignMetadata & {
        regionDirection: string;
        contentLinkUuids: string[];
    };
    children: React.ReactNode;
};

// props passed into decorator
const decoratedCalls: DecoratedProps[] = [];

import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';

const makeRegion = (
    id: string | undefined,
    compIds: string[],
    contentLinkUuids: (string | undefined)[] = []
): ShopperExperience.schemas['Region'] => ({
    id: id as string,
    components: compIds.map((c, index) => ({
        id: c,
        ...(contentLinkUuids[index] === undefined ? {} : { contentLinkUuid: contentLinkUuids[index] }),
        typeId: 'commerce_assets.productTile',
    })),
});

describe('RegionWrapper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        decoratedCalls.length = 0;
    });

    test('(runtime) renders plain RegionRenderer without className', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: false, isPreviewMode: false });
        const region = makeRegion('r1', ['a', 'b']);

        const { container } = render(
            <RegionWrapper region={region}>
                <div data-testid="kid" />
            </RegionWrapper>
        );

        // RegionRenderer returns children without a wrapper when no className
        const kid = screen.getByTestId('kid');
        expect(kid).toBeInTheDocument();
        expect(decoratedCalls).toHaveLength(0);

        // Verify no extra wrapper is created when no className
        expect(container.firstChild).toBe(kid);
    });

    test('(runtime) renders RegionRenderer with className wrapper', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: false, isPreviewMode: false });
        const region = makeRegion('r1', ['a', 'b']);

        const { container } = render(
            <RegionWrapper region={region} className="flex gap-4">
                <div data-testid="kid" />
            </RegionWrapper>
        );

        // RegionRenderer wraps children in div when className provided
        const kid = screen.getByTestId('kid');
        expect(kid).toBeInTheDocument();
        expect(decoratedCalls).toHaveLength(0);

        // Verify wrapper div has the className
        const wrapper = container.firstChild;
        expect(wrapper).toHaveClass('flex', 'gap-4');
        expect(wrapper).toContainElement(kid);
    });

    test('(design mode) decorated renderer gets metadata', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
        const region = makeRegion('r2', ['x1', 'x2']);

        render(<RegionWrapper region={region}>child</RegionWrapper>);

        const decorated = screen.getByTestId('decorated-region');
        expect(decorated).toBeInTheDocument();

        const last = decoratedCalls[decoratedCalls.length - 1];
        expect(last.region.id).toEqual('r2');
        expect(last.designMetadata?.contentLinkUuids).toEqual(['x1', 'x2']);
        expect(last.designMetadata).not.toHaveProperty('componentIds');
        expect(last.designMetadata?.componentTypeInclusions).toEqual([]);
        expect(last.designMetadata?.componentTypeExclusions).toEqual([]);
    });

    test('prefers explicit content-link UUIDs and falls back to component ids in region metadata', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
        const region = makeRegion('r3', ['backend-id', 'fallback-id'], ['explicit-content-link', undefined]);

        render(<RegionWrapper region={region}>child</RegionWrapper>);

        expect(decoratedCalls.at(-1)?.designMetadata?.contentLinkUuids).toEqual([
            'explicit-content-link',
            'fallback-id',
        ]);
        expect(decoratedCalls.at(-1)?.designMetadata).not.toHaveProperty('componentIds');
    });

    test('uses component ids for empty and omitted content-link UUIDs without changing raw region metadata', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
        const region = makeRegion('r4', ['component-a', 'component-b', 'component-c'], ['link-b', '', undefined]);

        render(<RegionWrapper region={region}>child</RegionWrapper>);

        expect(decoratedCalls.at(-1)?.designMetadata?.contentLinkUuids).toEqual([
            'link-b',
            'component-b',
            'component-c',
        ]);
        expect(region.components?.map((component) => component.contentLinkUuid)).toEqual(['link-b', '', undefined]);
        expect(decoratedCalls.at(-1)?.designMetadata).not.toHaveProperty('componentIds');
    });

    test('passes through custom inclusion/exclusion lists', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
        const region = makeRegion('rM', ['cZ']);

        render(
            <RegionWrapper
                region={region}
                designMetadata={{
                    id: 'rM',
                    componentTypeExclusions: ['e1'],
                    componentTypeInclusions: ['i1'],
                }}>
                x
            </RegionWrapper>
        );

        const last = decoratedCalls.at(-1);
        expect(last?.designMetadata?.componentTypeExclusions).toEqual(['e1']);
        expect(last?.designMetadata?.componentTypeInclusions).toEqual(['i1']);
    });

    test('(design mode but no region id) falls back to plain renderer', () => {
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
        const region = makeRegion(undefined, ['cx']);

        const { container } = render(
            <RegionWrapper region={region}>
                <div data-testid="child-content">y</div>
            </RegionWrapper>
        );

        // When no region id, falls back to RegionRenderer which just returns children
        const child = screen.getByTestId('child-content');
        expect(child).toBeInTheDocument();
        expect(decoratedCalls).toHaveLength(0);

        // Verify no extra wrapper is created
        expect(container.firstChild).toBe(child);
    });
});
