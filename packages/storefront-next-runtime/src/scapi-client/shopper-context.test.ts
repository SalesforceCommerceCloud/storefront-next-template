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
import { ApiError } from './ApiError';
import { createShopperContextHelpers } from './shopper-context';
import type { Clients } from './createClients';

function fault(status: number, type = 'shopper-context-not-found') {
    return new ApiError({
        status,
        statusText: 'Failure',
        headers: new Headers(),
        rawBody: '',
        url: 'https://example.com',
        method: 'PATCH',
        body: {
            type: `https://api.commercecloud.salesforce.com/documentation/error/v1/errors/${type}`,
            title: 'Failure',
            detail: 'Failure',
        },
    });
}
function setup() {
    const client = {
        updateShopperContext: vi.fn().mockResolvedValue({ data: { assignmentQualifiers: { unrelated: 'keep' } } }),
        createShopperContext: vi.fn().mockResolvedValue(undefined),
        getShopperContext: vi.fn().mockResolvedValue({ data: { assignmentQualifiers: { store: 'A' } } }),
        deleteShopperContext: vi.fn(),
    };
    return {
        client,
        helpers: createShopperContextHelpers({ client: client as unknown as Clients['shopperContext'], usid: 'usid' }),
    };
}
describe('native context helpers', () => {
    it('resolves once per request without GET or replacing native state', async () => {
        const { client, helpers } = setup();
        const results = await Promise.all([helpers.resolve(), helpers.resolve()]);
        expect(results[0]).toEqual({ assignmentQualifiers: { unrelated: 'keep' } });
        expect(client.updateShopperContext).toHaveBeenCalledExactlyOnceWith({
            params: { path: { usid: 'usid' } },
            body: {},
        });
        expect(client.getShopperContext).not.toHaveBeenCalled();
        expect(client.createShopperContext).not.toHaveBeenCalled();
    });
    it('patches only the requested keys including targeted deletion', async () => {
        const { client, helpers } = setup();
        await helpers.update({ assignmentQualifiers: { store: null } });
        expect(client.updateShopperContext).toHaveBeenCalledExactlyOnceWith({
            params: { path: { usid: 'usid' } },
            body: { assignmentQualifiers: { store: null } },
        });
        await helpers.resolve();
        expect(client.updateShopperContext).toHaveBeenCalledTimes(1);
    });
    it('does not create a context for a missing readiness probe', async () => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(fault(404));
        expect(await helpers.resolve()).toEqual({});
        expect(client.createShopperContext).not.toHaveBeenCalled();
    });
    it('creates only after an explicit missing-context fault on a requested update', async () => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(fault(404));
        await helpers.update({ assignmentQualifiers: { store: 'A' } });
        expect(client.createShopperContext).toHaveBeenCalledExactlyOnceWith({
            params: { path: { usid: 'usid' } },
            body: { assignmentQualifiers: { store: 'A' } },
        });
    });

    it('seeds only missing context while requested changes take precedence', async () => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(fault(404));
        await helpers.update(
            { sourceCode: 'new', customQualifiers: { deviceType: 'desktop' } },
            {
                initialContext: { sourceCode: 'old', customQualifiers: { deviceType: 'mobile', campaign: 'keep' } },
            }
        );
        expect(client.createShopperContext).toHaveBeenCalledWith({
            params: { path: { usid: 'usid' } },
            body: { sourceCode: 'new', customQualifiers: { deviceType: 'desktop', campaign: 'keep' } },
        });
    });

    it('does not reapply creation defaults over existing native context', async () => {
        const { client, helpers } = setup();
        await helpers.update({ sourceCode: 'new' }, { initialContext: { customQualifiers: { deviceType: 'stale' } } });
        expect(client.updateShopperContext).toHaveBeenCalledWith({
            params: { path: { usid: 'usid' } },
            body: { sourceCode: 'new' },
        });
        expect(client.createShopperContext).not.toHaveBeenCalled();
    });

    it('omits removed qualifiers from creation while preserving PATCH removal and explicit clear metadata', async () => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(fault(404));
        client.getShopperContext.mockResolvedValueOnce({ data: { customQualifiers: { selection: 'cleared' } } });
        const body = { assignmentQualifiers: { store: null }, customQualifiers: { selection: 'cleared' } };
        expect(await helpers.update(body)).toEqual({ customQualifiers: { selection: 'cleared' } });
        expect(client.updateShopperContext).toHaveBeenCalledWith({ params: { path: { usid: 'usid' } }, body });
        expect(client.createShopperContext).toHaveBeenCalledWith({
            params: { path: { usid: 'usid' } },
            body: { assignmentQualifiers: {}, customQualifiers: { selection: 'cleared' } },
        });
        expect(body.assignmentQualifiers.store).toBeNull();
    });
    it('applies removals over creation defaults without dropping unrelated qualifier keys', async () => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(fault(404));
        const initialContext = {
            assignmentQualifiers: { store: 'old', campaign: 'keep' },
            customQualifiers: { remove: 'old', device: 'mobile' },
        };
        await helpers.update(
            { assignmentQualifiers: { store: null }, customQualifiers: { remove: null, selection: 'cleared' } },
            { initialContext }
        );
        expect(client.createShopperContext).toHaveBeenCalledWith({
            params: { path: { usid: 'usid' } },
            body: {
                assignmentQualifiers: { campaign: 'keep' },
                customQualifiers: { device: 'mobile', selection: 'cleared' },
            },
        });
        expect(initialContext.assignmentQualifiers.store).toBe('old');
        expect(initialContext.customQualifiers.remove).toBe('old');
    });
    it.each([
        fault(403),
        fault(404, 'site-not-found'),
        fault(500),
        new Error('timeout'),
    ])('propagates failures without replacement or blind retry: %s', async (error) => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(error);
        await expect(helpers.update({ assignmentQualifiers: { store: 'A' } })).rejects.toBe(error);
        expect(client.createShopperContext).not.toHaveBeenCalled();
        expect(client.updateShopperContext).toHaveBeenCalledTimes(1);
    });
    it('propagates failed creation instead of returning a cookie-only success', async () => {
        const { client, helpers } = setup();
        client.updateShopperContext.mockRejectedValueOnce(fault(404));
        client.createShopperContext.mockRejectedValueOnce(fault(403));
        await expect(helpers.update({ assignmentQualifiers: { store: 'A' } })).rejects.toMatchObject({ status: 403 });
    });
});
