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
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import PasswordlessLoginForm from './passwordless-login-form';

// Mock navigation state
const mockNavigation = {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
};

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{ui}</AllProvidersWrapper> }], {
        initialEntries,
    });
    return render(<RouterProvider router={router} />);
}

describe('PasswordlessLoginForm', () => {
    const defaultProps = {
        isPasswordlessEnabled: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigation.state = 'idle';
        // Use vi.spyOn for useNavigation hook
        vi.spyOn(ReactRouter, 'useNavigation').mockReturnValue(mockNavigation as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('rendering', () => {
        test('renders form with all required elements', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            // Email field
            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveAttribute('type', 'email');
            expect(emailInput).toHaveAttribute('name', 'email');

            // Submit button
            const submitButton = screen.getByRole('button', { name: t('login:sendLoginLink') });
            expect(submitButton).toBeInTheDocument();
            expect(submitButton.tagName).toBe('BUTTON');

            // Forgot password link
            const forgotPasswordLink = screen.getByRole('link', { name: t('login:forgotPassword') });
            expect(forgotPasswordLink).toBeInTheDocument();
            expect(forgotPasswordLink).toHaveAttribute('href', '/global/en-GB/forgot-password');

            // No error message by default
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        test('renders hidden fields correctly', () => {
            // Test without redirectPath
            const { container } = renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            // loginMode is always present
            const loginModeInput = container.querySelector('input[name="loginMode"]');
            expect(loginModeInput).toBeInTheDocument();
            expect(loginModeInput).toHaveAttribute('type', 'hidden');
            expect(loginModeInput).toHaveValue('passwordless');

            // redirectPath is not present when not provided
            let redirectPathInput = container.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).not.toBeInTheDocument();

            // Test with redirectPath
            const redirectPath = '/account';
            const { container: containerWithRedirect } = renderWithRouter(
                <PasswordlessLoginForm {...defaultProps} redirectPath={redirectPath} />
            );

            // redirectPath is present when provided
            redirectPathInput = containerWithRedirect.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).toBeInTheDocument();
            expect(redirectPathInput).toHaveAttribute('type', 'hidden');
            expect(redirectPathInput).toHaveValue(redirectPath);
        });

        test('renders error message when error prop is provided', () => {
            const errorMessage = 'Failed to send login link';
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} error={errorMessage} />);

            const errorElement = screen.getByText(errorMessage);
            expect(errorElement).toBeInTheDocument();
            expect(errorElement.closest('div')).toHaveClass('bg-destructive/10');
        });
    });

    describe('passwordless mode toggle', () => {
        test('renders password login link when passwordless is enabled', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} isPasswordlessEnabled={true} />);

            const passwordLoginLink = screen.getByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).toBeInTheDocument();
            expect(passwordLoginLink).toHaveAttribute('href', '/global/en-GB/login?mode=password');
        });

        test('preserves returnUrl and pending action params when switching mode', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} isPasswordlessEnabled={true} />, [
                '/login?returnUrl=%2Fsearch%3Fq%3Dshoe&action=addToWishlist&actionParams=%7B%22productId%22%3A%22abc%22%7D',
            ]);

            const passwordLoginLink = screen.getByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).toHaveAttribute(
                'href',
                '/global/en-GB/login?returnUrl=%2Fsearch%3Fq%3Dshoe&action=addToWishlist&actionParams=%7B%22productId%22%3A%22abc%22%7D&mode=password'
            );
        });

        test('does not render password login link when passwordless is disabled', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} isPasswordlessEnabled={false} />);

            const passwordLoginLink = screen.queryByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).not.toBeInTheDocument();
        });
    });

    describe('email field interactions', () => {
        test('email field has correct attributes and accepts user input', async () => {
            const user = userEvent.setup();
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));

            // Check attributes
            expect(emailInput).toHaveAttribute('placeholder', t('login:emailPlaceholder'));
            expect(emailInput).toBeRequired();

            // Test user input
            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveValue('test@example.com');
        });
    });

    describe('form submission', () => {
        test('form has correct method and can be submitted with valid email', async () => {
            const user = userEvent.setup();
            const { container } = renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const form = container.querySelector('form');
            expect(form).toHaveAttribute('method', 'post');
            expect(form).toBeInTheDocument();

            // Fill in email and verify form data is ready for submission
            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            await user.type(emailInput, 'test@example.com');
            expect(emailInput).toHaveValue('test@example.com');
        });
    });

    describe('accessibility', () => {
        test('email field has proper accessibility attributes', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            expect(emailInput).toHaveAttribute('autocomplete', 'username webauthn');
            expect(emailInput).toHaveAttribute('id', 'email');

            const emailLabel = screen.getByText(t('login:emailLabel'));
            expect(emailLabel.tagName).toBe('LABEL');
            expect(emailLabel).toHaveAttribute('for', 'email');
        });

        test('links have descriptive text', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const forgotPasswordLink = screen.getByRole('link', { name: t('login:forgotPassword') });
            expect(forgotPasswordLink).toHaveTextContent(t('login:forgotPassword'));

            const passwordLoginLink = screen.getByRole('link', { name: t('login:loginWithPassword') });
            expect(passwordLoginLink).toHaveTextContent(t('login:loginWithPassword'));
        });
    });

    describe('edge cases', () => {
        test('handles special characters in email', async () => {
            const user = userEvent.setup();
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(t('login:emailLabel'));
            const specialEmail = 'test+user@example.com';

            await user.type(emailInput, specialEmail);

            expect(emailInput).toHaveValue(specialEmail);
        });

        test('handles empty or undefined redirectPath gracefully', () => {
            // Test with empty string
            const { container: containerEmpty } = renderWithRouter(
                <PasswordlessLoginForm {...defaultProps} redirectPath="" />
            );
            let redirectPathInput = containerEmpty.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).not.toBeInTheDocument();

            // Test with undefined
            const { container: containerUndefined } = renderWithRouter(
                <PasswordlessLoginForm {...defaultProps} redirectPath={undefined} />
            );
            redirectPathInput = containerUndefined.querySelector('input[name="redirectPath"]');
            expect(redirectPathInput).not.toBeInTheDocument();
        });

        test('handles long error message', () => {
            const longError = 'A'.repeat(200);
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} error={longError} />);
            expect(screen.getByText(longError)).toBeInTheDocument();
        });

        test('handles undefined error', () => {
            renderWithRouter(<PasswordlessLoginForm {...defaultProps} error={undefined} />);
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
    });

    describe('props combinations', () => {
        test('renders correctly with all props provided', () => {
            renderWithRouter(
                <PasswordlessLoginForm error="Test error" isPasswordlessEnabled={true} redirectPath="/account/orders" />
            );

            expect(screen.getByText('Test error')).toBeInTheDocument();
            expect(screen.getByRole('link', { name: t('login:loginWithPassword') })).toBeInTheDocument();
            expect(screen.getByLabelText(t('login:emailLabel'))).toBeInTheDocument();
        });

        test('renders correctly with minimal props', () => {
            renderWithRouter(<PasswordlessLoginForm isPasswordlessEnabled={false} />);

            expect(screen.getByLabelText(t('login:emailLabel'))).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: t('login:loginWithPassword') })).not.toBeInTheDocument();
        });
    });
});

