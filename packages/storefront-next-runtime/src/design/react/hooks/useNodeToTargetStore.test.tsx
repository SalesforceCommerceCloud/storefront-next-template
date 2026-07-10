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
import { useNodeToTargetStore } from './useNodeToTargetStore';
import type { NodeToTargetMapEntry } from '../context/DesignStateContext';

const nodeToTargetMap = new Map<Element, NodeToTargetMapEntry>();

vi.mock('./useDesignState', () => ({
    useDesignState: () => ({ nodeToTargetMap }),
}));

function Harness({ disabled }: { disabled?: boolean }) {
    const ref = React.useRef<HTMLDivElement>(null);
    useNodeToTargetStore({
        type: 'component',
        nodeRef: ref,
        componentId: 'comp-1',
        contentLinkUuid: 'clu-1',
        regionId: 'region-1',
        disabled,
    });
    return <div ref={ref} data-testid="target" />;
}

describe('useNodeToTargetStore', () => {
    beforeEach(() => {
        nodeToTargetMap.clear();
    });

    afterEach(() => {
        cleanup();
    });

    it('registers the node as an interaction target by default', () => {
        const { getByTestId } = render(<Harness />);
        const node = getByTestId('target');

        expect(nodeToTargetMap.has(node)).toBe(true);
        expect(nodeToTargetMap.get(node)).toMatchObject({ componentId: 'comp-1', contentLinkUuid: 'clu-1' });
    });

    it('does not register the node when disabled', () => {
        const { getByTestId } = render(<Harness disabled />);
        const node = getByTestId('target');

        expect(nodeToTargetMap.has(node)).toBe(false);
    });

    it('removes an existing registration when toggled to disabled', () => {
        const { getByTestId, rerender } = render(<Harness />);
        const node = getByTestId('target');
        expect(nodeToTargetMap.has(node)).toBe(true);

        rerender(<Harness disabled />);
        expect(nodeToTargetMap.has(node)).toBe(false);
    });
});
