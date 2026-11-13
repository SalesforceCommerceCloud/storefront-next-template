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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';
import { action } from './action.update-shopper-context';
import { getAuth } from '@/middlewares/auth.server';
import { updateShopperContext } from '@/lib/shopper-context/server-utils.server';
import { createFormDataRequest } from '@/test-utils/request-helpers';
import { expectStatus } from '@/lib/test-utils';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';

vi.mock('@salesforce/storefront-next-runtime/config', async (original) => ({
    ...(await original<typeof import('@salesforce/storefront-next-runtime/config')>()),
    getConfig: vi.fn(),
}));

vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/shopper-context/server-utils.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/shopper-context/server-utils.server')>();
    return { ...actual, updateShopperContext: vi.fn() };
});
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

const mockGetAuth = vi.mocked(getAuth);
const mockUpdateShopperContext = vi.mocked(updateShopperContext);

const ACTION_URL = 'http://localhost/action/update-shopper-context';
const mockContext = {} as ActionFunctionArgs['context'];

function createArgs(qualifiers: string | undefined): ActionFunctionArgs {
    const data: Record<string, string> = qualifiers !== undefined ? { qualifiers } : {};
    return {
        request: createFormDataRequest(ACTION_URL, 'PUT', data),
        url: new URL(ACTION_URL),
        params: {},
        context: mockContext,
        pattern: 'action/update-shopper-context',
    };
}

