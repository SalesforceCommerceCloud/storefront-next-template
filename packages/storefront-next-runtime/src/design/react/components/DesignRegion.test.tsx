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

import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesignRegion } from './DesignRegion';
import { useNodeToTargetStore } from '../hooks/useNodeToTargetStore';
import { EmbeddedSubtreeProvider } from '../core/EmbeddedSubtreeContext';
import type { RegionDecoratorProps } from '../core/component.types';

// Mock dependencies
vi.mock('../hooks/useRegionDecoratorClasses', () => ({
    useRegionDecoratorClasses: () => 'mock-region-class',
}));

vi.mock('../hooks/useNodeToTargetStore', () => ({
    useNodeToTargetStore: vi.fn(),
}));

vi.mock('./DesignFrame', () => ({
    DesignFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../hooks/useLabels', () => ({
    useLabels: () => ({
        defaultRegionName: 'Default Region',
    }),
}));

vi.mock('../core/RegionContext', () => ({
    RegionContext: {
        Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
}));

const mockUseComponentContext = vi.fn();
vi.mock('../core/ComponentContext', () => ({
    useComponentContext: () => mockUseComponentContext(),
}));

vi.mock('../hooks/useDesignState', () => ({
    useDesignState: () => ({
        dragState: {
            currentDropTarget: null,
            componentType: 'test-type',
        },
    }),
}));

vi.mock('../utils/regionUtils', () => ({
    isComponentTypeAllowedInRegion: vi.fn(() => true),
}));

const mockUseNodeToTargetStore = vi.mocked(useNodeToTargetStore);

const regionProps: RegionDecoratorProps<unknown> = {
    designMetadata: { id: 'column_1', contentLinkUuids: [] },
    children: <div>Test</div>,
};

describe('DesignRegion - parentId resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses contentLinkUuid as parentId when the parent component has one', () => {
        mockUseComponentContext.mockReturnValue({
            componentId: 'backend-id',
            contentLinkUuid: 'content-link-uuid',
        });

        render(<DesignRegion {...regionProps} />);

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(
            expect.objectContaining({ parentId: 'content-link-uuid' })
        );
    });

    it('sets parentId to undefined when there is no parent component context', () => {
        mockUseComponentContext.mockReturnValue(null);

        render(<DesignRegion {...regionProps} />);

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(expect.objectContaining({ parentId: undefined }));
    });
});

describe('DesignRegion - embedded regions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseComponentContext.mockReturnValue(null);
    });

    it('does not register as a drop target inside an embedded subtree', () => {
        render(
            <EmbeddedSubtreeProvider embedded={true}>
                <DesignRegion {...regionProps} />
            </EmbeddedSubtreeProvider>
        );

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(expect.objectContaining({ disabled: true }));
    });

    it('registers as a drop target when not inside an embedded subtree', () => {
        render(<DesignRegion {...regionProps} />);

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));
    });
});

describe('DesignRegion - Default Value Handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseComponentContext.mockReturnValue({ componentId: 'parent-component' });
    });

    it('should use default values when designMetadata fields are undefined or missing', () => {
        // Test undefined designMetadata
        const { container: container1 } = render(
            <DesignRegion designMetadata={undefined}>
                <div>Test</div>
            </DesignRegion>
        );
        expect(container1.querySelector('[data-region-id=""]')).toBeTruthy();

        // Test empty object designMetadata
        const { container: container2 } = render(
            <DesignRegion designMetadata={{} as any}>
                <div>Test</div>
            </DesignRegion>
        );
        const regionDiv = container2.querySelector('[data-region-id]');
        expect(regionDiv?.getAttribute('data-region-id')).toBe('');

        // Test partial designMetadata with missing fields (defaults to empty arrays)
        const { container: container3 } = render(
            <DesignRegion
                designMetadata={
                    {
                        id: 'test-region',
                        // contentLinkUuids, componentTypeInclusions, componentTypeExclusions all default to []
                    } as any
                }>
                <div>Test</div>
            </DesignRegion>
        );
        expect(container3.firstChild).toBeTruthy();
    });

    it('should use provided values when all fields are present', () => {
        const props: RegionDecoratorProps<unknown> = {
            designMetadata: {
                id: 'main-region',
                name: 'Main Content',
                contentLinkUuids: ['comp1', 'comp2'],
                componentTypeInclusions: ['hero'],
                componentTypeExclusions: ['footer'],
            },
            children: <div>Test</div>,
        };

        const { container } = render(<DesignRegion {...props} />);
        const regionDiv = container.querySelector('[data-region-id]');
        expect(regionDiv?.getAttribute('data-region-id')).toBe('main-region');
    });
});
