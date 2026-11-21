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
import { webcrypto } from 'node:crypto';
import { createCookie } from 'react-router';
import { action } from './action.verify-passwordless-otp';
import authMiddleware, { getAuth } from '@/middlewares/auth.server';
import createBasketMiddleware, { basketResourceContext } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { getCookieConfig } from '@/lib/cookie-utils.server';
import { createBasketHelpers } from '@/scapi';
import { createLoaderArgs, createTestContext } from '@/lib/test-utils';
import { buildMockTokenResponse } from '@/test-utils/auth';

vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: () => logger,
}));
vi.mock('@salesforce/storefront-next-runtime/i18n', async (original) => ({
    ...(await original<typeof import('@salesforce/storefront-next-runtime/i18n')>()),
    getTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/api/wishlist.server', () => ({ captureGuestWishlistSnapshot: vi.fn(), mergeWishlist: vi.fn() }));
vi.mock('@/lib/api/customer.server', () => ({ getCustomerProfileForCheckout: vi.fn() }));

describe('OTP registration with authentication and basket middleware', () => {
    beforeEach(() => {
        vi.stubGlobal('crypto', webcrypto);
        vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
        vi.stubEnv(
            'TAOB_COOKIE_KEYS',
            JSON.stringify([{ id: 'test', key: Buffer.alloc(32, 1).toString('base64url') }])
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('reauthorizes and recalculates the inherited basket without creating an empty replacement', async () => {
        const context = createTestContext();
        const inherited = {
            basketId: 'inherited-basket',
            currency: 'USD',
            productItems: [{ productId: 'sku', quantity: 2 }],
        };
        const read = vi.fn().mockImplementation(() => {
            expect(getAuth(context).userType).toBe('registered');
            return Promise.resolve({ data: inherited });
        });
        const calculate = vi.fn().mockResolvedValue({ data: { ...inherited, orderTotal: 80 } });
        const create = vi.fn().mockResolvedValue({ data: { basketId: 'empty-replacement', currency: 'USD' } });
        const transfer = vi.fn();
        const shopperBasketsV2 = {
            getBasket: read,
            createBasket: create,
            updateBasket: calculate,
            transferBasket: transfer,
        };
        const guest = buildMockTokenResponse({ accessToken: { usid: 'source-usid' } });
        const registered = buildMockTokenResponse({
            accessToken: { usid: 'source-usid', rcid: 'registered-customer' },
        });
        vi.mocked(createApiClients).mockReturnValue({
            auth: {
                loginAsGuest: vi.fn().mockResolvedValue(guest),
                passwordless: { exchangeToken: vi.fn().mockResolvedValue(registered) },
            },
            shopperBasketsV2,
            basket: createBasketHelpers({ shopperBasketsClient: shopperBasketsV2 as any }),
        } as any);
        const cookie = createCookie(
            '__sfdc_basket',
            getCookieConfig(
                {
                    encode: (value: string) => value,
                    decode: (value: string) => value,
                },
                context
            )
        );
        const snapshot = { basketId: inherited.basketId, totalItemCount: 2, uniqueProductCount: 1, lastModified: '' };
        const form = new FormData();
        form.set('email', 'qa@example.com');
        form.set('otpCode', '12345678');
        form.set('isRegistration', 'true');
        const request = new Request('https://example.com/action/verify-passwordless-otp', {
            method: 'POST',
            headers: { Cookie: await cookie.serialize(snapshot) },
            body: form,
        });
        const args = createLoaderArgs(request, context, { pattern: '/action/verify-passwordless-otp' });
        const basketMiddleware = createBasketMiddleware({ mode: 'lazy', currency: 'USD' });
        const response = (await authMiddleware(args, async () => {
            const basketResponse = await basketMiddleware(args, async () => {
                expect(context.get(basketResourceContext)?.snapshot?.basketId).toBe(inherited.basketId);
                const result = await action(args);
                return Response.json(result.data, { status: result.init?.status ?? 200 });
            });
            if (!(basketResponse instanceof Response)) throw new Error('Expected basket middleware response');
            return basketResponse;
        })) as Response;
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true });
        expect(getAuth(context).userType).toBe('registered');
        expect(logger.error.mock.calls).toEqual([]);
        expect(read).toHaveBeenCalledExactlyOnceWith({
            params: { path: { basketId: inherited.basketId }, query: { expand: ['approaching_discounts'] } },
        });
        expect(calculate).toHaveBeenCalledExactlyOnceWith({
            params: { path: { basketId: inherited.basketId } },
            body: { currency: 'USD' },
        });
        expect(create).not.toHaveBeenCalled();
        expect(transfer).not.toHaveBeenCalled();
        expect(context.get(basketResourceContext)?.current).toMatchObject({
            basketId: inherited.basketId,
            orderTotal: 80,
            productItems: inherited.productItems,
        });
        const header = response.headers.getSetCookie().find((value) => value.startsWith('__sfdc_basket='));
        expect(header).toBeDefined();
        expect(await cookie.parse(header?.split(';')[0] ?? '')).toMatchObject(snapshot);
    });
});
