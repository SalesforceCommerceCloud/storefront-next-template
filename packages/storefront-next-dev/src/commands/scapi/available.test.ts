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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Available from './available';
import { createScapiSchemasClient, toOrganizationId } from '@salesforce/b2c-tooling-sdk/clients';

vi.mock('@salesforce/b2c-tooling-sdk/clients', () => ({
    createScapiSchemasClient: vi.fn(),
    toOrganizationId: vi.fn((tenantId: string) => `f_ecom_${tenantId}`),
}));

const mockCreateScapiSchemasClient = vi.mocked(createScapiSchemasClient);
const mockToOrganizationId = vi.mocked(toOrganizationId);

/**
 * Build a mock SchemasClient that responds to per-API schema GETs (for the c_* probe loop)
 * and the bulk schemas listing (for custom-API enumeration).
 */
type SchemaResponses = Record<
    string,
    { components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> } } | { error: number }
>;
function buildMockClient(
    perSchema: SchemaResponses,
    listResponse?: { schemas: Array<{ apiFamily: string; apiName: string; apiVersion: string }> } | { error: number }
) {
    return {
        GET: vi.fn(
            (
                path: string,
                opts: { params: { path: { apiFamily?: string; apiName?: string; apiVersion?: string } } }
            ) => {
                if (path === '/organizations/{organizationId}/schemas') {
                    if (listResponse && 'error' in listResponse) {
                        return Promise.resolve({
                            data: undefined,
                            error: { detail: 'fail' },
                            response: { status: listResponse.error, statusText: 'Bad Request' },
                        });
                    }
                    return Promise.resolve({
                        data: { schemas: listResponse?.schemas ?? [] },
                        error: undefined,
                        response: { status: 200, statusText: 'OK' },
                    });
                }
                const { apiFamily, apiName, apiVersion } = opts.params.path;
                const key = `${apiFamily}/${apiName}/${apiVersion}`;
                const entry = perSchema[key];
                if (!entry) {
                    return Promise.resolve({
                        data: undefined,
                        error: { detail: 'not configured' },
                        response: { status: 404, statusText: 'Not Found' },
                    });
                }
                if ('error' in entry) {
                    return Promise.resolve({
                        data: undefined,
                        error: { detail: 'fail' },
                        response: { status: entry.error, statusText: 'Error' },
                    });
                }
                return Promise.resolve({ data: entry, error: undefined, response: { status: 200, statusText: 'OK' } });
            }
        ),
    };
}

const PRODUCTS_KEY = 'product/shopper-products/v1';

