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
import { action } from './action.request-password-reset';
import { getPasswordResetToken } from '@/middlewares/auth.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';

vi.mock('@/middlewares/auth.server');
vi.mock('@salesforce/storefront-next-runtime/i18n');
vi.mock('@/lib/logger.server');
vi.mock('@/lib/auth/remembered-email-cookie.server', () => ({
    serializePasswordResetEmailCookie: vi.fn((_context: unknown, email: string) =>
        Promise.resolve(`cc-pwreset-email_Site=${encodeURIComponent(email)}; HttpOnly`)
    ),
}));

describe('action.request-password-reset', () => {
    const mockContext = {} as any;
    const mockT = vi.fn((key: string) => key);
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getTranslation).mockReturnValue({ t: mockT } as any);
        vi.mocked(getLogger).mockReturnValue(mockLogger as any);
    });

    it('returns error when email is missing', async () => {
        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({}),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ error: 'resetPassword:emailRequired' });
        expect(mockT).toHaveBeenCalledWith('resetPassword:emailRequired');
    });

    it('returns success when password reset token is sent successfully', async () => {
        vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: 'test@example.com' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ success: true });
        expect(getPasswordResetToken).toHaveBeenCalledWith(mockContext, {
            email: 'test@example.com',
        });
        // The logged email is redacted (hashed local part)
        expect(mockLogger.info).toHaveBeenCalledWith('RequestPasswordReset: reset token sent', {
            email: expect.stringMatching(/^[0-9a-f]{8}@example\.com$/),
        });
        expect(result.headers.get('Set-Cookie')).toBe('cc-pwreset-email_Site=test%40example.com; HttpOnly');
    });

    it('returns error when password reset token fails', async () => {
        const error = new Error('API Error');
        vi.mocked(getPasswordResetToken).mockRejectedValueOnce(error);

        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: 'test@example.com' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toHaveProperty('error');
        expect(mockLogger.error).toHaveBeenCalledWith('RequestPasswordReset: failed', {
            error,
            email: expect.stringMatching(/^[0-9a-f]{8}@example\.com$/),
        });
    });

    it('handles network errors gracefully', async () => {
        const networkError = new Error('Network timeout');
        vi.mocked(getPasswordResetToken).mockRejectedValueOnce(networkError);

        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: 'user@example.com' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toHaveProperty('error');
        expect(mockLogger.error).toHaveBeenCalled();
    });

    it('handles empty email string', async () => {
        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: '' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ error: 'resetPassword:emailRequired' });
    });

    it('trims and validates email', async () => {
        vi.mocked(getPasswordResetToken).mockResolvedValueOnce(undefined as any);

        const request = new Request('http://localhost/action/request-password-reset', {
            method: 'POST',
            body: new URLSearchParams({ email: '  test@example.com  ' }),
        });

        const result = await action({ request, context: mockContext, params: {} } as any);

        expect(result).toBeInstanceOf(Response);
        const data = await result.json();
        expect(data).toEqual({ success: true });
        expect(getPasswordResetToken).toHaveBeenCalledWith(mockContext, {
            email: '  test@example.com  ',
        });
    });
});
