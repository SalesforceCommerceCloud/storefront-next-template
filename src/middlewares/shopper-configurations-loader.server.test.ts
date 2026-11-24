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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MiddlewareFunction } from 'react-router';
import { readShopperConfigurations } from '@salesforce/storefront-next-runtime/data-store';
import { createTestContext } from '@/lib/test-utils';
import { createApiClients } from '@/lib/api-clients.server';
import { shopperConfigurationsLoaderMiddleware } from './shopper-configurations-loader.server';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

type MiddlewareArgs = Parameters<MiddlewareFunction<Response>>[0];
type MiddlewareNext = Parameters<MiddlewareFunction<Response>>[1];

const SITE_PREFERENCES = { data: [{ id: 'minimumDeliveryValue', value: 25 }] };
const GLOBAL_PREFERENCES = { data: [{ id: 'brandName', value: 'Acme' }] };
const RESPONSE = {
    configurations: [],
    c_customSitePreferences: SITE_PREFERENCES,
    c_customGlobalPreferences: GLOBAL_PREFERENCES,
};
const PREFERENCES = { sitePreferences: SITE_PREFERENCES, globalPreferences: GLOBAL_PREFERENCES };

describe('shopperConfigurationsLoaderMiddleware', () => {
    const getConfigurations = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        getConfigurations.mockResolvedValue({ data: RESPONSE });
        vi.mocked(createApiClients).mockReturnValue({
            shopperConfigurations: { getConfigurations },
        } as unknown as ReturnType<typeof createApiClients>);
    });

    async function runMiddleware() {
        const context = createTestContext();
        const next = vi.fn().mockResolvedValue(new Response('ok'));
        await shopperConfigurationsLoaderMiddleware(
            { request: new Request('https://example.com'), context } as unknown as MiddlewareArgs,
            next as MiddlewareNext
        );
        return { context, next };
    }

    test('does not call Shopper Configurations until the response is read', async () => {
        const { next } = await runMiddleware();

        expect(next).toHaveBeenCalledOnce();
        expect(getConfigurations).not.toHaveBeenCalled();
    });

    test('fetches once per request with the request context and maps the cartridge fields', async () => {
        const { context } = await runMiddleware();

        const [first, second] = await Promise.all([
            readShopperConfigurations(context),
            readShopperConfigurations(context),
        ]);

        expect(first).toEqual(PREFERENCES);
        expect(second).toEqual(PREFERENCES);
        expect(createApiClients).toHaveBeenCalledWith(context);
        expect(getConfigurations).toHaveBeenCalledOnce();
    });

    test('resolves to null when the call fails', async () => {
        getConfigurations.mockRejectedValue(new Error('401'));
        const { context } = await runMiddleware();

        await expect(readShopperConfigurations(context)).resolves.toBeNull();
    });
});
