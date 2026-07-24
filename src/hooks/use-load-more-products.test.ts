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
import { useFetcher } from 'react-router';
import { resourceRoutes } from '@/route-paths';
import { useLoadMoreProducts, type UseLoadMoreProductsOptions } from './use-load-more-products';

vi.mock('react-router', () => ({
    useFetcher: vi.fn(),
}));

type FetcherShape = { state: 'idle' | 'loading'; data: unknown; load: ReturnType<typeof vi.fn> };

let fetcher: FetcherShape;

const setFetcher = (patch: Partial<FetcherShape>) => {
    fetcher = { ...fetcher, ...patch };
    vi.mocked(useFetcher).mockReturnValue(fetcher as never);
};

const baseOptions: UseLoadMoreProductsOptions = {
    refine: ['cgid=womens'],
    sort: 'best-matches',
    currency: 'GBP',
    initialCount: 24,
    total: 218,
    batchSize: 24,
    mobileBatchSize: 12,
    maxProducts: 200,
    identity: 'womens-GBP-en-GB',
};

beforeEach(() => {
    fetcher = { state: 'idle', data: undefined, load: vi.fn() };
    vi.mocked(useFetcher).mockReturnValue(fetcher as never);
});

afterEach(() => vi.clearAllMocks());

describe('useLoadMoreProducts', () => {
    it('reports loaded/total/hasMore from the initial page', () => {
        const { result } = renderHook(() => useLoadMoreProducts(baseOptions));
        expect(result.current.loadedCount).toBe(24);
        expect(result.current.total).toBe(218);
        expect(result.current.hasMore).toBe(true);
        expect(result.current.appended).toHaveLength(0);
    });

    it('requests the next offset window with sort/currency/refine', () => {
        const { result } = renderHook(() => useLoadMoreProducts(baseOptions));
        act(() => result.current.loadMore());

        expect(fetcher.load).toHaveBeenCalledTimes(1);
        const url = fetcher.load.mock.calls[0][0] as string;
        expect(url.startsWith(`${resourceRoutes.categoryProducts}?`)).toBe(true);
        const params = new URLSearchParams(url.split('?')[1]);
        expect(params.get('offset')).toBe('24');
        expect(params.get('limit')).toBe('24');
        expect(params.get('sort')).toBe('best-matches');
        expect(params.get('currency')).toBe('GBP');
        expect(params.getAll('refine')).toEqual(['cgid=womens']);
    });

    it('does not fetch while a request is already in flight', () => {
        setFetcher({ state: 'loading' });
        const { result } = renderHook(() => useLoadMoreProducts(baseOptions));
        expect(result.current.isLoading).toBe(true);
        act(() => result.current.loadMore());
        expect(fetcher.load).not.toHaveBeenCalled();
    });

    it('appends a settled batch and advances the offset', () => {
        setFetcher({
            state: 'idle',
            data: { hits: [{ productId: 'p25' }, { productId: 'p26' }], total: 218, offset: 24, limit: 24 },
        });
        const { result } = renderHook(() => useLoadMoreProducts(baseOptions));

        expect(result.current.appended).toHaveLength(2);
        expect(result.current.loadedCount).toBe(26);

        act(() => result.current.loadMore());
        const params = new URLSearchParams((fetcher.load.mock.calls[0][0] as string).split('?')[1]);
        expect(params.get('offset')).toBe('26');
    });

    it('de-duplicates by product id across batches', () => {
        const { result, rerender } = renderHook(() => useLoadMoreProducts(baseOptions));

        act(() => setFetcher({ data: { hits: [{ productId: 'p25' }], total: 218, offset: 24, limit: 24 } }));
        rerender();
        expect(result.current.appended).toHaveLength(1);

        // A subsequent batch that overlaps p25 should not double-render it.
        act(() =>
            setFetcher({
                data: { hits: [{ productId: 'p25' }, { productId: 'p26' }], total: 218, offset: 24, limit: 24 },
            })
        );
        rerender();
        expect(result.current.appended.map((h) => h.productId)).toEqual(['p25', 'p26']);
    });

    it('resets accumulation when the query identity changes', () => {
        setFetcher({ data: { hits: [{ productId: 'p25' }], total: 218, offset: 24, limit: 24 } });
        const { result, rerender } = renderHook((props: UseLoadMoreProductsOptions) => useLoadMoreProducts(props), {
            initialProps: baseOptions,
        });
        expect(result.current.appended).toHaveLength(1);

        rerender({ ...baseOptions, identity: 'mens-GBP-en-GB', total: 40 });
        expect(result.current.appended).toHaveLength(0);
        expect(result.current.total).toBe(40);
    });

    it('flags an error when the fetcher settles with a non-result payload', () => {
        setFetcher({ state: 'idle', data: 'Internal Error' });
        const { result } = renderHook(() => useLoadMoreProducts(baseOptions));
        expect(result.current.hasError).toBe(true);
        expect(result.current.appended).toHaveLength(0);
    });

    it('stops offering more once the loaded count reaches total', () => {
        const { result } = renderHook(() => useLoadMoreProducts({ ...baseOptions, initialCount: 20, total: 20 }));
        expect(result.current.hasMore).toBe(false);
        expect(result.current.capReached).toBe(false);
        act(() => result.current.loadMore());
        expect(fetcher.load).not.toHaveBeenCalled();
    });

    it('reports capReached and stops loading once the DOM cap is hit with products remaining', () => {
        const { result } = renderHook(() =>
            useLoadMoreProducts({ ...baseOptions, initialCount: 200, total: 553, maxProducts: 200 })
        );
        expect(result.current.capReached).toBe(true);
        expect(result.current.hasMore).toBe(false);
        act(() => result.current.loadMore());
        expect(fetcher.load).not.toHaveBeenCalled();
    });

    it('shrinks the final batch so it lands exactly on the DOM cap', () => {
        // 190 loaded, cap 200, batch 24 → should only request the remaining 10.
        const { result } = renderHook(() =>
            useLoadMoreProducts({ ...baseOptions, initialCount: 190, total: 553, batchSize: 24, maxProducts: 200 })
        );
        act(() => result.current.loadMore());
        const params = new URLSearchParams((fetcher.load.mock.calls[0][0] as string).split('?')[1]);
        expect(params.get('offset')).toBe('190');
        expect(params.get('limit')).toBe('10');
    });

    it('scrolls to top when the query identity changes (filter/sort reset)', () => {
        const scrollTo = vi.fn();
        vi.stubGlobal('scrollTo', scrollTo);
        const { rerender } = renderHook((props: UseLoadMoreProductsOptions) => useLoadMoreProducts(props), {
            initialProps: baseOptions,
        });
        // No scroll on initial mount.
        expect(scrollTo).not.toHaveBeenCalled();
        rerender({ ...baseOptions, identity: 'mens-GBP-en-GB' });
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
        vi.unstubAllGlobals();
    });
});
