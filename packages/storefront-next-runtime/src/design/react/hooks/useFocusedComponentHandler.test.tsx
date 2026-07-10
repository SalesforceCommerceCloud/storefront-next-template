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
import { useFocusedComponentHandler } from './useFocusedComponentHandler';

const mockFocusComponent = vi.fn();
let mockFocusedContentLinkUuid: string | null = null;

vi.mock('./useDesignState', () => ({
    useDesignState: () => ({
        focusedContentLinkUuid: mockFocusedContentLinkUuid,
        focusComponent: mockFocusComponent,
    }),
}));

function Harness({ contentLinkUuid, disabled }: { contentLinkUuid: string; disabled?: boolean }) {
    const ref = React.useRef<HTMLDivElement>(null);
    useFocusedComponentHandler(contentLinkUuid, ref, disabled);
    return <div ref={ref} data-testid="target" />;
}

describe('useFocusedComponentHandler', () => {
    beforeEach(() => {
        mockFocusedContentLinkUuid = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it('focuses the node when the focused uuid matches and it is not disabled', () => {
        mockFocusedContentLinkUuid = 'clu-1';
        render(<Harness contentLinkUuid="clu-1" />);
        expect(mockFocusComponent).toHaveBeenCalledTimes(1);
    });

    it('does not focus when the focused uuid does not match', () => {
        mockFocusedContentLinkUuid = 'other-uuid';
        render(<Harness contentLinkUuid="clu-1" />);
        expect(mockFocusComponent).not.toHaveBeenCalled();
    });

    it('does not focus a matching uuid when disabled (embedded instance)', () => {
        mockFocusedContentLinkUuid = 'clu-1';
        render(<Harness contentLinkUuid="clu-1" disabled />);
        expect(mockFocusComponent).not.toHaveBeenCalled();
    });
});
