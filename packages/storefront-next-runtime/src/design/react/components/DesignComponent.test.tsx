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
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesignComponent } from './DesignComponent';
import { useNodeToTargetStore } from '../hooks/useNodeToTargetStore';
import { EmbeddedSubtreeProvider } from '../core/EmbeddedSubtreeContext';
import type { ComponentDecoratorProps } from '../core/component.types';

vi.mock('../hooks/useComponentDecoratorClasses', () => ({
    useComponentDecoratorClasses: () => 'mock-component-class',
}));

vi.mock('../hooks/useNodeToTargetStore', () => ({
    useNodeToTargetStore: vi.fn(),
}));

vi.mock('../hooks/useFocusedComponentHandler', () => ({
    useFocusedComponentHandler: vi.fn(),
}));

vi.mock('../hooks/useComponentDiscovery', () => ({
    useComponentDiscovery: () => () => [],
}));

vi.mock('../hooks/useComponentType', () => ({
    useComponentType: () => ({ id: 'commerce.test', label: 'Commerce Test' }),
}));

vi.mock('../hooks/useComponentInfo', () => ({
    useComponentInfo: () => ({ name: 'Test Component' }),
}));

vi.mock('../hooks/useThrottledCallback', () => ({
    useThrottledCallback: (fn: (...args: unknown[]) => unknown) => fn,
}));

// DesignFrame surfaces showFrame / showToolbox via data attributes so the test
// can assert what the decorator passed down without reaching into its internals.
// showToolbox defaults to true here to mirror DesignFrame's own default — the
// decorator no longer passes the prop for non-embedded components.
vi.mock('./DesignFrame', () => ({
    DesignFrame: ({
        children,
        showFrame,
        showToolbox = true,
    }: {
        children: React.ReactNode;
        showFrame?: boolean;
        showToolbox?: boolean;
    }) => (
        <div
            data-testid="design-frame"
            data-show-frame={String(Boolean(showFrame))}
            data-show-toolbox={String(Boolean(showToolbox))}>
            {children}
        </div>
    ),
}));

vi.mock('../core/RegionContext', () => ({
    useRegionContext: () => ({ regionId: 'test-region' }),
}));

const mockSetSelectedComponent = vi.fn();
vi.mock('../hooks/useDesignState', () => ({
    useDesignState: () => ({
        nodeToTargetMap: new Map(),
        selectedContentLinkUuid: null,
        hoveredContentLinkUuid: null,
        setSelectedComponent: mockSetSelectedComponent,
        setHoveredComponent: vi.fn(),
        startComponentMove: vi.fn(),
        setPendingDragContentLinkUuid: vi.fn(),
        dragState: {
            pendingDragContentLinkUuid: null,
            isDragging: false,
            sourceContentLinkUuid: null,
        },
        registerContentLink: vi.fn(),
    }),
}));

const mockUseNodeToTargetStore = vi.mocked(useNodeToTargetStore);

const componentProps: ComponentDecoratorProps<unknown> = {
    designMetadata: {
        id: 'test-1',
        contentLinkUuid: 'test-1-uuid',
        isFragment: false,
        isVisible: true,
        isLocalized: true,
    },
    children: <div data-testid="inner">Test</div>,
} as unknown as ComponentDecoratorProps<unknown>;

describe('DesignComponent - embedded regions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('registers as an interaction target and shows design chrome when not embedded', () => {
        const { getByTestId } = render(<DesignComponent {...componentProps} />);

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));

        const frame = getByTestId('design-frame');
        expect(frame.getAttribute('data-show-toolbox')).toBe('true');

        getByTestId('design-component-test-1').click();
        expect(mockSetSelectedComponent).toHaveBeenCalledWith('test-1-uuid');
    });

    it('renders children as static content with no design chrome or target inside an embedded subtree', () => {
        const { getByTestId, queryByTestId } = render(
            <EmbeddedSubtreeProvider embedded={true}>
                <DesignComponent {...componentProps} />
            </EmbeddedSubtreeProvider>
        );

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(expect.objectContaining({ disabled: true }));

        // Embedded subtree renders children directly — no DesignFrame chrome and
        // no interactive wrapper div for the host to select / drag.
        expect(queryByTestId('design-frame')).toBeNull();
        expect(queryByTestId('design-component-test-1')).toBeNull();
        expect(getByTestId('inner')).toBeTruthy();
    });

    it('is not suppressed when the embedded subtree provider is told the subtree is not embedded', () => {
        const { getByTestId } = render(
            <EmbeddedSubtreeProvider embedded={false}>
                <DesignComponent {...componentProps} />
            </EmbeddedSubtreeProvider>
        );

        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));

        const frame = getByTestId('design-frame');
        expect(frame.getAttribute('data-show-toolbox')).toBe('true');

        getByTestId('design-component-test-1').click();
        expect(mockSetSelectedComponent).toHaveBeenCalledWith('test-1-uuid');
    });
});