describe('scapi available command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockToOrganizationId.mockImplementation((tenantId: string) => `f_ecom_${tenantId}`);
    });

    function setupCommand(): { cmd: Available; logSpy: ReturnType<typeof vi.spyOn> } {
        const cmd = new Available([], {} as never);

        Object.defineProperty(cmd, 'resolvedConfig', {
            get: () => ({ values: { shortCode: 'kv7kzm78', tenantId: 'zzpq_019' } }),
        });

        (cmd as any).getOAuthStrategy = vi.fn(() => ({ getToken: vi.fn() }));
        const logSpy = vi.spyOn(cmd, 'log').mockImplementation(() => {});

        vi.spyOn(cmd as any, 'parse').mockResolvedValue({
            flags: {},
            args: {},
            argv: [],
            raw: [],
            metadata: {},
        });

        vi.spyOn(cmd as any, 'error').mockImplementation((...args: unknown[]) => {
            throw new Error(String(args[0]));
        });

        vi.spyOn(cmd as any, 'warn').mockImplementation(() => {});
        return { cmd, logSpy };
    }

    it('groups built-in APIs by c_* count and surfaces the most interesting first', async () => {
        const { cmd, logSpy } = setupCommand();
        // shopperProducts has c_loyaltyTier on Product. The rest of the built-ins return
        // empty schema components — so they land in the "no c_* attributes" bucket.
        const empty = { components: { schemas: {} } };
        const builtInKeys = [
            'product/shopper-availability/v1',
            'checkout/shopper-baskets/v1',
            'checkout/shopper-baskets/v2',
            'configuration/shopper-configurations/v1',
            'shopper/shopper-consents/v1',
            'shopper/shopper-context/v1',
            'customer/shopper-customers/v1',
            'product/shopper-delivery-estimates/v1',
            'experience/shopper-experience/v1',
            'pricing/shopper-gift-certificates/v1',
            'shopper/auth/v1',
            'checkout/shopper-orders/v1',
            'checkout/shopper-payments/v1',
            'pricing/shopper-promotions/v1',
            'search/shopper-search/v1',
            'site/shopper-seo/v1',
            'store/shopper-stores/v1',
        ];
        const perSchema: SchemaResponses = Object.fromEntries(builtInKeys.map((k) => [k, empty]));
        perSchema[PRODUCTS_KEY] = {
            components: {
                schemas: {
                    Product: { properties: { c_loyaltyTier: { type: 'string' }, brand: { type: 'string' } } },
                    Category: { properties: { c_headerMenuBanner: { type: 'string' } } },
                },
            },
        };
        mockCreateScapiSchemasClient.mockReturnValue(
            buildMockClient(perSchema, { schemas: [] }) as unknown as ReturnType<typeof createScapiSchemasClient>
        );

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('Probing built-in shopper APIs'))).toBe(true);
        expect(lines.some((l: string) => l.includes('Interesting (c_* attributes present)'))).toBe(true);
        // shopperProducts gets reported with the count + family/name/version invocation.
        expect(lines.some((l: string) => l.includes('shopperProducts (2 c_* attrs across 2 schemas)'))).toBe(true);
        expect(lines.some((l: string) => l.includes('sfnext scapi add product shopper-products v1'))).toBe(true);
        // Per-schema breakdown is shown when ≤8 schemas.
        expect(lines.some((l: string) => l.includes('Product (+1)'))).toBe(true);
        expect(lines.some((l: string) => l.includes('Category (+1)'))).toBe(true);
        // Empty bucket lists the rest of the built-ins.
        expect(lines.some((l: string) => l.includes('No c_* attributes'))).toBe(true);
    });

    it('reports tenant-registered custom APIs separately from built-ins', async () => {
        const { cmd, logSpy } = setupCommand();
        mockCreateScapiSchemasClient.mockReturnValue(
            buildMockClient(
                {},
                { schemas: [{ apiFamily: 'custom', apiName: 'loyalty', apiVersion: 'v1' }] }
            ) as unknown as ReturnType<typeof createScapiSchemasClient>
        );

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('Custom APIs (1)'))).toBe(true);
        expect(lines.some((l: string) => l.includes('custom/loyalty/v1'))).toBe(true);
        expect(lines.some((l: string) => l.includes('clientKey: loyalty'))).toBe(true);
    });

    it('handles the empty-list case gracefully', async () => {
        const { cmd, logSpy } = setupCommand();
        mockCreateScapiSchemasClient.mockReturnValue(
            buildMockClient({}, { schemas: [] }) as unknown as ReturnType<typeof createScapiSchemasClient>
        );

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('No custom SCAPI APIs registered on this tenant.'))).toBe(true);
    });

    it('reports the schemas-listing error path as a warning rather than failing', async () => {
        const { cmd } = setupCommand();
        const warnSpy = vi.spyOn(cmd, 'warn').mockImplementation(() => undefined as never);
        mockCreateScapiSchemasClient.mockReturnValue(
            buildMockClient({}, { error: 403 }) as unknown as ReturnType<typeof createScapiSchemasClient>
        );

        await cmd.run();

        expect(warnSpy.mock.calls.some(([msg]) => String(msg).includes('Schemas listing failed'))).toBe(true);
    });

    it('errors when shortCode is missing from resolved config', async () => {
        const { cmd } = setupCommand();
        Object.defineProperty(cmd, 'resolvedConfig', {
            get: () => ({ values: { shortCode: undefined, tenantId: 'zzpq_019' } }),
        });

        await expect(cmd.run()).rejects.toThrow(/SCAPI short code required/);
    });

    it('errors when tenantId is missing from resolved config', async () => {
        const { cmd } = setupCommand();
        Object.defineProperty(cmd, 'resolvedConfig', {
            get: () => ({ values: { shortCode: 'kv7kzm78', tenantId: undefined } }),
        });

        await expect(cmd.run()).rejects.toThrow(/tenant-id is required/);
    });

    it('omits the per-schema breakdown when more than 8 schemas have c_* attrs', async () => {
        const { cmd, logSpy } = setupCommand();
        const wideSchemas: Record<string, { properties: Record<string, unknown> }> = {};
        for (let i = 0; i < 9; i++) {
            wideSchemas[`Schema${i}`] = { properties: { [`c_attr${i}`]: { type: 'string' } } };
        }
        mockCreateScapiSchemasClient.mockReturnValue(
            buildMockClient(
                { [PRODUCTS_KEY]: { components: { schemas: wideSchemas } } },
                { schemas: [] }
            ) as unknown as ReturnType<typeof createScapiSchemasClient>
        );

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('shopperProducts (9 c_* attrs across 9 schemas)'))).toBe(true);
        // With > 8 schemas, no per-schema breakdown is printed.
        expect(lines.some((l: string) => l.includes('schemas: Schema0'))).toBe(false);
    });

    it('captures thrown Error instances in the errored bucket with the message', async () => {
        const { cmd, logSpy } = setupCommand();
        // Throw on per-API schema fetches but succeed on the bulk listing call so the
        // command finishes the empty-list path after the per-API loop.
        mockCreateScapiSchemasClient.mockReturnValue({
            GET: vi.fn((path: string) => {
                if (path === '/organizations/{organizationId}/schemas') {
                    return Promise.resolve({
                        data: { schemas: [] },
                        error: undefined,
                        response: { status: 200, statusText: 'OK' },
                    });
                }
                throw new Error('network blew up');
            }),
        } as unknown as ReturnType<typeof createScapiSchemasClient>);

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('Errored:'))).toBe(true);
        expect(lines.some((l: string) => l.includes('shopperProducts — network blew up'))).toBe(true);
    });

    it('captures non-Error throwables as "unknown" in the errored bucket', async () => {
        const { cmd, logSpy } = setupCommand();
        mockCreateScapiSchemasClient.mockReturnValue({
            GET: vi.fn((path: string) => {
                if (path === '/organizations/{organizationId}/schemas') {
                    return Promise.resolve({
                        data: { schemas: [] },
                        error: undefined,
                        response: { status: 200, statusText: 'OK' },
                    });
                }
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'naked string';
            }),
        } as unknown as ReturnType<typeof createScapiSchemasClient>);

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('shopperProducts — unknown'))).toBe(true);
    });

    it('records errored APIs in the errored bucket', async () => {
        const { cmd, logSpy } = setupCommand();
        // shopper-products returns a 500 — should land in "Errored:" section.
        mockCreateScapiSchemasClient.mockReturnValue(
            buildMockClient({ [PRODUCTS_KEY]: { error: 500 } }, { schemas: [] }) as unknown as ReturnType<
                typeof createScapiSchemasClient
            >
        );

        await cmd.run();

        const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(lines.some((l: string) => l.includes('Errored:'))).toBe(true);
        expect(lines.some((l: string) => l.includes('shopperProducts — 500'))).toBe(true);
    });
});
