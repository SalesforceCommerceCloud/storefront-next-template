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
import { describe, expect, it, vi } from 'vitest';
import type { Route } from './+types/resource.basket-refresh';
import { clientLoader, loader, shouldRevalidate } from '@/routes/resource.basket-refresh';
import { refreshBasket } from '@/middlewares/basket.server';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';

vi.mock('@/middlewares/basket.server', () => ({ refreshBasket: vi.fn() }));

describe('basket refresh resource', () => {
    const read = (
        serverLoader: Route.ClientLoaderArgs['serverLoader'],
        request = new Request('https://example.com/resource/basket-refresh')
    ) =>
        clientLoader({
            request,
            url: new URL(request.url),
            pattern: '/resource/basket-refresh',
            serverLoader,
            params: {},
            context: createTestContext(),
        });

    it.each([
        new TypeError('Failed to fetch'),
        new Response('Unavailable', { status: 503 }),
        { status: 502, statusText: 'Bad Gateway', data: '', internal: false },
    ])('contains recoverable transport failures', async (error) => {
        await expect(read(vi.fn().mockRejectedValue(error))).resolves.toEqual({ success: false });
    });
    it.each([
        new Response(null, { status: 302, headers: { Location: '/login' } }),
        new Response('Unauthorized', { status: 401 }),
        new Response('Context changed', { status: 409 }),
        new Error('Unexpected programming error'),
    ])('preserves redirects and other errors', async (error) => {
        await expect(read(vi.fn().mockRejectedValue(error))).rejects.toBe(error);
    });
    it('preserves cancellation', async () => {
        const controller = new AbortController();
        controller.abort();
        const error = new TypeError('Aborted');
        await expect(
            read(
                vi.fn().mockRejectedValue(error),
                new Request('https://example.com/resource/basket-refresh', { signal: controller.signal })
            )
        ).rejects.toBe(error);
    });

    it('keeps shopper data private and leaves repeat loading to the coordinator', async () => {
        vi.mocked(refreshBasket).mockResolvedValue({ success: false });
        const result = await loader(
            createLoaderArgs<Route.LoaderArgs>(
                new Request('https://example.com/resource/basket-refresh'),
                createTestContext(),
                { pattern: '/resource/basket-refresh' }
            )
        );
        expect(result.data).toEqual({ success: false });
        expect(result.init?.headers).toEqual({ 'Cache-Control': 'private, no-store' });
        expect(shouldRevalidate()).toBe(false);
    });
});
