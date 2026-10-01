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
import { RouterContextProvider } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Middleware } from '@/scapi';
import { authContext } from '@/middlewares/auth.utils';
import { loggerContext } from '@/lib/logger.server';
import { createMaintenance, maintenanceContext } from '@/lib/maintenance';
import type { Logger } from '@/lib/logger';
import type { NonPersonalizedResponseClassifier } from '@/lib/scapi/non-personalized-response.server';
import { createApiClients } from './api-clients.server';

type TestClientEntry = {
    key: string;
    basePath: string;
    ops: Record<string, { m: string; b: string; s: string }>;
    locale: boolean;
    orgPrefix: boolean;
};

const mocks = vi.hoisted(() => ({
    customClients: [] as TestClientEntry[],
    classifier: vi.fn<NonPersonalizedResponseClassifier>(),
    defaultClassifier: undefined as NonPersonalizedResponseClassifier | undefined,
    builtInUseSpies: [] as Array<ReturnType<typeof vi.spyOn>>,
    customUseSpies: [] as Array<ReturnType<typeof vi.spyOn>>,
    classificationMiddlewares: [] as Middleware[],
}));

vi.mock('@/scapi/custom-clients', () => ({
    customClients: mocks.customClients,
}));

vi.mock('@/lib/scapi/non-personalized-response-policy.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/scapi/non-personalized-response-policy.server')>();
    mocks.defaultClassifier = actual.defaultNonPersonalizedResponseClassifier;
    return { ...actual, defaultNonPersonalizedResponseClassifier: mocks.classifier };
});

vi.mock('@/lib/scapi/non-personalized-response.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/scapi/non-personalized-response.server')>();
    return {
        ...actual,
        createNonPersonalizedResponseMiddleware: vi.fn((options) => {
            const middleware = actual.createNonPersonalizedResponseMiddleware(options);
            mocks.classificationMiddlewares.push(middleware);
            return middleware;
        }),
    };
});

vi.mock('@salesforce/storefront-next-runtime/scapi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/scapi')>();
    return {
        ...actual,
        createCommerceApiClients: vi.fn((config) => {
            const clients = actual.createCommerceApiClients(config);
            mocks.builtInUseSpies = Object.keys(actual.BUILT_IN_CLIENT_DEFAULTS).map((key) =>
                vi.spyOn(clients[key as keyof typeof actual.BUILT_IN_CLIENT_DEFAULTS], 'use')
            );
            return clients;
        }),
        createClient: vi.fn((...args: Parameters<typeof actual.createClient>) => {
            const client = actual.createClient(...args);
            mocks.customUseSpies.push(vi.spyOn(client, 'use'));
            return client;
        }),
    };
});

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        getConfig: vi.fn(() => ({
            commerce: {
                api: {
                    shortCode: 'short-code',
                    clientId: 'client-id',
                    organizationId: 'organization-id',
                    callback: '/callback',
                },
            },
            i18n: { fallbackLng: 'en-US' },
        })),
    };
});

vi.mock('@salesforce/storefront-next-runtime/i18n', () => ({
    getTranslation: vi.fn(() => ({ i18next: { language: 'en-US' } })),
}));

vi.mock('@/lib/origin', () => ({
    getAppOrigin: vi.fn(() => 'https://storefront.example.com'),
}));

const createContext = (logger?: Logger) => {
    const context = new RouterContextProvider();
    context.set(siteContext, {
        site: { id: 'site-id' },
        locale: { id: 'en-US' },
    } as never);
    context.set(authContext, {
        ref: Promise.resolve({ accessToken: 'access-token', userType: 'guest' as const }),
    });
    context.set(maintenanceContext, createMaintenance());
    context.set(
        loggerContext,
        logger ??
            ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            } as unknown as Logger)
    );
    return context;
};

const shopperProductsOverride = (): TestClientEntry => ({
    key: 'shopperProducts',
    basePath: '/product/shopper-products/v1',
    ops: {
        getCategory: { m: 'GET', b: '/organizations/{organizationId}/categories', s: '/{id}' },
    },
    locale: true,
    orgPrefix: false,
});

const loyaltyClient = (): TestClientEntry => ({
    key: 'loyalty',
    basePath: '/custom/loyalty/v1',
    ops: { getOffers: { m: 'GET', b: '', s: '/offers' } },
    locale: false,
    orgPrefix: true,
});

