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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { resetReturnStoreForTests } from '@/lib/returns/return-store';
import { useReturns } from './use-returns';

const useConfig = vi.fn();
vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: () => useConfig() }));

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fetchMock = vi.fn<(url: string) => Promise<Response>>();

describe('useReturns', () => {
    beforeEach(() => {
        resetReturnStoreForTests();
        window.localStorage.clear();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('reads this browser when the custom API switch is off, and never calls the server', () => {
        useConfig.mockReturnValue({ features: { returnsCustomApi: false } });
        const { result } = renderHook(() => useReturns());
        expect(result.current.ready).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('loads from the server once when the switch is on, with no render or fetch loop', async () => {
        useConfig.mockReturnValue({ features: { returnsCustomApi: true } });
        fetchMock.mockImplementation(() => json({ returns: [] }));
        let renders = 0;
        const { result, rerender } = renderHook(() => {
            renders += 1;
            return useReturns();
        });

        expect(result.current.ready).toBe(false);
        await waitFor(() => expect(result.current.ready).toBe(true));
        await act(async () => {
            rerender();
            rerender();
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(renders).toBeLessThan(10);
    });
});
