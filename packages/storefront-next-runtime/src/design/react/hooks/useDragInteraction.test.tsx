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
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDragInteraction } from './useDragInteraction';
import { useDesignContext } from '../context/DesignContext';
import type { ClientApi, ClientEventNameMapping } from '../../messaging-api';
import type { NodeToTargetMapEntry } from '../context/DesignStateContext';

vi.mock('../context/DesignContext');

const componentType = 'commerce.test';

function createClientApi() {
    let componentDragStartedHandler: ((event: ClientEventNameMapping['ComponentDragStarted']) => void) | undefined;
    const moveComponentToRegion = vi.fn();
    const addComponentToRegion = vi.fn();
    const api = {
        on: vi.fn((eventName: string, handler: (event: ClientEventNameMapping['ComponentDragStarted']) => void) => {
            if (eventName === 'ComponentDragStarted') {
                componentDragStartedHandler = handler;
            }
            return vi.fn();
        }),
        moveComponentToRegion,
        addComponentToRegion,
    } as unknown as ClientApi;

    return {
        api,
        moveComponentToRegion,
        addComponentToRegion,
        triggerComponentDragStarted: (event: ClientEventNameMapping['ComponentDragStarted']) => {
            componentDragStartedHandler?.(event);
        },
    };
}

function createComponentEntry(
    componentUuid: string,
    contentLinkUuid: string,
    componentId = 'duplicate-component-id'
): NodeToTargetMapEntry {
    return {
        type: 'component',
        componentId,
        componentUuid,
        contentLinkUuid,
        regionId: 'target-region',
        contentLinkUuids: [],
        componentUuids: [],
    };
}

function createRegionEntry(componentUuids: string[], parentId = 'target-parent'): NodeToTargetMapEntry {
    return {
        type: 'region',
        componentId: '',
        componentUuid: parentId,
        parentId,
        regionId: 'target-region',
        contentLinkUuids: [],
        componentUuids,
    };
}

function mockElementsFromPoint(nodes: Element[]) {
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => nodes),
    });
}