describe('action.update-shopper-context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getConfig).mockReturnValue({ features: { shopperContext: { enabled: true } } } as ReturnType<
            typeof getConfig
        >);
        mockGetAuth.mockReturnValue({ usid: 'test-usid' } as never);
        mockUpdateShopperContext.mockResolvedValue({ setCookieHeaders: [] });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('when qualifiers payload is invalid or empty', () => {
        test('returns 400 when qualifiers are omitted from the request', async () => {
            const res = await action(createArgs(undefined));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(data.error?.message).toContain('At least one qualifier');
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers are an empty string', async () => {
            const res = await action(createArgs(''));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers are not valid JSON', async () => {
            const res = await action(createArgs('not valid json{'));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers are a JSON array instead of an object', async () => {
            const res = await action(createArgs('["value1", "value2"]'));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers are JSON null', async () => {
            const res = await action(createArgs('null'));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers are a JSON string instead of an object', async () => {
            const res = await action(createArgs('"just a string"'));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers are an empty JSON object', async () => {
            const res = await action(createArgs('{}'));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers JSON is malformed (unclosed brace)', async () => {
            const res = await action(createArgs('{"key": "value"'));
            const data = res.data;
            expectStatus(res, 400);
            expect(data.success).toBe(false);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 400 when qualifiers JSON is malformed (trailing comma)', async () => {
            const res = await action(createArgs('{"key": "value",}'));
            expectStatus(res, 400);
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });
    });

    describe('when qualifiers payload is valid', () => {
        test('returns 200 and updates shopper context when source code is provided', async () => {
            const mockSetCookieHeaders = ['dwsourcecode=email; Path=/'];
            mockUpdateShopperContext.mockResolvedValueOnce({ setCookieHeaders: mockSetCookieHeaders });

            const res = await action(createArgs('{"src":"email"}'));
            const data = res.data;

            expectStatus(res, 200);
            expect(data.success).toBe(true);
            expect(data.message).toBeDefined();

            expect(mockUpdateShopperContext).toHaveBeenCalledTimes(1);
            expect(mockUpdateShopperContext).toHaveBeenCalledWith({
                context: mockContext,
                usid: 'test-usid',
                newShopperContext: {},
                newSourceCodeContext: { sourceCode: 'email' },
                cookieHeader: null,
            });

            const setCookieHeaders = res.init?.headers ? new Headers(res.init.headers).getSetCookie() : [];
            expect(setCookieHeaders).toHaveLength(mockSetCookieHeaders.length);
            expect(setCookieHeaders).toEqual(expect.arrayContaining(mockSetCookieHeaders));
        });

        test('returns 200 when multiple qualifiers are provided', async () => {
            const mockSetCookieHeaders = [
                'dwsourcecode=email; Path=/',
                'storefront-next-context-test-usid=eyJkZXZpY2VUeXBlIjoibW9iaWxlIn0=; Path=/',
            ];
            mockUpdateShopperContext.mockResolvedValueOnce({ setCookieHeaders: mockSetCookieHeaders });

            const res = await action(createArgs('{"src":"email","deviceType":"mobile"}'));
            const data = res.data;

            expectStatus(res, 200);
            expect(data.success).toBe(true);
            expect(data.message).toBeDefined();

            expect(mockUpdateShopperContext).toHaveBeenCalledTimes(1);
            expect(mockUpdateShopperContext).toHaveBeenCalledWith({
                context: mockContext,
                usid: 'test-usid',
                newShopperContext: { deviceType: 'mobile' },
                newSourceCodeContext: { sourceCode: 'email' },
                cookieHeader: null,
            });

            const setCookieHeaders = res.init?.headers ? new Headers(res.init.headers).getSetCookie() : [];
            expect(setCookieHeaders).toHaveLength(mockSetCookieHeaders.length);
            expect(setCookieHeaders).toEqual(expect.arrayContaining(mockSetCookieHeaders));
        });

        test('returns 200 when source code is the only qualifier', async () => {
            const res = await action(createArgs('{"src":"email"}'));
            expectStatus(res, 200);
            expect(mockUpdateShopperContext).toHaveBeenCalled();
        });

        test('returns 200 when qualifier values contain spaces or special characters', async () => {
            const res = await action(createArgs('{"src":"value with spaces"}'));
            const data = res.data;
            expectStatus(res, 200);
            expect(data.success).toBe(true);
            expect(mockUpdateShopperContext).toHaveBeenCalled();
        });
    });

    describe('when request is unauthorized or uses wrong method', () => {
        test('logs a disabled-feature rejection without reading or updating qualifiers', async () => {
            vi.mocked(getConfig).mockReturnValue({ features: { shopperContext: { enabled: false } } } as ReturnType<
                typeof getConfig
            >);
            mockGetAuth.mockReturnValue({ customerId: 'customer-123', usid: 'private-usid' } as never);
            const args = createArgs('{"src":"private-qualifier"}');
            const res = await action(args);
            expectStatus(res, 403);
            expect(res.data).toEqual({ success: false, message: 'Shopper context is disabled.' });
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
            const logger = vi.mocked(getLogger).mock.results.at(-1)?.value;
            expect(logger.warn).toHaveBeenCalledWith('UpdateShopperContext: update denied', {
                actor: 'customer-123',
                action: 'update_shopper_context',
                target: 'shopper_context',
                timestamp: expect.any(String),
                outcome: 'denied',
                reason: 'feature_disabled',
                method: 'PUT',
            });
            expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-');
            expect(args.request.bodyUsed).toBe(false);
        });

        test('returns 401 when user session has no USID', async () => {
            mockGetAuth.mockReturnValue({ usid: undefined } as never);
            const res = await action(createArgs('{"src":"email"}'));
            const data = res.data;
            expectStatus(res, 401);
            expect(data.error?.message).toContain("Usid isn't available");
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });

        test('returns 405 when request method is not PUT', async () => {
            const args: ActionFunctionArgs = {
                request: createFormDataRequest(ACTION_URL, 'POST', { qualifiers: '{"src":"email"}' }),
                url: new URL(ACTION_URL),
                params: {},
                context: mockContext,
                pattern: 'action/update-shopper-context',
            };
            const res = await action(args);
            const data = res.data;
            expectStatus(res, 405);
            expect(data.success).toBe(false);
            expect(data.error?.message).toContain('not allowed');
            expect(mockUpdateShopperContext).not.toHaveBeenCalled();
        });
    });
});
