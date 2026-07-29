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
import { action } from './action.passkey-finish-registration';
import { finishPasskeyRegistration, getAuth } from '@/middlewares/auth.server';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({ features: { passkey: { enabled: true } } })),
}));
vi.mock('@/middlewares/auth.server', () => ({
    finishPasskeyRegistration: vi.fn(),
    getAuth: vi.fn(),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));

const mockFinishPasskeyRegistration = vi.mocked(finishPasskeyRegistration);
const mockGetAuth = vi.mocked(getAuth);
const mockGetConfig = vi.mocked(getConfig);

describe('action.passkey-finish-registration', () => {
    let mockContext: ActionFunctionArgs['context'];

    const createActionArgs = (body: unknown, { rawBody }: { rawBody?: string } = {}): ActionFunctionArgs =>
        ({
            request: new Request('http://localhost/action/passkey-finish-registration', {
                method: 'POST',
                body: rawBody ?? JSON.stringify(body),
            }),
            params: {},
            context: mockContext,
            pattern: '/action/passkey-finish-registration',
        }) as ActionFunctionArgs;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = {} as ActionFunctionArgs['context'];
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: true } } } as never);
        mockGetAuth.mockReturnValue({ userType: 'registered' } as never);
        mockFinishPasskeyRegistration.mockResolvedValue(undefined as never);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('throws a 404 Response when the passkey feature is disabled', async () => {
        mockGetConfig.mockReturnValue({ features: { passkey: { enabled: false } } } as never);

        await expect(
            action(createActionArgs({ credential: { id: 'cred-id' }, pwdActionToken: 'token' }))
        ).rejects.toMatchObject({ status: 404 });
        expect(mockFinishPasskeyRegistration).not.toHaveBeenCalled();
    });

    it('returns 401 when the shopper is not registered', async () => {
        mockGetAuth.mockReturnValue({ userType: 'guest' } as never);

        const response = await action(createActionArgs({ credential: {}, pwdActionToken: 'token' }));

        expect(response.status).toBe(401);
        expect(mockFinishPasskeyRegistration).not.toHaveBeenCalled();
    });

    it('returns 400 with INVALID_INPUT when the request body is malformed JSON', async () => {
        const response = await action(createActionArgs(undefined, { rawBody: '{not valid json' }));

        expect(response.status).toBe(400);
        const result = await response.json();
        expect(result).toEqual({
            success: false,
            error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' },
        });
        expect(mockFinishPasskeyRegistration).not.toHaveBeenCalled();
    });

    it('returns 400 when credential is missing', async () => {
        const response = await action(createActionArgs({ pwdActionToken: 'token' }));

        expect(response.status).toBe(400);
        const result = await response.json();
        expect(result.error.code).toBe('REQUIRED_FIELD');
        expect(mockFinishPasskeyRegistration).not.toHaveBeenCalled();
    });

    it('returns 400 when pwdActionToken is missing', async () => {
        const response = await action(createActionArgs({ credential: { id: 'cred-id' } }));

        expect(response.status).toBe(400);
        const result = await response.json();
        expect(result.error.code).toBe('REQUIRED_FIELD');
        expect(mockFinishPasskeyRegistration).not.toHaveBeenCalled();
    });

    it('returns success on valid credential and pwdActionToken', async () => {
        const response = await action(createActionArgs({ credential: { id: 'cred-id' }, pwdActionToken: 'token' }));

        expect(mockFinishPasskeyRegistration).toHaveBeenCalledWith(mockContext, {
            credential: { id: 'cred-id' },
            pwdActionToken: 'token',
        });
        const result = await response.json();
        expect(result).toEqual({ success: true });
    });

    it('returns 500 when finishPasskeyRegistration throws', async () => {
        mockFinishPasskeyRegistration.mockRejectedValue(new Error('boom'));

        const response = await action(createActionArgs({ credential: { id: 'cred-id' }, pwdActionToken: 'token' }));

        expect(response.status).toBe(500);
        const result = await response.json();
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('OPERATION_FAILED');
    });
});
