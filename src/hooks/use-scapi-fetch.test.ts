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
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useScapiFetchClient, useScapiFetchHelper } from './use-scapi-fetch';

describe('useScapiFetchClient', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    test('submit posts JSON to the resource route and resolves with ApiResponse', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ success: true, data: { id: 'item-1' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const { result } = renderHook(() =>
            useScapiFetchClient('shopperCustomers', 'createCustomerProductListItem', {
                params: { path: { customerId: 'cust-1', listId: 'list-1' } },
                body: {} as never,
            })
        );

        let response;
        await act(async () => {
            response = await result.current.submit({ productId: 'sku-1', type: 'product' } as never);
        });

        expect(response).toEqual({ success: true, data: { id: 'item-1' } });
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toMatch(/^\/resource\/api\/client\//);
        expect(init?.method).toBe('POST');
        expect(init?.credentials).toBe('same-origin');
        const headers = init?.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(init?.body as string)).toEqual({ productId: 'sku-1', type: 'product' });
    });

    test('isPending lifecycle: false → true → false', async () => {
        let resolveFetch!: (r: Response) => void;
        fetchSpy.mockReturnValue(new Promise<Response>((r) => (resolveFetch = r)));

        const { result } = renderHook(() =>
            useScapiFetchClient('shopperCustomers', 'createCustomerProductListItem', {
                params: { path: { customerId: 'c', listId: 'l' } },
                body: {} as never,
            })
        );

        expect(result.current.isPending).toBe(false);

        let submitPromise!: Promise<unknown>;
        act(() => {
            submitPromise = result.current.submit({ productId: 'sku-1', type: 'product' } as never);
        });

        expect(result.current.isPending).toBe(true);

        await act(async () => {
            resolveFetch(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
            await submitPromise;
        });

        expect(result.current.isPending).toBe(false);
    });

    test('HTTP non-2xx coerces into { success: false, errors }', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ success: false, errors: ['Bad request'] }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const { result } = renderHook(() =>
            useScapiFetchClient('shopperCustomers', 'createCustomerProductListItem', {
                params: { path: { customerId: 'c', listId: 'l' } },
                body: {} as never,
            })
        );

        let response;
        await act(async () => {
            response = await result.current.submit({ productId: 'x', type: 'product' } as never);
        });

        expect(response).toEqual({ success: false, errors: ['Bad request'] });
    });

    test('network error coerces into { success: false, errors }', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

        const { result } = renderHook(() =>
            useScapiFetchClient('shopperCustomers', 'createCustomerProductListItem', {
                params: { path: { customerId: 'c', listId: 'l' } },
                body: {} as never,
            })
        );

        let response;
        await act(async () => {
            response = await result.current.submit({ productId: 'x', type: 'product' } as never);
        });

        expect(response).toEqual({ success: false, errors: ['Failed to fetch'] });
    });

    test('useScapiFetchHelper encodes the helpers tuple with helperName', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true, data: null }), { status: 200 }));

        const { result } = renderHook(() =>
            useScapiFetchHelper('basket', 'getOrCreateBasket', {
                params: { path: { basketId: 'basket-123' } },
                body: { currency: 'USD' },
            })
        );

        await act(async () => {
            await result.current.submit({ currency: 'USD' } as never);
        });

        const [url] = fetchSpy.mock.calls[0];
        expect(url).toMatch(/^\/resource\/api\/client\//);
        const segment = String(url).replace('/resource/api/client/', '');
        const tuple = JSON.parse(
            atob(
                segment
                    .replaceAll('-', '+')
                    .replaceAll('_', '/')
                    .padEnd(Math.ceil(segment.length / 4) * 4, '=')
            )
        );
        expect(tuple[0]).toBe('helpers');
        expect(tuple[1]).toBe('basket');
        expect(tuple[2].helperName).toBe('getOrCreateBasket');
    });

    test('per-call params override re-encodes the URL for that submit', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true, data: null }), { status: 200 }));

        const { result } = renderHook(() =>
            useScapiFetchClient('shopperCustomers', 'deleteCustomerProductListItem', {
                params: { path: { customerId: 'c', listId: 'l', itemId: '__placeholder__' } },
            })
        );

        await act(async () => {
            await result.current.submit(undefined, {
                params: { path: { customerId: 'c', listId: 'l', itemId: 'real-item-1' } },
            });
        });

        const [url] = fetchSpy.mock.calls[0];
        // Decode the encoded resource segment and assert the override took effect.
        const segment = String(url).replace('/resource/api/client/', '');
        const tuple = JSON.parse(
            atob(
                segment
                    .replaceAll('-', '+')
                    .replaceAll('_', '/')
                    .padEnd(Math.ceil(segment.length / 4) * 4, '=')
            )
        );
        expect(tuple[2].params.path.itemId).toBe('real-item-1');
    });
});
