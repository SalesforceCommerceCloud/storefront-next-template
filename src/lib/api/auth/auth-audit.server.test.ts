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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { mockI18nContext } from '@salesforce/storefront-next-runtime/i18n';
import { createInstance } from 'i18next';
import authMiddleware, { getAuth, recoverCompletedLogin } from '@/middlewares/auth.server';
import {
    authStorageContext,
    completedLoginRecoveryContext,
    AUTH_TOKEN_INVALID_ERROR,
    updateStorageAndCache,
} from '@/middlewares/auth.utils';
import { loggerContext } from '@/lib/logger.server';
import { correlationContext } from '@/lib/correlation';
import { performanceTimerContext } from '@/middlewares/performance-metrics';
import { mockConfig, mockSiteObject, mockLocale } from '@/test-utils/config';
import { buildMockAccessToken, buildMockTokenResponse } from '@/test-utils/auth';
import { completeRegisteredLogin } from './complete-registered-login.server';

const { refreshToken, logger } = vi.hoisted(() => ({
    refreshToken: vi.fn(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/api-clients.server', () => ({ createApiClients: () => ({ auth: { refreshToken } }) }));
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
vi.mock('@/extensions/store-locator/lib/store-selection.server', () => ({
    prepareStoreSelectionForLogin: vi.fn(() => Promise.resolve(false)),
    assertStoreSelectionLoginSession: vi.fn(),
    reconcileStoreAfterAuthentication: vi.fn(() => Promise.resolve(undefined)),
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
vi.mock('@/middlewares/auth.utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/middlewares/auth.utils')>();
    return { ...actual, updateStorageAndCache: vi.fn(actual.updateStorageAndCache) };
});

const token = buildMockTokenResponse({ accessToken: { rcid: 'private-customer' } });

beforeEach(() => {
    vi.clearAllMocks();
    refreshToken.mockReset().mockResolvedValue(token);
    vi.stubGlobal('window', undefined);
});
afterEach(() => vi.unstubAllGlobals());

async function withSession(check: (context: RouterContextProvider) => Promise<void>, guard = false) {
    const context = new RouterContextProvider();
    context.set(appConfigContext, mockConfig);
    context.set(siteContext, { site: mockSiteObject, locale: mockLocale } as never);
    mockI18nContext(context, { locale: 'en-US', instance: createInstance() });
    context.set(performanceTimerContext, undefined as never);
    context.set(loggerContext, logger);
    context.set(correlationContext, 'audit-correlation');
    const request = new Request('https://example.com/login', {
        headers: {
            Cookie: `cc-at_${mockSiteObject.id}=${buildMockAccessToken()}${guard ? `; cc-auth-recover_${mockSiteObject.id}=1` : ''}`,
        },
    });
    return authMiddleware({ request, context, params: {}, pattern: '/login', url: new URL(request.url) }, async () => {
        await check(context);
        // The operation assertions check rejection directly; prevent response-side
        // recovery from obscuring them with another attempt after the check returns.
        context.get(authStorageContext).delete('error');
        return new Response('OK');
    });
}

function events(action: string) {
    return logger.warn.mock.calls.filter(([, fields]) => fields?.category === 'auth-audit' && fields.action === action);
}

async function withRegisteredSession(check: (context: RouterContextProvider) => Promise<void>, guard = false) {
    return withSession(async (context) => {
        await completeRegisteredLogin(context, () => Promise.resolve(token));
        await check(context);
    }, guard);
}

function expectEvent(action: string, outcome: string, extra: Record<string, unknown> = {}) {
    expect(events(action)).toHaveLength(1);
    expect(events(action)[0]).toEqual([
        'Auth audit',
        {
            category: 'auth-audit',
            actor: 'registered-shopper',
            action,
            target: 'authenticated-session',
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
            outcome,
            ...extra,
        },
    ]);
    const serialized = JSON.stringify(events(action));
    for (const secret of [
        token.access_token,
        token.refresh_token,
        'private-customer',
        'usid-abc',
        'secret@example.com',
    ]) {
        expect(serialized).not.toContain(secret);
    }
}

async function expectFailedRecovery(context: RouterContextProvider, reason: string, status?: number) {
    await expect(recoverCompletedLogin(context)).rejects.toThrow('Access token is invalid or revoked');
    expectEvent('completed-login-recovery', 'failure', { reason, ...(status ? { status } : {}) });
}

it('audits registered auth publication once, even if the caller fails afterwards', async () => {
    await withSession(async (context) => {
        await completeRegisteredLogin(context, () => Promise.resolve(token));
        expect(getAuth(context).userType).toBe('registered');
        expectEvent('login', 'success');
        await expect(Promise.reject(new Error('basket failed'))).rejects.toThrow('basket failed');
        expectEvent('login', 'success');
    });
});

it('does not audit login success for invalid credentials or a guest result', async () => {
    await withSession(async (context) => {
        await expect(
            completeRegisteredLogin(context, () => Promise.resolve({ ...token, access_token: 'malformed' }))
        ).rejects.toThrow();
        await completeRegisteredLogin(context, () => Promise.resolve(buildMockTokenResponse()));
        expect(events('login')).toHaveLength(0);
    });
});

it('shares one refresh and one successful recovery audit between concurrent callers', async () => {
    let release!: (value: typeof token) => void;
    refreshToken.mockReturnValue(
        new Promise<typeof token>((resolve) => {
            release = resolve;
        })
    );
    await withRegisteredSession(async (context) => {
        const first = recoverCompletedLogin(context);
        const second = recoverCompletedLogin(context);
        await vi.waitFor(() => expect(refreshToken).toHaveBeenCalledTimes(1));
        expect(events('completed-login-recovery')).toHaveLength(0);
        release(token);
        await Promise.all([first, second]);
        expectEvent('completed-login-recovery', 'success');
        expect(getAuth(context).userType).toBe('registered');
    });
});

it('records one safe failure for concurrent refresh rejection without serializing the upstream exception', async () => {
    const error = Object.assign(new Error(`Bearer ${token.access_token} secret@example.com`), {
        status: 401,
        name: 'secret@example.com',
        body: token.refresh_token,
    });
    refreshToken.mockRejectedValue(error);
    await withRegisteredSession(async (context) => {
        const results = await Promise.allSettled([recoverCompletedLogin(context), recoverCompletedLogin(context)]);
        for (const result of results) {
            expect(result.status).toBe('rejected');
            if (result.status === 'rejected') expect(result.reason).toMatchObject({ name: 'AuthTokenInvalidError' });
        }
        expect(context.get(authStorageContext).get('error')).toBe(AUTH_TOKEN_INVALID_ERROR);
        expect(context.get(completedLoginRecoveryContext)?.failed).toBe(true);
        expectEvent('completed-login-recovery', 'failure', { reason: 'refresh-failed' });
        expect(JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls])).not.toContain('secret@example.com');
        expect(refreshToken).toHaveBeenCalledTimes(1);
    });
});

it.each([
    ['malformed', { ...token, access_token: 'malformed' }, 'credential-invalid'],
    ['missing claims', { ...token, access_token: buildMockAccessToken({ isb: '', sub: '' }) }, 'identity-mismatch'],
    ['guest', buildMockTokenResponse(), 'identity-mismatch'],
    ['customer', buildMockTokenResponse({ accessToken: { rcid: 'other' } }), 'identity-mismatch'],
    ['usid', buildMockTokenResponse({ accessToken: { rcid: 'private-customer', usid: 'other' } }), 'identity-mismatch'],
    ['site', buildMockTokenResponse({ accessToken: { rcid: 'private-customer', chid: 'other' } }), 'identity-mismatch'],
] as const)('audits rejected %s credentials without publishing them', async (_label, refreshed, reason) => {
    refreshToken.mockResolvedValue(refreshed);
    await withRegisteredSession(async (context) => {
        await expectFailedRecovery(context, reason);
        expect(context.get(authStorageContext).get('accessToken')).toBeUndefined();
    });
});

it.each([
    ['audits a missing refresh token without sending a refresh', 'refresh-token-missing'],
    ['audits credential publication failure with a fixed reason', 'credential-publication-failed'],
    ['includes an HTTP status without logging the response body', 'refresh-failed'],
] as const)('%s', async (_title, reason) => {
    await withRegisteredSession(async (context) => {
        if (reason === 'refresh-token-missing') context.get(authStorageContext).delete('refreshToken');
        if (reason === 'credential-publication-failed')
            vi.mocked(updateStorageAndCache).mockRejectedValueOnce(new Error('secret@example.com'));
        if (reason === 'refresh-failed')
            refreshToken.mockRejectedValue(new Response('secret@example.com', { status: 503 }));
        await expectFailedRecovery(context, reason, reason === 'refresh-failed' ? 503 : undefined);
        if (reason === 'refresh-token-missing') expect(refreshToken).not.toHaveBeenCalled();
    });
});

it('emits correlation with audit metadata through the production-default fallback logger', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MRT_LOG_LEVEL', '3');
    try {
        await withSession(async (context) => {
            context.set(loggerContext, null);
            await completeRegisteredLogin(context, () => Promise.resolve(token));
        });
        const audit = warn.mock.calls.find(([message]) => message === 'WARN Auth audit');
        expect(audit).toBeDefined();
        expect(JSON.parse(audit?.[1] as string)).toMatchObject({
            correlationId: 'audit-correlation',
            action: 'login',
            outcome: 'success',
        });
    } finally {
        warn.mockRestore();
        vi.unstubAllEnvs();
    }
});

it.each([false, true])('audits denied recovery with missing context %s', async (missing) => {
    await withRegisteredSession(async (context) => {
        if (missing) context.set(completedLoginRecoveryContext, null);
        await expect(recoverCompletedLogin(context)).rejects.toThrow();
        expectEvent('completed-login-recovery', 'denied', {
            actor: missing ? 'unknown' : 'registered-shopper',
            reason: missing ? 'completion-context-missing' : 'recovery-guard',
        });
        expect(refreshToken).not.toHaveBeenCalled();
    }, true);
});