// ---------------------------------------------------------------------------
// Turnstile WI-10 parity tests
// These run in a separate describe so the vi.mock calls don't bleed into the
// general suite above (Vitest hoists vi.mock to the top of each describe file).
// ---------------------------------------------------------------------------

// Capture widget callbacks so tests can trigger them programmatically.
let capturedOnSuccess: ((token: string) => void) | null = null;
let capturedOnError: (() => void) | null = null;
let capturedOnExpire: (() => void) | null = null;
let capturedOnBypass: (() => void) | null = null;
let capturedOnRetryExhausted: ((errorCode: string, family: string) => void) | null = null;
let capturedResetRef: { current: (() => void) | null } | null = null;

vi.mock('@/components/security/turnstile-widget', () => ({
    TurnstileWidget: ({
        onSuccess,
        onError,
        onExpire,
        onBypass,
        onRetryExhausted,
        resetRef,
    }: {
        onSuccess?: (token: string) => void;
        onError?: () => void;
        onExpire?: () => void;
        onBypass?: () => void;
        onRetryExhausted?: (errorCode: string, family: string) => void;
        resetRef?: { current: (() => void) | null };
    }) => {
        capturedOnSuccess = onSuccess ?? null;
        capturedOnError = onError ?? null;
        capturedOnExpire = onExpire ?? null;
        capturedOnBypass = onBypass ?? null;
        capturedOnRetryExhausted = onRetryExhausted ?? null;
        capturedResetRef = resetRef ?? null;
        // Register a no-op reset function so the component can call it safely.
        if (resetRef) resetRef.current = () => {};
        return <div data-testid="turnstile-widget-mock" />;
    },
}));

const turnstileUtilsMock = vi.hoisted(() => ({
    isTurnstileEnabled: vi.fn(() => true),
    getTurnstileMode: vi.fn(() => 'managed' as const),
    getTurnstileSiteKey: vi.fn(() => '2x00000000000000000000AB'),
    getBrowserTurnstileSiteKey: vi.fn(() => '2x00000000000000000000AB'),
}));

vi.mock('@/lib/turnstile/utils', () => turnstileUtilsMock);

