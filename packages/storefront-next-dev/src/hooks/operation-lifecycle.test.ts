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
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({
    mockGet: vi.fn(),
}));

vi.mock('@salesforce/b2c-tooling-sdk', () => ({
    resolveAuthStrategy: vi.fn(() => 'mock-auth'),
}));

vi.mock('@salesforce/b2c-tooling-sdk/clients', () => ({
    createSlasClient: vi.fn(() => ({ GET: mockGet })),
}));

const SFNEXT_BASE_CARTRIDGE = 'app_storefrontnext_base';
const SFNEXT_NOTIFY_SCOPE = 'c_sfnext_notify';

const makeContext = (overrides?: object) => ({
    operationType: 'code:deploy',
    metadata: { cartridges: [SFNEXT_BASE_CARTRIDGE], clientId: 'test-client' },
    instance: { auth: { oauth: { clientId: 'oauth-id', clientSecret: 'oauth-secret' } } },
    ...overrides,
});

const makeResult = (success = true) => ({ success });

const callAfterOperation = async (ctx: object, result: object) => {
    const { default: hook } = await import('./operation-lifecycle.js');
    const self = { debug: vi.fn(), warn: vi.fn() };
    const providers = (await hook.call(self as never, {} as never)).providers;
    await providers[0].afterOperation(ctx as never, result as never);
    return self;
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.SFCC_SHORTCODE = 'kv7kzm78';
    process.env.SFCC_TENANT_ID = 'f_ecom_zzrf_001';
});

describe('operation-lifecycle hook', () => {
    describe('early-exit guards', () => {
        it('skips when operationType is not code:deploy', async () => {
            const self = await callAfterOperation(makeContext({ operationType: 'code:activate' }), makeResult());
            expect(mockGet).not.toHaveBeenCalled();
            expect(self.warn).not.toHaveBeenCalled();
        });

        it('skips when result is not successful', async () => {
            await callAfterOperation(makeContext(), makeResult(false));
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('skips when cartridges is not an array', async () => {
            await callAfterOperation(makeContext({ metadata: { cartridges: null, clientId: 'x' } }), makeResult());
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('skips when app_storefrontnext_base is not in the cartridges list', async () => {
            await callAfterOperation(
                makeContext({ metadata: { cartridges: ['some_other_cartridge'], clientId: 'x' } }),
                makeResult()
            );
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('recognises cartridges supplied as objects with a name property', async () => {
            mockGet.mockResolvedValue({ data: { scopes: [SFNEXT_NOTIFY_SCOPE] } });
            const self = await callAfterOperation(
                makeContext({ metadata: { cartridges: [{ name: SFNEXT_BASE_CARTRIDGE }], clientId: 'test-client' } }),
                makeResult()
            );
            expect(mockGet).toHaveBeenCalled();
            expect(self.warn).not.toHaveBeenCalled();
        });

        it('skips when SFCC_SHORTCODE is missing', async () => {
            delete process.env.SFCC_SHORTCODE;
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(mockGet).not.toHaveBeenCalled();
            expect(self.debug).toHaveBeenCalled();
        });

        it('skips when SFCC_TENANT_ID is missing', async () => {
            delete process.env.SFCC_TENANT_ID;
            await callAfterOperation(makeContext(), makeResult());
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('skips when metadata.clientId is missing', async () => {
            await callAfterOperation(
                makeContext({ metadata: { cartridges: [SFNEXT_BASE_CARTRIDGE], clientId: undefined } }),
                makeResult()
            );
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('skips when oauth clientSecret is missing', async () => {
            await callAfterOperation(
                makeContext({ instance: { auth: { oauth: { clientId: 'id', clientSecret: undefined } } } }),
                makeResult()
            );
            expect(mockGet).not.toHaveBeenCalled();
        });
    });

    describe('SLAS GET failure', () => {
        it('skips and debugs when SLAS GET returns an error', async () => {
            mockGet.mockResolvedValue({ error: { message: 'unauthorized' } });
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).not.toHaveBeenCalled();
            expect(self.debug).toHaveBeenCalled();
        });

        it('skips and debugs when SLAS GET throws', async () => {
            mockGet.mockRejectedValue(new Error('network error'));
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).not.toHaveBeenCalled();
            expect(self.debug).toHaveBeenCalledWith(expect.stringContaining('network error'));
        });
    });

    describe('scope check', () => {
        it('does not warn when scope is present in the array', async () => {
            mockGet.mockResolvedValue({ data: { scopes: [SFNEXT_NOTIFY_SCOPE, 'other_scope'] } });
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).not.toHaveBeenCalled();
        });

        it('warns when scope is absent from the array', async () => {
            mockGet.mockResolvedValue({ data: { scopes: ['other_scope'] } });
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).toHaveBeenCalledWith(expect.stringContaining('setup-base-cartridge'));
        });

        it('does not warn when scope is present in a delimited string', async () => {
            mockGet.mockResolvedValue({ data: { scopes: `other_scope|${SFNEXT_NOTIFY_SCOPE}` } });
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).not.toHaveBeenCalled();
        });

        it('warns when scope is absent from a delimited string', async () => {
            mockGet.mockResolvedValue({ data: { scopes: 'other_scope|another_scope' } });
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).toHaveBeenCalled();
        });

        it('warns when scopes field is undefined', async () => {
            mockGet.mockResolvedValue({ data: { scopes: undefined } });
            const self = await callAfterOperation(makeContext(), makeResult());
            expect(self.warn).toHaveBeenCalled();
        });
    });
});
