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
import type { ActionFunctionArgs } from 'react-router';

import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { action } from './action.passkey-start-authentication';
import { startPasskeyAuthentication } from '@/middlewares/auth.server';
import { ApiError } from '@/scapi';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({ features: { passkey: { enabled: true } } })),
}));
vi.mock('@/middlewares/auth.server');
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

const mockStartPasskeyAuthentication = vi.mocked(startPasskeyAuthentication);
const mockGetConfig = vi.mocked(getConfig);

describe('action.passkey-start-authentication', () => {
    let mockContext: ActionFunctionArgs['context'];

    const createActionArgs = ({
        method = 'POST',
        userId,
    }: {
        method?: string;
        userId?: string;
    } = {}): ActionFunctionArgs => {
        const formData = new FormData();
        if (userId !== undefined) {
            formData.append('userId', userId);
        }

        return {
            request: new Request('http://localhost/action/passkey-start-authentication', {
                method,
                body: method === 'POST' ? formData : undefined,
            }),
            params: {},
            context: mockContext,
            pattern: '/action/passkey-start-authentication',
        } as ActionFunctionArgs;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: true } } } as never);
        mockContext = {} as ActionFunctionArgs['context'];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('throws a 404 Response when the passkey feature is disabled', async () => {
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: false } } } as never);

        await expect(action(createActionArgs())).rejects.toMatchObject({ status: 404 });
        expect(mockStartPasskeyAuthentication).not.toHaveBeenCalled();
    });

    it('rejects non-POST methods', async () => {
        const response = await action(createActionArgs({ method: 'GET' }));

        expect(response.status).toBe(405);
        const body = await response.json();
        expect(body).toEqual({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        });
        expect(mockStartPasskeyAuthentication).not.toHaveBeenCalled();
    });

    it('starts authentication without a userId', async () => {
        mockStartPasskeyAuthentication.mockResolvedValue({ publicKey: { challenge: 'abc' } });

        const response = await action(createActionArgs());

        expect(mockStartPasskeyAuthentication).toHaveBeenCalledWith(mockContext, { userId: undefined });
        const body = await response.json();
        expect(body).toEqual({ success: true, publicKey: { challenge: 'abc' } });
    });

    it('passes a trimmed userId through when provided', async () => {
        mockStartPasskeyAuthentication.mockResolvedValue({ publicKey: { challenge: 'abc' } });

        await action(createActionArgs({ userId: '  shopper@example.com  ' }));

        expect(mockStartPasskeyAuthentication).toHaveBeenCalledWith(mockContext, { userId: 'shopper@example.com' });
    });

    it('starts authentication for a bodyless request with no Content-Type header, matching the discoverable-credential fetch call', async () => {
        mockStartPasskeyAuthentication.mockResolvedValue({ publicKey: { challenge: 'abc' } });

        const request = new Request('http://localhost/action/passkey-start-authentication', { method: 'POST' });
        const response = await action({
            request,
            params: {},
            context: mockContext,
            pattern: '/action/passkey-start-authentication',
        } as ActionFunctionArgs);

        expect(mockStartPasskeyAuthentication).toHaveBeenCalledWith(mockContext, { userId: undefined });
        const body = await response.json();
        expect(body).toEqual({ success: true, publicKey: { challenge: 'abc' } });
    });

    it('bails silently (200 { success: false }, no error) on a 412 throttle, so the client stops without surfacing an error', async () => {
        const apiError = new ApiError({
            status: 412,
            statusText: 'Precondition Failed',
            headers: new Headers(),
            body: { type: '', title: '', detail: '' },
            rawBody: '',
            url: 'https://example.com',
            method: 'POST',
        });
        mockStartPasskeyAuthentication.mockRejectedValue(apiError);

        const response = await action(createActionArgs());

        // 412 is a benign ~1-minute re-attempt throttle (X-RateLimit-1M), not a real failure.
        // We return a plain unsuccessful body — no RATE_LIMITED code, no 429 — matching PWA Kit's
        // silent early-return so the passive conditional-mediation flow shows the shopper nothing.
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ success: false });
    });

    it('returns a generic 500 for other failures', async () => {
        mockStartPasskeyAuthentication.mockRejectedValue(new Error('SLAS unavailable'));

        const response = await action(createActionArgs());

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('OPERATION_FAILED');
    });
});
