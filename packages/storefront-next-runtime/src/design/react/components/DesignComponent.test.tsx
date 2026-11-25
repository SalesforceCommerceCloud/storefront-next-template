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
import { useComponentVisibility } from '../hooks/useComponentVisibility';
import { EmbeddedSubtreeProvider } from '../core/EmbeddedSubtreeContext';
import { RootComponentProvider } from '../core/RootComponentContext';
import { ComponentContext } from '../core/ComponentContext';
import type { DesignComponentProps } from '../core/component.types';
import type { DesignState } from '../context/DesignStateContext';

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

vi.mock('../hooks/useComponentVisibility', () => ({
    useComponentVisibility: vi.fn(() => 'visible'),
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
        isMoveable = true,
        isDeletable = true,
        isFragment = false,
    }: {
        children: React.ReactNode;
        showFrame?: boolean;
        showToolbox?: boolean;
        isMoveable?: boolean;
        isDeletable?: boolean;
        isFragment?: boolean;
    }) => (
        <div
            data-testid="design-frame"
            data-show-frame={String(Boolean(showFrame))}
            data-show-toolbox={String(Boolean(showToolbox))}
            data-is-moveable={String(Boolean(isMoveable))}
            data-is-deletable={String(Boolean(isDeletable))}
            data-is-fragment={String(Boolean(isFragment))}>
            {children}
        </div>
    ),
}));

vi.mock('../core/RegionContext', () => ({
    useRegionContext: () => ({ regionId: 'test-region' }),
}));

const mockSetSelectedComponent = vi.fn();
const mockRegisterComponentUuid = vi.fn();
// DesignComponent reads state via useDesignSelector; run the real selector
// against a fake state so the test drives selection + drag state directly.
vi.mock('../hooks/useDesignSelector', () => ({
    useDesignSelector: (selector: (state: DesignState) => unknown) =>
        selector({
            nodeToTargetMap: new Map(),
            selectedComponentUuid: null,
            hoveredComponentUuid: null,
            setSelectedComponent: mockSetSelectedComponent,
            setHoveredComponent: vi.fn(),
            startComponentMove: vi.fn(),
            setPendingDragComponentUuid: vi.fn(),
            dragState: {
                pendingDragComponentUuid: null,
                isDragging: false,
                sourceComponentUuid: null,
            },
            registerComponentUuid: mockRegisterComponentUuid,
        } as unknown as DesignState),
}));

const mockUseNodeToTargetStore = vi.mocked(useNodeToTargetStore);

// `children` is a render prop: DesignComponent resolves the wrapped component's
// props (live overrides) and calls `children(resolvedProps)`, so the test must
// pass a function, not a ReactNode element.
const componentProps: DesignComponentProps<Record<string, unknown>> = {
    designMetadata: {
        id: 'test-1',
        contentLinkUuid: 'test-1-uuid',
        isFragment: false,
        isVisible: true,
        isLocalized: true,
    },
    children: () => <div data-testid="inner">Test</div>,
} as unknown as DesignComponentProps<Record<string, unknown>>;

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