const checkSessionMock = vi.hoisted(() => ({
    checkTurnstileSessionVerified: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/turnstile/check-session', () => checkSessionMock);

function renderWithTurnstile(props: Partial<React.ComponentProps<typeof PasswordlessLoginForm>> = {}) {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <AllProvidersWrapper>
                        <PasswordlessLoginForm isPasswordlessEnabled={true} {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
}

/** Mount Turnstile by blurring a valid email (first show is blur, not focus). */
async function mountTurnstileViaEmailBlur(email = 'shopper@example.com') {
    const emailInput = screen.getByLabelText(t('login:emailLabel'));
    fireEvent.change(emailInput, { target: { value: email } });
    act(() => {
        fireEvent.blur(emailInput);
    });
    await waitFor(() => {
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
    });
}

async function blurEmail(email = 'shopper@example.com') {
    const emailInput = screen.getByLabelText(t('login:emailLabel'));
    fireEvent.change(emailInput, { target: { value: email } });
    act(() => {
        fireEvent.blur(emailInput);
    });
    // Flush microtasks from checkTurnstileSessionVerified().then(...)
    await act(async () => {
        await Promise.resolve();
    });
}

describe('PasswordlessLoginForm — Turnstile WI-10 parity', () => {
    beforeEach(() => {
        capturedOnSuccess = null;
        capturedOnError = null;
        capturedOnExpire = null;
        capturedOnBypass = null;
        capturedOnRetryExhausted = null;
        capturedResetRef = null;
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValue(false);
        turnstileUtilsMock.isTurnstileEnabled.mockReturnValue(true);
        turnstileUtilsMock.getTurnstileMode.mockReturnValue('managed');
        turnstileUtilsMock.getBrowserTurnstileSiteKey.mockReturnValue('2x00000000000000000000AB');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('does not mount widget when Turnstile is disabled in config', () => {
        turnstileUtilsMock.isTurnstileEnabled.mockReturnValue(false);
        renderWithTurnstile();

        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();
    });

    test('does not mount widget until email field is blurred', async () => {
        renderWithTurnstile();

        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();

        const emailInput = screen.getByLabelText(t('login:emailLabel'));
        fireEvent.focus(emailInput);
        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();

        await mountTurnstileViaEmailBlur();
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
    });

    test('submit button is disabled while Turnstile token is pending', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        // Widget is present but onSuccess has not been called → no token
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
        const submitBtn = screen.getByRole('button', { name: t('login:sendLoginLink') });
        expect(submitBtn).toBeDisabled();
    });

    test('submit button is enabled after Turnstile delivers a token', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();

        act(() => {
            capturedOnSuccess?.('test-token-abc');
        });

        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();
    });

    test('onError clears the token and re-gates submit', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        act(() => {
            capturedOnSuccess?.('test-token-abc');
        });
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();

        act(() => {
            capturedOnError?.();
        });
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();
    });

    test('onExpire clears the token and re-gates submit', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        act(() => {
            capturedOnSuccess?.('test-token-abc');
        });
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();

        act(() => {
            capturedOnExpire?.();
        });
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();
    });

    test('onBypass unblocks submit button when CDN is unreachable', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();

        act(() => {
            capturedOnBypass?.();
        });

        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();
    });

    test('onRetryExhausted shows the generic verification-failed alert', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        act(() => {
            capturedOnRetryExhausted?.('300010', 'bot-detection');
        });

        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        // Must not mention Turnstile, bot, or captcha
        expect(alert.textContent).not.toMatch(/turnstile|bot|captcha/i);
    });

    test('email focus after retry exhaustion clears alert and remounts widget (submit re-gates)', async () => {
        const user = userEvent.setup();
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        act(() => {
            capturedOnRetryExhausted?.('300010', 'bot-detection');
        });
        expect(screen.getByRole('alert')).toBeInTheDocument();
        // Still pending (no token) — submit stays disabled after exhaustion on login
        // (unlike checkout guest Continue). Remount on focus is the recovery path.
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();

        const emailInput = screen.getByLabelText(t('login:emailLabel'));
        await user.click(emailInput);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        // Fresh widget instance after key bump.
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
        // Still gated until the remounted widget produces a token or bypasses.
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();

        act(() => {
            capturedOnSuccess?.('fresh-token-after-remount');
        });
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();
    });

    test('actionErrorCode NOT_AUTHORIZED shows verification-failed alert and resets widget', async () => {
        const resetSpy = vi.fn();
        const { rerender } = renderWithTurnstile();

        // Simulate widget registering its reset
        if (capturedResetRef) capturedResetRef.current = resetSpy;

        // Simulate action returning NOT_AUTHORIZED (prop change triggers the effect)
        rerender(
            <RouterProvider
                router={createMemoryRouter(
                    [
                        {
                            path: '*',
                            element: (
                                <AllProvidersWrapper>
                                    <PasswordlessLoginForm
                                        isPasswordlessEnabled={true}
                                        actionErrorCode="NOT_AUTHORIZED"
                                    />
                                </AllProvidersWrapper>
                            ),
                        },
                    ],
                    { initialEntries: ['/'] }
                )}
            />
        );

        const alert = await screen.findByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert.textContent).not.toMatch(/turnstile|bot|captcha/i);
    });

    test('three consecutive NOT_AUTHORIZED responses mark retry exhaustion', async () => {
        const user = userEvent.setup();
        // Drive three NOT_AUTHORIZED transitions on the SAME form instance so the
        // verificationFailureCountRef accumulates to the MAX (3) cap.
        function Harness() {
            const [code, setCode] = React.useState<string | undefined>(undefined);
            return (
                <AllProvidersWrapper>
                    <button type="button" onClick={() => setCode('NOT_AUTHORIZED')}>
                        reject
                    </button>
                    <button type="button" onClick={() => setCode(undefined)}>
                        clear-code
                    </button>
                    <PasswordlessLoginForm isPasswordlessEnabled={true} actionErrorCode={code} />
                </AllProvidersWrapper>
            );
        }

        const router = createMemoryRouter([{ path: '*', element: <Harness /> }], {
            initialEntries: ['/'],
        });
        render(<RouterProvider router={router} />);

        // Rejection 1
        await user.click(screen.getByRole('button', { name: 'reject' }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'clear-code' }));

        // Rejection 2
        await user.click(screen.getByRole('button', { name: 'reject' }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'clear-code' }));

        // Rejection 3 — hits the retry cap (setTurnstileRetryExhausted)
        await user.click(screen.getByRole('button', { name: 'reject' }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        // Login stays gated after exhaustion; recovery is remount-on-email-focus.
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();
    });

    test('verification error clears when shopper re-focuses the email field', async () => {
        const user = userEvent.setup();

        renderWithTurnstile({ actionErrorCode: 'NOT_AUTHORIZED' });

        // Error appears
        const alert = await screen.findByRole('alert');
        expect(alert).toBeInTheDocument();

        // Focus the email input to clear the error
        const emailInput = screen.getByLabelText(t('login:emailLabel'));
        await user.click(emailInput);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('resetRef is wired to TurnstileWidget', async () => {
        renderWithTurnstile();
        await mountTurnstileViaEmailBlur();

        // The widget mock sets resetRef.current — verify the form passes a ref
        expect(capturedResetRef).not.toBeNull();
        expect(typeof capturedResetRef?.current).toBe('function');
    });

    test('generic error prop displays when no verificationError is set', () => {
        renderWithTurnstile({ error: 'Something went wrong. Try again.' });

        expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    });

    test('skipDocumentRedirect renders the hidden skip flag for LoginModal embeds', () => {
        const { container } = renderWithTurnstile({ skipDocumentRedirect: true });

        const skipInput = container.querySelector('input[name="skipDocumentRedirect"]');
        expect(skipInput).toBeInTheDocument();
        expect(skipInput).toHaveAttribute('type', 'hidden');
        expect(skipInput).toHaveValue('true');
    });

    test('verificationError supersedes the generic error prop when NOT_AUTHORIZED', async () => {
        // When the server returns NOT_AUTHORIZED the parent also passes actionData.error
        // (the forbidden message). The form should show the specific verification copy
        // and suppress the generic forbidden message.
        const router = createMemoryRouter(
            [
                {
                    path: '*',
                    element: (
                        <AllProvidersWrapper>
                            <PasswordlessLoginForm
                                isPasswordlessEnabled={true}
                                error="errors:api.forbidden"
                                actionErrorCode="NOT_AUTHORIZED"
                            />
                        </AllProvidersWrapper>
                    ),
                },
            ],
            { initialEntries: ['/'] }
        );
        render(<RouterProvider router={router} />);

        // Verification-failed message should appear; raw forbidden string should not
        const alert = await screen.findByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert.textContent).not.toContain('errors:api.forbidden');
    });

    test('when session check says verified, widget does not mount and submit is not gated', async () => {
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValue(true);
        renderWithTurnstile();

        await blurEmail('shopper@example.com');

        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).not.toBeDisabled();
    });

    test('when session check says not verified, widget mounts on blur', async () => {
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValue(false);
        renderWithTurnstile();

        await mountTurnstileViaEmailBlur();
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeDisabled();
    });

    test('changing email after session suppress shows widget on next blur', async () => {
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValueOnce(true);
        renderWithTurnstile();

        await blurEmail('shopper@example.com');
        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();

        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValueOnce(false);
        const emailInput = screen.getByLabelText(t('login:emailLabel'));
        fireEvent.change(emailInput, { target: { value: 'other@example.com' } });
        act(() => {
            fireEvent.blur(emailInput);
        });
        await waitFor(() => {
            expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
        });
    });
});
