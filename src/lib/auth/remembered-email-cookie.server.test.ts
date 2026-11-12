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
import type { RouterContextProvider } from 'react-router';

// Mirror createCookie's contract (site-namespaced name, raw values) without site/config context
vi.mock('@/lib/cookie-utils.server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/cookie-utils.server')>();
    return {
        ...actual,
        getCookieConfig: vi.fn((options: object) => ({ path: '/', ...options })),
        createCookie: vi.fn((name: string, defaults: Record<string, unknown>) => ({
            parse: (header: string | null) => Promise.resolve(actual.parseAllCookies(header)[`${name}_Site`] ?? null),
            serialize: (value: string, config: Record<string, unknown> = {}) => {
                const merged = { ...defaults, ...config };
                const parts = [`${name}_Site=${value}`, `Max-Age=${String(merged.maxAge)}`];
                if (merged.httpOnly) parts.push('HttpOnly');
                return Promise.resolve(parts.join('; '));
            },
        })),
    };
});

import {
    clearPasswordlessEmailCookie,
    clearPasswordResetEmailCookie,
    readPasswordlessEmailCookie,
    readPasswordResetEmailCookie,
    REMEMBERED_EMAIL_MAX_AGE,
    serializePasswordlessEmailCookie,
    serializePasswordResetEmailCookie,
} from './remembered-email-cookie.server';

const context = {} as Readonly<RouterContextProvider>;
const requestWithCookie = (cookie?: string) =>
    new Request('http://localhost/login', cookie ? { headers: { Cookie: cookie } } : undefined);

describe('passwordless email cookie', () => {
    it('serializes an encoded, HttpOnly, short-lived cookie', async () => {
        const setCookie = await serializePasswordlessEmailCookie(context, 'Shopper+Tag@example.com');

        expect(setCookie).toContain('cc-pwdless-email_Site=Shopper%2BTag%40example.com');
        expect(setCookie).toContain(`Max-Age=${REMEMBERED_EMAIL_MAX_AGE}`);
        expect(setCookie).toContain('HttpOnly');
    });

    it('round-trips the exact email', async () => {
        const setCookie = await serializePasswordlessEmailCookie(context, 'Shopper+Tag@example.com');
        const cookie = setCookie.split(';')[0];

        await expect(readPasswordlessEmailCookie(requestWithCookie(cookie), context)).resolves.toBe(
            'Shopper+Tag@example.com'
        );
    });

    it('returns undefined when the cookie is missing or malformed', async () => {
        await expect(readPasswordlessEmailCookie(requestWithCookie(), context)).resolves.toBeUndefined();
        await expect(
            readPasswordlessEmailCookie(requestWithCookie('cc-pwdless-email_Site=%E0%A4%A'), context)
        ).resolves.toBeUndefined();
    });

    it('clears the cookie with an empty value and Max-Age=0', async () => {
        const setCookie = await clearPasswordlessEmailCookie(context);

        expect(setCookie).toContain('cc-pwdless-email_Site=;');
        expect(setCookie).toContain('Max-Age=0');
    });
});

describe('password reset email cookie', () => {
    it('uses its own cookie so it never collides with the passwordless email', async () => {
        const setCookie = await serializePasswordResetEmailCookie(context, 'Shopper+Tag@example.com');
        const cookie = setCookie.split(';')[0];

        expect(cookie).toBe('cc-pwreset-email_Site=Shopper%2BTag%40example.com');
        expect(setCookie).toContain('HttpOnly');
        await expect(readPasswordResetEmailCookie(requestWithCookie(cookie), context)).resolves.toBe(
            'Shopper+Tag@example.com'
        );
        await expect(readPasswordlessEmailCookie(requestWithCookie(cookie), context)).resolves.toBeUndefined();
    });

    it('clears the cookie with an empty value and Max-Age=0', async () => {
        const setCookie = await clearPasswordResetEmailCookie(context);

        expect(setCookie).toContain('cc-pwreset-email_Site=;');
        expect(setCookie).toContain('Max-Age=0');
    });
});