describe('DesignComponent - root component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('suppresses move and delete for the root component but keeps it selectable', () => {
        const { getByTestId } = render(
            <RootComponentProvider>
                <DesignComponent {...componentProps} />
            </RootComponentProvider>
        );

        const frame = getByTestId('design-frame');
        expect(frame.getAttribute('data-is-moveable')).toBe('false');
        expect(frame.getAttribute('data-is-deletable')).toBe('false');

        // Still selectable — the interactive wrapper is present and clicking selects.
        getByTestId('design-component-test-1').click();
        expect(mockSetSelectedComponent).toHaveBeenCalledWith('test-1-uuid');
    });

    it('does not suppress a nested child of the root (non-propagation)', () => {
        const { getAllByTestId } = render(
            <RootComponentProvider>
                <DesignComponent
                    {...componentProps}
                    // Render-prop children: the root renders a nested DesignComponent
                    // whose own children render prop returns static content.
                    // eslint-disable-next-line react/no-children-prop
                    children={() => (
                        <DesignComponent
                            {...({
                                designMetadata: {
                                    id: 'child-1',
                                    contentLinkUuid: 'child-1-uuid',
                                    isFragment: false,
                                    isVisible: true,
                                    isLocalized: true,
                                },
                                children: () => <div data-testid="child-inner">Child</div>,
                            } as unknown as DesignComponentProps<Record<string, unknown>>)}
                        />
                    )}
                />
            </RootComponentProvider>
        );

        // Frames render in DOM order: root's frame first, the nested child's frame last.
        const frames = getAllByTestId('design-frame');
        const childFrame = frames[frames.length - 1];
        expect(childFrame.getAttribute('data-is-deletable')).toBe('true');
        expect(childFrame.getAttribute('data-is-moveable')).toBe('true');
    });

    it('leaves non-root components unchanged when no provider is present', () => {
        const { getByTestId } = render(<DesignComponent {...componentProps} />);

        const frame = getByTestId('design-frame');
        expect(frame.getAttribute('data-is-deletable')).toBe('true');
        expect(frame.getAttribute('data-is-moveable')).toBe('true');
    });
});

describe('DesignComponent - instance UUID identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('selects duplicate metadata by parent path and content-link UUID', () => {
        const duplicateProps: DesignComponentProps<Record<string, unknown>> = {
            designMetadata: {
                id: 'duplicate',
                contentLinkUuid: 'shared-content-link',
                isFragment: false,
                isVisible: true,
                isLocalized: true,
            },
            children: () => <div>Duplicate</div>,
        };

        const { getAllByTestId } = render(
            <>
                <ComponentContext.Provider value={{ componentId: 'parent-a', uuid: 'parent-a' }}>
                    <DesignComponent {...duplicateProps} />
                </ComponentContext.Provider>
                <ComponentContext.Provider value={{ componentId: 'parent-b', uuid: 'parent-b' }}>
                    <DesignComponent {...duplicateProps} />
                </ComponentContext.Provider>
            </>
        );

        const instances = getAllByTestId('design-component-duplicate');
        instances[0].click();
        instances[1].click();

        expect(mockSetSelectedComponent).toHaveBeenNthCalledWith(1, 'parent-a|shared-content-link');
        expect(mockSetSelectedComponent).toHaveBeenNthCalledWith(2, 'parent-b|shared-content-link');
    });

    it('distinguishes components with the same backend id by their content-link UUID', () => {
        const duplicateIdProps = (contentLinkUuid: string): DesignComponentProps<Record<string, unknown>> => ({
            designMetadata: {
                id: 'duplicate',
                contentLinkUuid,
                isFragment: false,
                isVisible: true,
                isLocalized: true,
            },
            children: () => <div>Duplicate</div>,
        });

        const { getAllByTestId } = render(
            <ComponentContext.Provider value={{ componentId: 'parent', uuid: 'parent-path' }}>
                <>
                    <DesignComponent {...duplicateIdProps('content-link-a')} />
                    <DesignComponent {...duplicateIdProps('content-link-b')} />
                </>
            </ComponentContext.Provider>
        );

        const instances = getAllByTestId('design-component-duplicate');
        instances[0].click();
        instances[1].click();

        expect(mockSetSelectedComponent).toHaveBeenNthCalledWith(1, 'parent-path|content-link-a');
        expect(mockSetSelectedComponent).toHaveBeenNthCalledWith(2, 'parent-path|content-link-b');
        expect(mockRegisterComponentUuid).toHaveBeenCalledWith(
            'parent-path|content-link-a',
            'duplicate',
            'content-link-a'
        );
        expect(mockRegisterComponentUuid).toHaveBeenCalledWith(
            'parent-path|content-link-b',
            'duplicate',
            'content-link-b'
        );
    });

    it('selects a root component with no raw content-link UUID', () => {
        const rootWithoutContentLink: DesignComponentProps<Record<string, unknown>> = {
            designMetadata: {
                id: 'root-without-content-link',
                isFragment: false,
                isVisible: true,
                isLocalized: true,
            },
            children: () => <div>Root</div>,
        };

        const { getByTestId } = render(<DesignComponent {...rootWithoutContentLink} />);
        getByTestId('design-component-root-without-content-link').click();

        expect(mockSetSelectedComponent).toHaveBeenCalledWith('root-without-content-link');
    });

    it('uses the backend component id when a nested component has no content-link UUID', () => {
        const nestedComponentWithoutContentLink: DesignComponentProps<Record<string, unknown>> = {
            designMetadata: {
                id: 'child-without-content-link',
                isFragment: false,
                isVisible: true,
                isLocalized: true,
            },
            children: () => <div>Child</div>,
        };

        const { getByTestId } = render(
            <ComponentContext.Provider value={{ componentId: 'parent', uuid: 'parent-path' }}>
                <DesignComponent {...nestedComponentWithoutContentLink} />
            </ComponentContext.Provider>
        );
        getByTestId('design-component-child-without-content-link').click();

        expect(mockSetSelectedComponent).toHaveBeenCalledWith('parent-path|child-without-content-link');
    });

    it.each([
        { name: 'root', parentUuid: undefined, expectedUuid: 'empty-content-link' },
        { name: 'nested', parentUuid: 'parent-path', expectedUuid: 'parent-path|empty-content-link' },
    ])('uses the derived $name identity but preserves an empty raw content-link UUID', ({
        parentUuid,
        expectedUuid,
    }) => {
        const props: DesignComponentProps<Record<string, unknown>> = {
            designMetadata: {
                id: 'empty-content-link',
                contentLinkUuid: '',
                isFragment: false,
                isVisible: true,
                isLocalized: true,
            },
            children: () => <div>Component</div>,
        };
        const component = <DesignComponent {...props} />;
        const tree = parentUuid ? (
            <ComponentContext.Provider value={{ componentId: 'parent', uuid: parentUuid }}>
                {component}
            </ComponentContext.Provider>
        ) : (
            component
        );

        const { getByTestId } = render(tree);
        getByTestId('design-component-empty-content-link').click();

        expect(mockSetSelectedComponent).toHaveBeenCalledWith(expectedUuid);
        expect(mockRegisterComponentUuid).toHaveBeenCalledWith(expectedUuid, 'empty-content-link', '');
        expect(mockUseNodeToTargetStore).toHaveBeenCalledWith(
            expect.objectContaining({
                componentId: 'empty-content-link',
                componentUuid: expectedUuid,
                contentLinkUuid: '',
            })
        );
    });
});