const shopperBasketsOverride = (): TestClientEntry => ({
    key: 'shopperBasketsV2',
    basePath: '/checkout/shopper-baskets/v2',
    ops: {
        createBasket: { m: 'POST', b: '/organizations/{organizationId}/baskets', s: '' },
        getBasket: { m: 'GET', b: '/organizations/{organizationId}/baskets', s: '/{basketId}' },
    },
    locale: false,
    orgPrefix: false,
});

describe('API client non-personalized response integration', () => {
    let requests: Request[];

    beforeEach(() => {
        requests = [];
        mocks.customClients.length = 0;
        mocks.builtInUseSpies = [];
        mocks.customUseSpies = [];
        mocks.classificationMiddlewares = [];
        mocks.classifier.mockImplementation((input) => mocks.defaultClassifier?.(input) ?? false);
        vi.stubGlobal('window', undefined);
        vi.stubGlobal(
            'fetch',
            vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
                requests.push(input instanceof Request ? input : new Request(input, init));
                return Promise.resolve(Response.json({ basketId: 'basket-id' }));
            })
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('classifies reviewed built-ins once and preserves explicit and non-GET requests', async () => {
        const debug = vi.fn();
        const logger = { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
        const clients = createApiClients(createContext(logger));

        expect(mocks.builtInUseSpies).not.toHaveLength(0);
        expect(
            mocks.builtInUseSpies.every(
                (spy) =>
                    spy.mock.calls.filter(([middleware]: [Middleware]) =>
                        mocks.classificationMiddlewares.includes(middleware)
                    ).length === 1
            )
        ).toBe(true);

        await clients.shopperProducts.getCategory({ params: { path: { id: 'category-id' } } });
        await clients.shopperCustomers.getCustomer({ params: { path: { customerId: 'customer-id' } } });
        await clients.shopperProducts.getCategory({
            params: { path: { id: 'explicit-category' }, query: { personalized: 'none' } },
        });
        await clients.shopperBasketsV2.createBasket({
            params: { query: {} },
            body: { currency: 'USD' },
        });

        expect(new URL(requests[0].url).searchParams.get('personalized')).toBe('none');
        expect(new URL(requests[1].url).searchParams.has('personalized')).toBe(false);
        expect(new URL(requests[2].url).searchParams.get('personalized')).toBe('none');
        expect(requests[3].method).toBe('POST');
        expect(new URL(requests[3].url).searchParams.has('personalized')).toBe(false);
        expect(mocks.classifier).toHaveBeenCalledTimes(2);
        expect(debug.mock.calls.map(([, metadata]) => metadata?.personalizationMode)).toEqual([
            'automatic-none',
            'absent',
            'explicit',
            'absent',
        ]);
    });

    it.each([
        ['override', shopperProductsOverride(), 'getCategory', { params: { path: { id: 'category-id' } } }],
        ['custom', loyaltyClient(), 'getOffers', {}],
    ])('keeps a %s client false by default and permits an exact customer opt-in', async (_kind, entry, method, options) => {
        mocks.customClients.push(entry);
        const clients = createApiClients(createContext()) as unknown as Record<
            string,
            Record<string, (requestOptions: unknown) => Promise<unknown>>
        >;

        await clients[entry.key][method](options);
        expect(new URL(requests.at(-1)?.url ?? '').searchParams.has('personalized')).toBe(false);

        mocks.classifier.mockImplementation(
            (input) =>
                input.client === entry.key &&
                input.provenance === _kind &&
                input.clientBasePath === entry.basePath &&
                input.schemaPath === Object.values(entry.ops)[0].b + Object.values(entry.ops)[0].s
        );
        await clients[entry.key][method](options);

        expect(new URL(requests.at(-1)?.url ?? '').searchParams.get('personalized')).toBe('none');
        expect(mocks.customUseSpies).toHaveLength(1);
        expect(mocks.customUseSpies[0]).toHaveBeenCalledTimes(6);
    });

    it('routes rebuilt basket helpers through the active override middleware', async () => {
        mocks.customClients.push(shopperBasketsOverride());
        mocks.classifier.mockImplementation(
            (input) =>
                input.client === 'shopperBasketsV2' &&
                input.provenance === 'override' &&
                input.schemaPath === '/organizations/{organizationId}/baskets/{basketId}'
        );
        const clients = createApiClients(createContext());

        await clients.basket.getOrCreateBasket({
            params: { path: { basketId: 'basket-id' } },
            body: { currency: 'USD' },
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toContain(
            '/checkout/shopper-baskets/v2/organizations/organization-id/baskets/basket-id'
        );
        expect(new URL(requests[0].url).searchParams.get('personalized')).toBe('none');
    });
});
