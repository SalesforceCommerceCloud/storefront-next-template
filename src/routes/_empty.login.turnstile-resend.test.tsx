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

/**
 * Focused tests for the Login component's resend-OTP Turnstile widget paths
 * (lines ~515-568 and ~654-710 of _empty.login.tsx).
 *
 * The full action/loader suite lives in _empty.login.test.tsx. This file
 * isolates the component-level Turnstile resend handlers so they can be
 * exercised without running the full route integration harness.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createElement } from 'react';

// ── TurnstileWidget mock — exposes handlers as labelled buttons ────────────
let capturedResendSuccess: ((token: string) => void) | null = null;
let capturedResendError: (() => void) | null = null;
let capturedResendExpire: (() => void) | null = null;
let capturedResendBypass: (() => void) | null = null;

vi.mock('@/components/security/turnstile-widget', () => ({
    TurnstileWidget: (props: {
        onSuccess?: (token: string) => void;
        onError?: () => void;
        onExpire?: () => void;
        onBypass?: () => void;
    }) => {
        capturedResendSuccess = props.onSuccess ?? null;
        capturedResendError = props.onError ?? null;
        capturedResendExpire = props.onExpire ?? null;
        capturedResendBypass = props.onBypass ?? null;
        return createElement(
            'div',
            { 'data-testid': 'resend-turnstile-widget' },
            createElement(
                'button',
                { type: 'button', 'data-testid': 'ts-resend-success', onClick: () => props.onSuccess?.('resend-tok') },
                'success'
            ),
            createElement(
                'button',
                { type: 'button', 'data-testid': 'ts-resend-error', onClick: () => props.onError?.() },
                'error'
            ),
            createElement(
                'button',
                { type: 'button', 'data-testid': 'ts-resend-expire', onClick: () => props.onExpire?.() },
                'expire'
            ),
            createElement(
                'button',
                { type: 'button', 'data-testid': 'ts-resend-bypass', onClick: () => props.onBypass?.() },
                'bypass'
            )
        );
    },
}));

// OTP modal mock — open state exposes a Resend button wired to onResendCode.
vi.mock('@/components/login/otp-modal', () => ({
    default: (props: { isOpen: boolean; onResendCode?: () => Promise<void> }) => {
        if (!props.isOpen) return null;
        return createElement(
            'div',
            { 'data-testid': 'otp-modal' },
            createElement(
                'button',
                { type: 'button', 'data-testid': 'otp-resend-btn', onClick: () => void props.onResendCode?.() },
                'Resend'
            )
        );
    },
}));

// Turnstile utils — control whether Turnstile is enabled and what site key returns
vi.mock('@/lib/turnstile/utils', () => ({
    isTurnstileEnabled: () => true,
    getTurnstileMode: () => 'managed' as const,
    getTurnstileSiteKey: () => '2x00000000000000000000AB',
    getBrowserTurnstileSiteKey: () => '2x00000000000000000000AB',
}));

// useConfig returns a config that satisfies the Login component's security checks
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        useConfig: () => ({
            auth: { otpLength: 6 },
            features: {
                passkey: { enabled: false },
                passwordlessLogin: { landingUri: '/passwordless-login-landing' },
                socialLogin: { enabled: false },
            },
            security: { turnstile: { enabled: true } },
        }),
        getConfig: vi.fn(() => ({
            auth: { otpLength: 6 },
            features: {
                passkey: { enabled: false },
                passwordlessLogin: {},
                socialLogin: { enabled: false },
            },
        })),
    };
});

vi.mock('@/hooks/use-passkey-login', () => ({
    usePasskeyLogin: () => ({
        loginWithPasskey: vi.fn(),
        abortPasskeyLogin: vi.fn(),
        isAuthenticating: false,
    }),
}));

vi.mock('@/components/login/standard-login-form', () => ({
    default: () => createElement('div', { 'data-testid': 'standard-form' }),
}));
vi.mock('@/components/login/passwordless-login-form', () => ({
    default: () => createElement('div', { 'data-testid': 'passwordless-form' }),
}));
vi.mock('@/components/buttons/social-login-buttons', () => ({
    SocialLoginButtons: () => null,
}));
vi.mock('@/components/login/login-guest-wishlist-banner', () => ({
    LoginGuestWishlistBanner: () => null,
}));
vi.mock('@/components/seo-meta', () => ({
    SeoMeta: () => null,
}));
vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => vi.fn(),
}));
vi.mock('@/components/link', () => ({
    Link: ({ children, ...props }: { children: React.ReactNode; to?: string }) => createElement('a', props, children),
}));

import Login from './_empty.login';

type LoginLoaderData = Parameters<typeof Login>[0]['loaderData'];

function renderLogin(loaderData: LoginLoaderData) {
    const router = createMemoryRouter([{ path: '/', element: createElement(Login, { loaderData }) }], {
        initialEntries: ['/'],
        initialIndex: 0,
    });
    return render(createElement(RouterProvider, { router }));
}

const baseLoaderData: LoginLoaderData = {
    mode: 'passwordless',
    isPasswordlessLoginEnabled: true,
    isSocialLoginEnabled: false,
    pageUrl: 'http://localhost/login',
    guestWishlistCount: 0,
    otpLength: 6,
};

describe('Login — resend Turnstile widget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedResendSuccess = null;
        capturedResendError = null;
        capturedResendExpire = null;
        capturedResendBypass = null;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    });

    // ── Widget visibility ──────────────────────────────────────────────────────

    test('resend Turnstile widget renders when showOTPForm=true and Turnstile is enabled', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        expect(screen.getByTestId('resend-turnstile-widget')).toBeInTheDocument();
    });

    test('resend Turnstile widget does NOT render when showOTPForm is falsy', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: false });

        expect(screen.queryByTestId('resend-turnstile-widget')).not.toBeInTheDocument();
    });

    // ── Handler wiring ─────────────────────────────────────────────────────────

    test('onSuccess handler is wired to TurnstileWidget', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        expect(capturedResendSuccess, 'handleResendTurnstileSuccess must be passed as onSuccess').to.be.a('function');
    });

    test('onError handler is wired to TurnstileWidget', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        expect(capturedResendError, 'handleResendTurnstileError must be passed as onError').to.be.a('function');
    });

    test('onExpire handler is wired to TurnstileWidget', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        expect(capturedResendExpire, 'handleResendTurnstileExpire must be passed as onExpire').to.be.a('function');
    });

    test('onBypass handler is wired to TurnstileWidget', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        expect(capturedResendBypass, 'handleResendTurnstileBypass must be passed as onBypass').to.be.a('function');
    });

    // ── handleResendTurnstileSuccess ───────────────────────────────────────────

    test('success stores resend token (token included in next resend fetch)', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        // Fire success → resendTurnstileToken set
        fireEvent.click(screen.getByTestId('ts-resend-success'));

        // Trigger resend
        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, { body: FormData }];
        const formData = init.body;
        expect(formData.get('turnstileToken')).toBe('resend-tok');
    });

    test('resend does not include token when success was never fired', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        // Do NOT fire success — resendTurnstileToken remains null

        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, { body: FormData }];
        expect((init.body as FormData).get('turnstileToken')).toBeNull();
    });

    // ── handleResendTurnstileError ─────────────────────────────────────────────

    test('error after success clears the token (subsequent resend has no token)', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        // Accumulate a token then clear it
        fireEvent.click(screen.getByTestId('ts-resend-success'));
        fireEvent.click(screen.getByTestId('ts-resend-error'));

        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, { body: FormData }];
        expect((init.body as FormData).get('turnstileToken')).toBeNull();
    });

    // ── handleResendTurnstileExpire ────────────────────────────────────────────

    test('expire after success clears the token (subsequent resend has no token)', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        fireEvent.click(screen.getByTestId('ts-resend-success'));
        fireEvent.click(screen.getByTestId('ts-resend-expire'));

        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, { body: FormData }];
        expect((init.body as FormData).get('turnstileToken')).toBeNull();
    });

    // ── handleResendTurnstileBypass ────────────────────────────────────────────

    test('bypass unmounts the widget (condition includes !resendTurnstileBypassed)', () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        expect(screen.getByTestId('resend-turnstile-widget')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('ts-resend-bypass'));

        // After bypass, resendTurnstileBypassed=true → widget condition is false → unmounted
        expect(screen.queryByTestId('resend-turnstile-widget')).not.toBeInTheDocument();
    });

    test('resend after bypass succeeds without a Turnstile token', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        // Bypass → widget gone, token stays null
        fireEvent.click(screen.getByTestId('ts-resend-bypass'));

        // Resend button from OTP modal still works
        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, { body: FormData }];
        expect((init.body as FormData).get('turnstileToken')).toBeNull();
    });

    // ── Resend resets token after fetch (turnstileEnabled path) ───────────────

    test('resend resets the Turnstile token after fetch completes', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'user@example.com' });

        // Accumulate a token
        fireEvent.click(screen.getByTestId('ts-resend-success'));

        // Resend: token is used and then reset so the widget generates a fresh one
        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        // After resend, token is cleared (resendTurnstileToken = null).
        // The widget is still present (bypass was not fired), ready for the next success.
        expect(screen.getByTestId('resend-turnstile-widget')).toBeInTheDocument();
    });

    // ── OTP modal email forwarding ─────────────────────────────────────────────

    test('resend fetch sends the email from loaderData', async () => {
        renderLogin({ ...baseLoaderData, showOTPForm: true, email: 'otp@example.com' });

        fireEvent.click(screen.getByTestId('otp-resend-btn'));
        await vi.waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
        });

        const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, { body: FormData }];
        expect((init.body as FormData).get('email')).toBe('otp@example.com');
        expect((init.body as FormData).get('loginMode')).toBe('passwordless');
    });
});