describe('DesignComponent - fragment flag', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('forwards isFragment=false by default', () => {
        const { getByTestId } = render(<DesignComponent {...componentProps} />);
        expect(getByTestId('design-frame').getAttribute('data-is-fragment')).toBe('false');
    });

    it('forwards isFragment=true to DesignFrame so the fragment icon renders', () => {
        const fragmentProps = {
            designMetadata: {
                id: 'test-1',
                contentLinkUuid: 'test-1-uuid',
                isFragment: true,
                isVisible: true,
                isLocalized: true,
            },
            children: () => <div data-testid="inner">Test</div>,
        } as unknown as DesignComponentProps<Record<string, unknown>>;

        const { getByTestId } = render(<DesignComponent {...fragmentProps} />);
        expect(getByTestId('design-frame').getAttribute('data-is-fragment')).toBe('true');
    });
});

describe('DesignComponent - visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useComponentVisibility).mockReturnValue('visible');
    });

    afterEach(() => {
        cleanup();
    });

    it('resolves visibility from the component metadata before rendering', () => {
        render(<DesignComponent {...componentProps} />);

        expect(useComponentVisibility).toHaveBeenCalledWith('test-1', true);
    });

    it('does not render content or design chrome when the effective visibility is hidden', () => {
        vi.mocked(useComponentVisibility).mockReturnValue('hidden');

        const { queryByTestId } = render(<DesignComponent {...componentProps} />);

        expect(queryByTestId('inner')).toBeNull();
        expect(queryByTestId('design-frame')).toBeNull();
        expect(queryByTestId('design-component-test-1')).toBeNull();
    });
});