describe('useDragInteraction instance identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('moves a duplicate instance across parents using UUID anchors while retaining its raw content link', () => {
        const { api, moveComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({
            isDesignMode: false,
            clientApi: api,
        } as ReturnType<typeof useDesignContext>);

        const sourceUuid = 'source-parent|duplicate-component-id';
        const targetUuid = 'target-parent|duplicate-component-id';
        const targetNode = document.createElement('div');
        const regionNode = document.createElement('div');
        vi.spyOn(targetNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
        mockElementsFromPoint([targetNode, regionNode]);

        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(targetNode, createComponentEntry(targetUuid, 'shared-raw-content-link'));
        nodeToTargetMap.set(regionNode, createRegionEntry([targetUuid, 'target-parent|next-component']));

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            result.current.startComponentMove(
                'duplicate-component-id',
                'source-region',
                componentType,
                sourceUuid,
                'shared-raw-content-link'
            );
        });
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(moveComponentToRegion).toHaveBeenCalledWith({
            componentId: 'duplicate-component-id',
            contentLinkUuid: 'shared-raw-content-link',
            componentUuid: sourceUuid,
            sourceRegionId: 'source-region',
            insertType: 'before',
            insertComponentId: targetUuid,
            beforeComponentId: undefined,
            afterComponentId: 'target-parent|next-component',
            targetRegionId: 'target-region',
            targetComponentId: 'target-parent',
        });
    });

    it('moves across parents using the source ID when the target has a different canonical ID', () => {
        const { api, moveComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({
            isDesignMode: false,
            clientApi: api,
        } as ReturnType<typeof useDesignContext>);

        const sourceUuid = 'source-parent|source-component-id';
        const targetUuid = 'target-parent|target-component-id';
        const targetNode = document.createElement('div');
        const regionNode = document.createElement('div');
        vi.spyOn(targetNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
        mockElementsFromPoint([targetNode, regionNode]);

        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(
            targetNode,
            createComponentEntry(targetUuid, 'shared-raw-content-link', 'target-component-id')
        );
        nodeToTargetMap.set(regionNode, createRegionEntry([targetUuid, 'target-parent|next-component']));

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            result.current.startComponentMove(
                'source-component-id',
                'source-region',
                componentType,
                sourceUuid,
                'shared-raw-content-link'
            );
        });
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(moveComponentToRegion).toHaveBeenCalledWith({
            componentId: 'source-component-id',
            contentLinkUuid: 'shared-raw-content-link',
            componentUuid: sourceUuid,
            sourceRegionId: 'source-region',
            insertType: 'before',
            insertComponentId: targetUuid,
            beforeComponentId: undefined,
            afterComponentId: 'target-parent|next-component',
            targetRegionId: 'target-region',
            targetComponentId: 'target-parent',
        });
    });

    it('uses the target component ID for empty-link ordering and keeps the neighboring UUID anchors', () => {
        const { api, moveComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({
            isDesignMode: false,
            clientApi: api,
        } as ReturnType<typeof useDesignContext>);

        const targetUuid = 'target-parent|target-component-id';
        const targetNode = document.createElement('div');
        const regionNode = document.createElement('div');
        vi.spyOn(targetNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
        mockElementsFromPoint([targetNode, regionNode]);

        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(targetNode, createComponentEntry(targetUuid, '', 'target-component-id'));
        nodeToTargetMap.set(
            regionNode,
            createRegionEntry(['target-parent|previous-component', targetUuid, 'target-parent|next-component'])
        );

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            result.current.startComponentMove(
                'source-component-id',
                'source-region',
                componentType,
                'source-parent|source-component-id',
                'source-content-link'
            );
        });
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(moveComponentToRegion).toHaveBeenCalledWith(
            expect.objectContaining({
                contentLinkUuid: 'source-content-link',
                insertType: 'before',
                insertComponentId: targetUuid,
                beforeComponentId: 'target-parent|previous-component',
                afterComponentId: 'target-parent|next-component',
            })
        );
    });

    it('moves into an empty region with the source ID and clears source identity before a palette add', () => {
        const { api, triggerComponentDragStarted, moveComponentToRegion, addComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({ isDesignMode: true, clientApi: api } as ReturnType<
            typeof useDesignContext
        >);

        const regionNode = document.createElement('div');
        mockElementsFromPoint([regionNode]);
        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(regionNode, createRegionEntry([], 'target-parent|owner'));

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            result.current.startComponentMove(
                'source-component-id',
                'source-region',
                componentType,
                'source-parent|source-component-id',
                'source-raw-content-link'
            );
        });
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(moveComponentToRegion).toHaveBeenCalledWith({
            componentId: 'source-component-id',
            contentLinkUuid: 'source-raw-content-link',
            componentUuid: 'source-parent|source-component-id',
            sourceRegionId: 'source-region',
            insertType: 'after',
            insertComponentId: '',
            beforeComponentId: undefined,
            afterComponentId: undefined,
            targetRegionId: 'target-region',
            targetComponentId: 'target-parent|owner',
        });
        expect(result.current.dragState.sourceComponentId).toBeUndefined();
        expect(result.current.dragState.sourceComponentUuid).toBeUndefined();
        expect(result.current.dragState.sourceContentLinkUuid).toBeUndefined();
        expect(result.current.dragState.sourceRegionId).toBeUndefined();

        act(() => {
            triggerComponentDragStarted({ eventType: 'ComponentDragStarted', componentType });
        });
        expect(result.current.dragState.sourceComponentId).toBeUndefined();
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(addComponentToRegion).toHaveBeenCalledWith({
            insertType: 'after',
            insertComponentId: '',
            beforeComponentId: undefined,
            afterComponentId: undefined,
            componentProperties: {},
            componentType,
            fragmentId: undefined,
            targetComponentId: 'target-parent|owner',
            targetRegionId: 'target-region',
        });
        expect(moveComponentToRegion).toHaveBeenCalledTimes(1);
    });

    it('does not commit an adjacent same-parent move when the UUID neighbor is the source', () => {
        const { api, moveComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({ isDesignMode: false, clientApi: api } as ReturnType<
            typeof useDesignContext
        >);

        const sourceUuid = 'parent|source';
        const targetUuid = 'parent|target';
        const targetNode = document.createElement('div');
        const regionNode = document.createElement('div');
        vi.spyOn(targetNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
        mockElementsFromPoint([targetNode, regionNode]);

        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(targetNode, createComponentEntry(targetUuid, '', 'target'));
        nodeToTargetMap.set(regionNode, createRegionEntry([sourceUuid, targetUuid], 'parent'));

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            result.current.startComponentMove('source', 'source-region', componentType, sourceUuid, 'source-link');
        });
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(moveComponentToRegion).not.toHaveBeenCalled();
    });

    it('commits an adjacent after move when the target has an empty content link', () => {
        const { api, moveComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({ isDesignMode: false, clientApi: api } as ReturnType<
            typeof useDesignContext
        >);

        const sourceUuid = 'parent|source';
        const targetUuid = 'parent|target';
        const targetNode = document.createElement('div');
        const regionNode = document.createElement('div');
        vi.spyOn(targetNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
        mockElementsFromPoint([targetNode, regionNode]);

        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(targetNode, createComponentEntry(targetUuid, '', 'target'));
        nodeToTargetMap.set(regionNode, createRegionEntry([sourceUuid, targetUuid], 'parent'));

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            result.current.startComponentMove('source', 'source-region', componentType, sourceUuid, 'source-link');
        });
        act(() => {
            result.current.updateComponentMove({ x: 75, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(moveComponentToRegion).toHaveBeenCalledWith(
            expect.objectContaining({
                componentId: 'source',
                componentUuid: sourceUuid,
                insertType: 'after',
                insertComponentId: targetUuid,
                beforeComponentId: sourceUuid,
                afterComponentId: undefined,
            })
        );
    });

    it('adds into an empty region using the owner UUID with no neighbor anchors', () => {
        const { api, triggerComponentDragStarted, addComponentToRegion } = createClientApi();
        vi.mocked(useDesignContext).mockReturnValue({ isDesignMode: true, clientApi: api } as ReturnType<
            typeof useDesignContext
        >);

        const regionNode = document.createElement('div');
        mockElementsFromPoint([regionNode]);
        const nodeToTargetMap = new WeakMap<Element, NodeToTargetMapEntry>();
        nodeToTargetMap.set(regionNode, createRegionEntry([], 'parent|owner'));

        const { result } = renderHook(() => useDragInteraction({ nodeToTargetMap }));
        act(() => {
            triggerComponentDragStarted({ eventType: 'ComponentDragStarted', componentType });
        });
        act(() => {
            result.current.updateComponentMove({ x: 25, y: 50 });
        });
        act(() => {
            result.current.commitCurrentDropTarget();
        });

        expect(addComponentToRegion).toHaveBeenCalledWith({
            insertType: 'after',
            insertComponentId: '',
            beforeComponentId: undefined,
            afterComponentId: undefined,
            componentProperties: {},
            componentType,
            fragmentId: undefined,
            targetComponentId: 'parent|owner',
            targetRegionId: 'target-region',
        });
    });
});
