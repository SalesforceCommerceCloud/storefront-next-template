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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComponentVisibility } from './useComponentVisibility';
import { useDesignSelector } from './useDesignSelector';
import type { DesignState } from '../context/DesignStateContext';

vi.mock('./useDesignSelector');

function mockComponentUpdates(componentUpdates: DesignState['componentUpdates']) {
    vi.mocked(useDesignSelector).mockImplementation((selector) => selector({ componentUpdates } as DesignState));
}

describe('useComponentVisibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        [true, 'visible'],
        [false, 'hidden'],
    ] as const)('maps base visibility %s to %s when the host has no override', (isVisible, expected) => {
        mockComponentUpdates({});

        const { result } = renderHook(() => useComponentVisibility('component-id', isVisible));

        expect(result.current).toBe(expected);
    });

    it.each(['visible', 'hidden'] as const)('uses the host-provided %s override over base visibility', (visibility) => {
        mockComponentUpdates({
            'component-id': { visibility },
        });

        const { result } = renderHook(() => useComponentVisibility('component-id', visibility !== 'visible'));

        expect(result.current).toBe(visibility);
    });

    it('ignores an override for a different component', () => {
        mockComponentUpdates({
            'other-component': { visibility: 'hidden' },
        });

        const { result } = renderHook(() => useComponentVisibility('component-id', true));

        expect(result.current).toBe('visible');
    });
});
