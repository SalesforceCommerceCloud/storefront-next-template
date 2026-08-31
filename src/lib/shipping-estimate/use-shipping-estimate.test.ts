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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFetcher } from 'react-router';
import { useShippingEstimate, type ShippingEstimateResponse } from './use-shipping-estimate';

vi.mock('react-router', () => ({
    useFetcher: vi.fn(),
}));

const load = vi.fn();

describe('useShippingEstimate', () => {
    beforeEach(() => {
        load.mockReset();
        vi.mocked(useFetcher).mockReturnValue({ state: 'idle', data: undefined, load } as never);
    });

    it('waits for an enabled delivery estimate before auto-fetching a saved ZIP', () => {
        const { rerender } = renderHook(
            ({ enabled }) =>
                useShippingEstimate({
                    productId: 'product-1',
                    initialDestination: { postalCode: '94105' },
                    enabled,
                }),
            { initialProps: { enabled: false } }
        );

        expect(load).not.toHaveBeenCalled();

        rerender({ enabled: true });

        expect(load).toHaveBeenCalledOnce();
        expect(load).toHaveBeenCalledWith('/resource/shipping-estimate?productId=product-1&zipcode=94105');

        rerender({ enabled: false });
        rerender({ enabled: true });

        expect(load).toHaveBeenCalledOnce();
    });

    it('includes the initial destination country in the automatic request', () => {
        renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: 'M5V 3A8', countryCode: 'CA' },
            })
        );

        expect(load).toHaveBeenCalledWith(
            '/resource/shipping-estimate?productId=product-1&zipcode=M5V%203A8&countryCode=CA'
        );
    });

    it('normalizes an unspaced Canadian saved destination before automatic lookup', () => {
        renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: 'm5v3a8', countryCode: 'CA' },
            })
        );

        expect(load).toHaveBeenCalledWith(
            '/resource/shipping-estimate?productId=product-1&zipcode=M5V%203A8&countryCode=CA'
        );
    });

    it('matches an automatic response against the normalized saved destination', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: true,
                productId: 'product-1',
                zipcode: 'M5V 3A8',
                countryCode: 'CA',
                estimate: { product: 'product-1' },
            },
            load,
        } as never);

        const { result } = renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: 'm5v3a8', countryCode: 'CA' },
            })
        );

        expect(result.current.estimate).toEqual({ product: 'product-1' });
        expect(result.current.autoFetchInFlight).toBe(false);
    });

    it('normalizes an explicit match key with the saved destination country', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: true,
                productId: 'product-1',
                zipcode: 'M5V 3A8',
                countryCode: 'CA',
                estimate: { product: 'product-1' },
            },
            load,
        } as never);

        const { result } = renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: 'm5v3a8', countryCode: 'CA' },
                matchAgainst: 'm5v3a8',
            })
        );

        expect(result.current.estimate).toEqual({ product: 'product-1' });
        expect(result.current.autoFetchInFlight).toBe(false);
    });

    it('does not keep an automatic lookup in flight for an invalid match key', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: true,
                productId: 'product-1',
                zipcode: '12345',
                countryCode: 'US',
                estimate: { product: 'product-1' },
            },
            load,
        } as never);

        const { result } = renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: '12345', countryCode: 'CA' },
                matchAgainst: '12345',
            })
        );

        expect(result.current.estimate).toBeNull();
        expect(result.current.autoFetchInFlight).toBe(false);
    });

    it('uses the country supplied by an explicit load', () => {
        const { result } = renderHook(() => useShippingEstimate({ productId: 'product-1' }));

        act(() => result.current.load('M5V 3A8', 'CA'));

        expect(load).toHaveBeenCalledWith(
            '/resource/shipping-estimate?productId=product-1&zipcode=M5V%203A8&countryCode=CA&persistDestination=true'
        );
    });

    it('ignores an explicit lookup with an invalid postal code', () => {
        const { result } = renderHook(() =>
            useShippingEstimate({ productId: 'product-1', initialDestination: { postalCode: '94105' } })
        );

        act(() => result.current.load('invalid'));

        expect(load).toHaveBeenCalledWith('/resource/shipping-estimate?productId=product-1&zipcode=94105');
        expect(result.current.autoFetchInFlight).toBe(true);
    });

    it('does not replay a manual lookup after its destination state update', () => {
        const { result } = renderHook(() => useShippingEstimate({ productId: 'product-1' }));

        act(() => result.current.load('94105'));

        expect(load).toHaveBeenCalledOnce();
        expect(load).toHaveBeenCalledWith(
            '/resource/shipping-estimate?productId=product-1&zipcode=94105&persistDestination=true'
        );
    });

    it('reports a first manual lookup as in flight', () => {
        const fetcher = { state: 'idle', data: undefined, load };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);

        const { result, rerender } = renderHook(() => useShippingEstimate({ productId: 'product-1' }));

        fetcher.state = 'loading';
        act(() => result.current.load('94105'));
        rerender();

        expect(result.current.autoFetchInFlight).toBe(true);
    });

    it('only advances request lifecycle when loading the same destination again', () => {
        let renderCount = 0;
        const { result } = renderHook(() => {
            renderCount += 1;
            return useShippingEstimate({ productId: 'product-1' });
        });

        act(() => result.current.load('M5V 3A8', 'CA'));
        const renderCountAfterFirstLoad = renderCount;
        const requestCountAfterFirstLoad = load.mock.calls.length;
        act(() => result.current.load('M5V 3A8', 'CA'));

        expect(renderCount).toBe(renderCountAfterFirstLoad + 1);
        expect(load).toHaveBeenCalledTimes(requestCountAfterFirstLoad + 1);
    });

    it('settles each request even when a retry returns the same response object', () => {
        const response = {
            success: false as const,
            productId: 'product-1',
            zipcode: '94105',
            fallbackDeliveryDescription: 'Delivered in 2-3 business days',
        };
        const fetcher = { state: 'idle' as 'idle' | 'loading', data: response, load };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);
        const { result, rerender } = renderHook(() => useShippingEstimate({ productId: 'product-1' }));

        act(() => result.current.load('94105'));
        expect(result.current.requestSequence).toBe(1);

        fetcher.state = 'loading';
        rerender();
        fetcher.state = 'idle';
        rerender();

        expect(result.current.settledSequence).toBe(1);

        act(() => result.current.load('94105'));
        fetcher.state = 'loading';
        rerender();
        fetcher.state = 'idle';
        rerender();

        expect(result.current.requestSequence).toBe(2);
        expect(result.current.settledSequence).toBe(2);
        expect(result.current.fallbackDeliveryDescription).toBe('Delivered in 2-3 business days');
    });

    it('settles the latest request when it supersedes an already-loading request', () => {
        const fetcher = {
            state: 'idle' as 'idle' | 'loading',
            data: undefined as ShippingEstimateResponse<{ product: string }> | undefined,
            load,
        };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);
        const { result, rerender } = renderHook(() =>
            useShippingEstimate<{ product: string }>({ productId: 'product-1' })
        );

        act(() => result.current.load('94105'));
        fetcher.state = 'loading';
        rerender();

        act(() => result.current.load('10001'));
        expect(result.current.requestSequence).toBe(2);

        fetcher.data = {
            success: true,
            productId: 'product-1',
            zipcode: '10001',
            countryCode: 'US',
            estimate: { product: 'second-request' },
        };
        fetcher.state = 'idle';
        rerender();

        expect(result.current.settledSequence).toBe(2);
        expect(result.current.estimate).toEqual({ product: 'second-request' });
    });

    it('normalizes an explicit country before querying and matching the response', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: true,
                productId: 'product-1',
                zipcode: 'M5V 3A8',
                countryCode: 'CA',
                estimate: { product: 'product-1' },
            },
            load,
        } as never);

        const { result, rerender } = renderHook(() =>
            useShippingEstimate<{ product: string }>({ productId: 'product-1' })
        );

        act(() => result.current.load('M5V 3A8', ' ca '));
        rerender();

        expect(load).toHaveBeenCalledWith(
            '/resource/shipping-estimate?productId=product-1&zipcode=M5V%203A8&countryCode=CA&persistDestination=true'
        );
        expect(result.current.estimate).toEqual({ product: 'product-1' });
    });

    it('refetches the last calculated postal code and hides the previous product estimate after a variant change', () => {
        const fetcher = {
            state: 'idle',
            data: {
                success: true as const,
                productId: 'product-1',
                zipcode: '94105',
                estimate: { product: 'product-1' },
            },
            load,
        };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);

        const { result, rerender } = renderHook(
            ({ productId }) => useShippingEstimate({ productId, initialDestination: { postalCode: '94105' } }),
            { initialProps: { productId: 'product-1' } }
        );

        result.current.load('94107');
        fetcher.data = { success: true, productId: 'product-1', zipcode: '94107', estimate: { product: 'product-1' } };
        rerender({ productId: 'product-1' });

        expect(result.current.estimate).toEqual({ product: 'product-1' });

        fetcher.state = 'loading';
        rerender({ productId: 'variant-1' });

        expect(load).toHaveBeenLastCalledWith('/resource/shipping-estimate?productId=variant-1&zipcode=94107');
        expect(result.current.estimate).toBeNull();

        fetcher.state = 'idle';
        fetcher.data = { success: true, productId: 'variant-1', zipcode: '94107', estimate: { product: 'variant-1' } };
        rerender({ productId: 'variant-1' });

        expect(result.current.estimate).toEqual({ product: 'variant-1' });
    });

    it('surfaces a merchant-authored fallback without retaining estimate details', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: false,
                productId: 'product-1',
                zipcode: '94105',
                fallbackDeliveryDescription: 'Delivered in 2-3 business days',
            },
            load,
        } as never);

        const { result } = renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: '94105' },
                matchAgainst: '94105',
            })
        );

        expect(result.current).toMatchObject({
            estimate: null,
            hasError: true,
            fallbackDeliveryDescription: 'Delivered in 2-3 business days',
            matchedZipcode: null,
            autoFetchInFlight: false,
        });
    });

    it('settles an empty response as neutral for the matched product and saved ZIP', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: false,
                empty: true,
                productId: 'product-1',
                zipcode: '94105',
            },
            load,
        } as never);

        const { result } = renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: '94105' },
                matchAgainst: '94105',
            })
        );

        expect(result.current).toMatchObject({
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: '94105',
            autoFetchInFlight: false,
        });
    });

    it('clears a stale failed response while loading a newly requested ZIP', () => {
        const fetcher = {
            state: 'idle',
            data: {
                success: false as const,
                productId: 'product-1',
                zipcode: '94105',
                fallbackDeliveryDescription: 'Delivered in 2-3 business days',
            },
            load,
        };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);

        const { result, rerender } = renderHook(() =>
            useShippingEstimate({ productId: 'product-1', initialDestination: { postalCode: '94105' } })
        );

        expect(result.current).toMatchObject({
            hasError: true,
            fallbackDeliveryDescription: 'Delivered in 2-3 business days',
        });

        fetcher.state = 'loading';
        act(() => result.current.load('94107'));
        rerender();

        expect(result.current).toMatchObject({
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
        });
    });

    it('keeps an automatic lookup in flight when an idle response is for the same product but a stale ZIP', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: true,
                productId: 'product-1',
                zipcode: '94107',
                estimate: { product: 'product-1' },
            },
            load,
        } as never);

        const { result } = renderHook(() =>
            useShippingEstimate({
                productId: 'product-1',
                initialDestination: { postalCode: '94105' },
                matchAgainst: '94105',
            })
        );

        expect(result.current).toMatchObject({
            estimate: null,
            matchedZipcode: null,
            autoFetchInFlight: true,
        });
    });

    it('hides a failed lookup after the shopper edits the postal code', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: false,
                productId: 'product-1',
                zipcode: '94105',
                fallbackDeliveryDescription: 'Delivered in 2-3 business days',
            },
            load,
        } as never);

        const { result, rerender } = renderHook(
            ({ matchAgainst }) =>
                useShippingEstimate({
                    productId: 'product-1',
                    initialDestination: { postalCode: '94105' },
                    matchAgainst,
                }),
            { initialProps: { matchAgainst: '94105' } }
        );

        expect(result.current.hasError).toBe(true);

        rerender({ matchAgainst: '94107' });

        expect(result.current).toMatchObject({
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
        });
    });

    it('hides a failed lookup after the shopper selects another product', () => {
        vi.mocked(useFetcher).mockReturnValue({
            state: 'idle',
            data: {
                success: false,
                productId: 'product-1',
                zipcode: '94105',
                fallbackDeliveryDescription: 'Delivered in 2-3 business days',
            },
            load,
        } as never);

        const { result, rerender } = renderHook(
            ({ productId }) =>
                useShippingEstimate({ productId, initialDestination: { postalCode: '94105' }, matchAgainst: '94105' }),
            { initialProps: { productId: 'product-1' } }
        );

        expect(result.current.hasError).toBe(true);

        rerender({ productId: 'variant-1' });

        expect(result.current).toMatchObject({
            estimate: null,
            hasError: false,
            fallbackDeliveryDescription: null,
            matchedZipcode: null,
        });
    });

    it('settles an opaque failure after the current request completes', () => {
        const fetcher: { state: 'loading' | 'idle'; data: { success: false } | undefined; load: typeof load } = {
            state: 'loading',
            data: undefined,
            load,
        };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);

        const { result, rerender } = renderHook(() =>
            useShippingEstimate({ productId: 'product-1', initialDestination: { postalCode: '94105' } })
        );

        fetcher.state = 'idle';
        fetcher.data = { success: false };
        rerender();

        expect(result.current).toMatchObject({
            estimate: null,
            hasError: true,
            autoFetchInFlight: false,
        });
    });

    it('settles an opaque failure only for the active request', () => {
        const fetcher: { state: 'loading' | 'idle'; data: { success: false } | undefined; load: typeof load } = {
            state: 'loading',
            data: undefined,
            load,
        };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);

        const { result, rerender } = renderHook(() =>
            useShippingEstimate({ productId: 'product-1', initialDestination: { postalCode: '94105' } })
        );

        expect(load).toHaveBeenCalledWith('/resource/shipping-estimate?productId=product-1&zipcode=94105');

        fetcher.state = 'idle';
        fetcher.data = { success: false };
        rerender();

        expect(result.current.hasError).toBe(true);
    });

    it('hides an opaque failure after the shopper changes postal code or product', () => {
        const fetcher: { state: 'loading' | 'idle'; data: { success: false } | undefined; load: typeof load } = {
            state: 'loading',
            data: undefined,
            load,
        };
        vi.mocked(useFetcher).mockReturnValue(fetcher as never);

        const { result, rerender } = renderHook(
            ({ productId }) => useShippingEstimate({ productId, initialDestination: { postalCode: '94105' } }),
            { initialProps: { productId: 'product-1' } }
        );

        fetcher.state = 'idle';
        fetcher.data = { success: false };
        rerender({ productId: 'product-1' });
        expect(result.current.hasError).toBe(true);

        fetcher.state = 'loading';
        act(() => result.current.load('94107'));
        rerender({ productId: 'product-1' });
        expect(result.current.hasError).toBe(false);

        rerender({ productId: 'variant-1' });
        expect(result.current.hasError).toBe(false);
    });
});
