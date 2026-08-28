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
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComponentInfo } from './useComponentInfo';
import { useDesignContext } from '../context/DesignContext';
import { useDesignSelector } from './useDesignSelector';
import type { DesignState } from '../context/DesignStateContext';

vi.mock('../context/DesignContext');
vi.mock('./useDesignSelector');

/**
 * Drive the real selector against a fake design state. `useComponentInfo`
 * subscribes to `s.componentUpdates?.[componentId]`, so running the actual
 * selector here keeps the test coupled to the hook's real read path.
 */
function mockDesignState(state: Partial<DesignState>) {
    vi.mocked(useDesignSelector).mockImplementation((selector) => selector(state as DesignState));
}

describe('useComponentInfo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when component does not exist in base config', () => {
        vi.mocked(useDesignContext).mockReturnValue({
            pageDesignerConfig: {
                components: {},
                componentTypes: {},
                labels: {},
                regions: {},
            },
        } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);

        mockDesignState({ componentUpdates: {} });

        const { result } = renderHook(() => useComponentInfo('non-existent-id'));

        expect(result.current).toBeNull();
    });

    it('should return base component info when no updates exist', () => {
        vi.mocked(useDesignContext).mockReturnValue({
            pageDesignerConfig: {
                components: {
                    'test-id': {
                        id: 'test-id',
                        type: 'test-type',
                        properties: {},
                    },
                },
                componentTypes: {},
                labels: {},
                regions: {},
            },
        } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);

        mockDesignState({ componentUpdates: {} });

        const { result } = renderHook(() => useComponentInfo('test-id'));

        expect(result.current).toEqual({
            id: 'test-id',
            type: 'test-type',
            properties: {},
        });
    });

    it('should merge component updates with base info', () => {
        vi.mocked(useDesignContext).mockReturnValue({
            pageDesignerConfig: {
                components: {
                    'test-id': {
                        id: 'test-id',
                        type: 'test-type',
                        name: 'Original Name',
                        properties: {},
                    },
                },
                componentTypes: {},
                labels: {},
                regions: {},
            },
        } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);

        mockDesignState({
            componentUpdates: {
                'test-id': {
                    name: 'Updated Name',
                },
            },
        });

        const { result } = renderHook(() => useComponentInfo('test-id'));

        expect(result.current).toEqual({
            id: 'test-id',
            type: 'test-type',
            name: 'Updated Name',
            properties: {},
        });
    });

    it('should return original component data when no edits have been made', () => {
        vi.mocked(useDesignContext).mockReturnValue({
            pageDesignerConfig: {
                components: {
                    'test-id': {
                        id: 'test-id',
                        type: 'test-type',
                        name: 'Test Component',
                        properties: {},
                    },
                },
                componentTypes: {},
                labels: {},
                regions: {},
            },
        } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);

        mockDesignState({
            componentUpdates: {
                'test-id': {},
            },
        });

        const { result } = renderHook(() => useComponentInfo('test-id'));

        expect(result.current).toEqual({
            id: 'test-id',
            type: 'test-type',
            name: 'Test Component',
            properties: {},
        });
    });

    it('should return null when page designer is not connected', () => {
        vi.mocked(useDesignContext).mockReturnValue({
            pageDesignerConfig: null,
        } as Partial<ReturnType<typeof useDesignContext>> as ReturnType<typeof useDesignContext>);

        mockDesignState({ componentUpdates: {} });

        const { result } = renderHook(() => useComponentInfo('test-id'));

        expect(result.current).toBeNull();
    });
});
