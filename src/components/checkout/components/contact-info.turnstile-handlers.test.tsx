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
 * Covers all Turnstile handler callbacks wired through ContactInfo:
 *   handleTurnstileSuccess, handleTurnstileError, handleTurnstileExpire,
 *   handleTurnstileTimeout, handleTurnstileBypass, and the server-side
 *   NOT_AUTHORIZED rejection effect (WI-10).
 *
 * The TurnstileWidget is replaced by a thin mock that captures all handler
 * props and exposes them as labelled buttons the test can click.
 */
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/components/login/otp-modal', () => ({
    default: () => null,
}));
vi.mock('@/components/login/login-modal', () => ({
    default: () => null,
}));

// Capture every handler prop so tests can invoke them directly.
let capturedSuccess: ((token: string) => void) | null = null;
let capturedError: (() => void) | null = null;
let capturedExpire: (() => void) | null = null;
let capturedTimeout: (() => void) | null = null;
let capturedBypass: (() => void) | null = null;

vi.mock('@/components/security/turnstile-widget', () => ({
    TurnstileWidget: (props: {
        onSuccess?: (token: string) => void;
        onError?: () => void;
        onExpire?: () => void;
        onTimeout?: () => void;
        onBypass?: () => void;
        onRetryExhausted?: (errorCode: string, family: string) => void;
    }) => {
        capturedSuccess = props.onSuccess ?? null;
        capturedError = props.onError ?? null;
        capturedExpire = props.onExpire ?? null;
        capturedTimeout = props.onTimeout ?? null;
        capturedBypass = props.onBypass ?? null;
        return (
            <div data-testid="turnstile-widget-mock">
                <button type="button" data-testid="ts-success" onClick={() => props.onSuccess?.('tok-abc')}>
                    success
                </button>
                <button type="button" data-testid="ts-error" onClick={() => props.onError?.()}>
                    error
                </button>
                <button type="button" data-testid="ts-expire" onClick={() => props.onExpire?.()}>
                    expire
                </button>
                <button type="button" data-testid="ts-timeout" onClick={() => props.onTimeout?.()}>
                    timeout
                </button>
                <button type="button" data-testid="ts-bypass" onClick={() => props.onBypass?.()}>
                    bypass
                </button>
                <button
                    type="button"
                    data-testid="ts-retry-exhausted"
                    onClick={() => props.onRetryExhausted?.('300010', 'bot-detection')}>
                    retry-exhausted
                </button>
            </div>
        );
    },
}));

vi.mock('@/lib/turnstile/utils', () => ({
    isTurnstileEnabled: () => true,
    getTurnstileMode: () => 'managed' as const,
    getTurnstileSiteKey: () => '2x00000000000000000000AB',
    getBrowserTurnstileSiteKey: () => '2x00000000000000000000AB',
}));

const checkSessionMock = vi.hoisted(() => ({
    checkTurnstileSessionVerified: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/turnstile/check-session', () => checkSessionMock);

// Mutable fetcher state — individual tests mutate fields before rendering.
const passwordlessFetcherState = {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    data: null as null | {
        success: boolean;
        email?: string;
        requiresLogin?: boolean;
        error?: { code: string; message?: string };
    },
    submit: vi.fn(),
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: (opts?: { key?: string }) => {
            if (opts?.key === 'contact-authorize-passwordless-email') {
                return passwordlessFetcherState;
            }
            return { state: 'idle' as const, data: null, submit: vi.fn(), Form: actual.Form };
        },
        useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' as const }),
        useResolvedPath: (to: string) => ({ pathname: to, search: '', hash: '', state: null, key: 'k' }),
    };
});

vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/use-customer-lookup', () => ({
    useCustomerLookup: vi.fn(() => null),
    useLoginSuggestion: vi.fn(() => ({ shouldSuggestLogin: false, isCurrentUser: false })),
}));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({ useCustomerProfile: vi.fn(() => null) }));

const mockUseCheckoutContext = vi.fn();
vi.mock('@/hooks/use-checkout', () => ({ useCheckoutContext: () => mockUseCheckoutContext() }));

vi.mock('@/lib/customer/profile-utils', () => ({ getContactInfoFromCustomer: () => ({}) }));
vi.mock('@/lib/address/country-codes', () => ({
    getCommonPhoneCountryCodes: () => [{ dialingCode: '+1', countryName: 'United States' }],
}));
vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual<typeof import('@salesforce/storefront-next-runtime/config')>(
        '@salesforce/storefront-next-runtime/config'
    );
    return {
        ...actual,
        useConfig: () => ({ auth: { otpLength: 6 }, features: { passkey: { enabled: false, mode: 'email' } } }),
    };
});

// No passkey login needed; passkeyEnabled is false from config mock above.
vi.mock('@/hooks/use-passkey-login', () => ({
    usePasskeyLogin: () => ({
        loginWithPasskey: vi.fn(),
        abortPasskeyLogin: vi.fn(),
        isAuthenticating: false,
    }),
}));

import ContactInfo from './contact-info';

const createMockBasket = () => ({
    basketId: 'basket-123',
    currency: 'USD',
    customerInfo: { email: 'shopper@example.com', customerId: null },
    shipments: [{ shipmentId: 'shipment-1', shippingAddress: null }],
    paymentInstruments: [],
});

const buildCheckoutContext = () => ({
    step: 0,
    computedStep: 0,
    editingStep: null,
    STEPS: { CONTACT_INFO: 0, PICKUP: 1, SHIPPING_ADDRESS: 2, SHIPPING_OPTIONS: 3, PAYMENT: 4, PLACE_ORDER: 5 },
    customerProfile: undefined,
    shippingDefaultSet: Promise.resolve(undefined),
    shipmentDistribution: {
        hasUnaddressedDeliveryItems: false,
        hasEmptyShipments: false,
        deliveryShipments: [],
        hasPickupItems: false,
        hasDeliveryItems: true,
        isDeliveryProductItem: () => true,
        enableMultiAddress: false,
        hasMultipleDeliveryAddresses: false,
    },
    savedAddresses: [],
    setSavedAddresses: vi.fn(),
    goToNextStep: vi.fn(),
    goToStep: vi.fn(),
    exitEditMode: vi.fn(),
});

function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'], initialIndex: 0 });
    return render(<RouterProvider router={router} />);
}

/** Blur email and flush the async cc-tv session check. */
async function blurEmail(emailInput: HTMLElement) {
    act(() => {
        fireEvent.blur(emailInput);
    });
    // Flush microtasks from checkTurnstileSessionVerified().then(...)
    await act(async () => {
        await Promise.resolve();
    });
}

/** Mount Turnstile by blurring a valid email (first show is blur, not focus). */
async function mountTurnstileViaEmailBlur(emailInput: HTMLElement) {
    await blurEmail(emailInput);
    await waitFor(() => {
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
    });
}

describe('ContactInfo — Turnstile handlers', () => {
    let useBasket: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValue(false);
        capturedSuccess = null;
        capturedError = null;
        capturedExpire = null;
        capturedTimeout = null;
        capturedBypass = null;
        passwordlessFetcherState.state = 'idle';
        passwordlessFetcherState.data = null;
        passwordlessFetcherState.submit = vi.fn();
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());
        const basketModule = await import('@/providers/basket');
        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useBasket.mockReturnValue(createMockBasket());
    });

    // ── Widget visibility ──────────────────────────────────────────────────────

    test('Turnstile widget is not mounted on email focus alone', () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();
    });

    test('Turnstile widget is mounted when email field is blurred', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        // Basket default email is valid; blur mounts the widget (first show).
        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
    });

    test('Continue button is disabled while Turnstile is pending (no token, no bypass)', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        // Widget visible but no token yet → turnstilePending = true → button disabled
        const continueButton = screen.getByRole('button', { name: /continue/i });
        expect(continueButton).toBeDisabled();
    });

    // ── handleTurnstileSuccess ─────────────────────────────────────────────────

    test('handleTurnstileSuccess stores token and unblocks Continue button', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        const continueButton = screen.getByRole('button', { name: /continue/i });
        expect(continueButton).toBeDisabled();

        // Widget fires success → token stored → turnstilePending = false
        fireEvent.click(screen.getByTestId('ts-success'));

        expect(continueButton).not.toBeDisabled();
    });

    test('handleTurnstileSuccess also clears turnstileRetryExhausted flag', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        // Exhaust retries so the flag is set
        fireEvent.click(screen.getByTestId('ts-retry-exhausted'));
        expect(screen.getByTestId('contact-info-verification-error')).toBeInTheDocument();

        // Focus email again so widget is remounted fresh (recovery path)
        fireEvent.focus(emailInput);

        // Success on the fresh widget clears the exhausted flag
        fireEvent.click(screen.getByTestId('ts-success'));

        // Retry-exhausted flag cleared → Continue button disabled (turnstilePending gates it
        // since bypass is false and token is about to be consumed by the pending-email effect)
        // The important assertion is that the verification error is gone
        expect(screen.queryByTestId('contact-info-verification-error')).not.toBeInTheDocument();
    });

    test('onSuccess handler is wired through to TurnstileWidget prop', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(capturedSuccess, 'ContactInfo must pass onSuccess to TurnstileWidget').to.be.a('function');
    });

    // ── handleTurnstileError ───────────────────────────────────────────────────

    test('handleTurnstileError clears the token (re-gates Continue after prior success)', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        const continueButton = screen.getByRole('button', { name: /continue/i });

        // Success → token set → button enabled
        fireEvent.click(screen.getByTestId('ts-success'));
        expect(continueButton).not.toBeDisabled();

        // Error → token cleared → button disabled again
        fireEvent.click(screen.getByTestId('ts-error'));
        expect(continueButton).toBeDisabled();
    });

    test('onError handler is wired through to TurnstileWidget prop', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(capturedError, 'ContactInfo must pass onError to TurnstileWidget').to.be.a('function');
    });

    // ── handleTurnstileExpire ──────────────────────────────────────────────────

    test('handleTurnstileExpire clears the token (re-gates Continue after prior success)', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        const continueButton = screen.getByRole('button', { name: /continue/i });

        fireEvent.click(screen.getByTestId('ts-success'));
        expect(continueButton).not.toBeDisabled();

        fireEvent.click(screen.getByTestId('ts-expire'));
        expect(continueButton).toBeDisabled();
    });

    test('onExpire handler is wired through to TurnstileWidget prop', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(capturedExpire, 'ContactInfo must pass onExpire to TurnstileWidget').to.be.a('function');
    });

    // ── handleTurnstileTimeout ─────────────────────────────────────────────────

    test('handleTurnstileTimeout clears the token (re-gates Continue after prior success)', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        const continueButton = screen.getByRole('button', { name: /continue/i });

        fireEvent.click(screen.getByTestId('ts-success'));
        expect(continueButton).not.toBeDisabled();

        fireEvent.click(screen.getByTestId('ts-timeout'));
        expect(continueButton).toBeDisabled();
    });

    test('onTimeout handler is wired through to TurnstileWidget prop', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(capturedTimeout, 'ContactInfo must pass onTimeout to TurnstileWidget').to.be.a('function');
    });

    // ── handleTurnstileBypass ──────────────────────────────────────────────────

    test('handleTurnstileBypass sets bypassed flag and unblocks Continue button', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        const continueButton = screen.getByRole('button', { name: /continue/i });
        expect(continueButton).toBeDisabled();

        // Bypass fires (e.g. CDN failure) → turnstileBypassed = true → turnstilePending = false
        fireEvent.click(screen.getByTestId('ts-bypass'));
        expect(continueButton).not.toBeDisabled();
    });

    test('widget stays mounted after bypass (condition has no !turnstileBypassed guard)', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('ts-bypass'));

        // The JSX condition is `turnstileEnabled && turnstileSiteKey && showTurnstile` — no
        // !turnstileBypassed guard — so the widget remains mounted after bypass.
        // What changes is that turnstileBypassed=true makes turnstilePending=false,
        // which unblocks the Continue button.
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
    });

    test('onBypass handler is wired through to TurnstileWidget prop', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        expect(capturedBypass, 'ContactInfo must pass onBypass to TurnstileWidget').to.be.a('function');
    });

    // ── Bypass effect: pending email submitted without token ───────────────────

    test('bypass with pending email triggers fetcher.submit without turnstileToken', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        // Blur mounts widget and sets pendingEmailRef.current (basket default email)
        await mountTurnstileViaEmailBlur(emailInput);

        // Bypass fires → bypass effect submits pending email without token
        fireEvent.click(screen.getByTestId('ts-bypass'));

        expect(passwordlessFetcherState.submit).toHaveBeenCalledOnce();
        const [formData] = passwordlessFetcherState.submit.mock.calls[0] as [FormData];
        expect(formData.get('email')).toBe('shopper@example.com');
        expect(formData.get('turnstileToken')).toBeNull();
    });

    // ── Token effect: pending email submitted with token ───────────────────────

    test('success with pending email triggers fetcher.submit with turnstileToken', async () => {
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        // Blur mounts widget and sets pendingEmailRef.current
        await mountTurnstileViaEmailBlur(emailInput);

        // Success → token set → token effect fires → submit with token
        fireEvent.click(screen.getByTestId('ts-success'));

        expect(passwordlessFetcherState.submit).toHaveBeenCalledOnce();
        const [formData] = passwordlessFetcherState.submit.mock.calls[0] as [FormData];
        expect(formData.get('email')).toBe('shopper@example.com');
        expect(formData.get('turnstileToken')).toBe('tok-abc');
    });

    test('blur after token already available appends turnstileToken on the blur submit path', async () => {
        // Covers handleEmailBlur lines that append turnstileToken when the widget
        // already resolved before blur (no pending-email wait).
        passwordlessFetcherState.submit.mockClear();

        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        // First blur mounts the widget and queues pending email; success submits via the
        // token effect and marks the token consumed. Deliver success again so
        // handleTurnstileSuccess clears tokenConsumedRef — then a later blur can take the
        // "token already available" submit path.
        await mountTurnstileViaEmailBlur(emailInput);
        fireEvent.click(screen.getByTestId('ts-success'));
        fireEvent.click(screen.getByTestId('ts-success'));
        passwordlessFetcherState.submit.mockClear();

        // Change email so lastEmailSentRef dedupe does not short-circuit, then blur.
        fireEvent.change(emailInput, { target: { value: 'fresh-token@example.com' } });
        await blurEmail(emailInput);

        expect(passwordlessFetcherState.submit).toHaveBeenCalled();
        const calls = passwordlessFetcherState.submit.mock.calls as [FormData][];
        const withToken = calls.map(([fd]) => fd).find((fd) => fd.get('turnstileToken') === 'tok-abc');
        expect(withToken, 'blur submit should include turnstileToken').toBeTruthy();
        expect(withToken?.get('email')).toBe('fresh-token@example.com');
    });

    // ── Server-side NOT_AUTHORIZED rejection (WI-10) ──────────────────────────

    test('server 403 NOT_AUTHORIZED response shows generic verification alert', () => {
        // Pre-configure the fetcher with a server rejection so the effect fires on mount
        passwordlessFetcherState.state = 'idle';
        passwordlessFetcherState.data = {
            success: false,
            error: { code: 'NOT_AUTHORIZED', message: 'Turnstile verification failed' },
        };

        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const alert = screen.getByTestId('contact-info-verification-error');
        expect(alert).toHaveAttribute('role', 'alert');
        // Must be generic — must not leak "Turnstile", "bot", "captcha", or the error code
        const text = (alert.textContent || '').toLowerCase();
        expect(text).not.toMatch(/turnstile|bot|captcha|not_authorized/);
    });

    test('server 403 NOT_AUTHORIZED does not produce an alert when code differs', () => {
        // A non-NOT_AUTHORIZED error code should not trigger the Turnstile rejection effect
        passwordlessFetcherState.state = 'idle';
        passwordlessFetcherState.data = {
            success: false,
            error: { code: 'OPERATION_FAILED', message: 'Something went wrong' },
        };

        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        expect(screen.queryByTestId('contact-info-verification-error')).not.toBeInTheDocument();
    });

    test('verification error clears when email field is focused after server rejection', () => {
        passwordlessFetcherState.state = 'idle';
        passwordlessFetcherState.data = {
            success: false,
            error: { code: 'NOT_AUTHORIZED', message: 'Turnstile verification failed' },
        };

        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        expect(screen.getByTestId('contact-info-verification-error')).toBeInTheDocument();

        // Focusing the email field clears the error via handleEmailFocus (recovery)
        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        expect(screen.queryByTestId('contact-info-verification-error')).not.toBeInTheDocument();
    });

    // ── handleResendOtp includes turnstileToken ────────────────────────────────

    test('handleTurnstileSuccess provides the token for subsequent resend operations', async () => {
        // When the OTP modal is open and the shopper requests a resend, the token
        // accumulated via onSuccess should be appended to the resend form data.
        // We verify that the token is stored (not that handleResendOtp is called
        // directly since the OTP modal is mocked to null). The key assertion is
        // that success/error/expire/timeout handlers form a consistent token state.

        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);

        // Success → token stored
        fireEvent.click(screen.getByTestId('ts-success'));

        // Expire → token cleared
        fireEvent.click(screen.getByTestId('ts-expire'));

        // Success again → token refreshed
        fireEvent.click(screen.getByTestId('ts-success'));

        // Continue button reflects token is available (not disabled)
        // Blur was never fired, so no pending email → no submit yet; token is still held
        expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
    });

    // ── emailVerificationEnabled=false skips widget ────────────────────────────

    test('Turnstile widget is not shown when emailVerificationEnabled is false', async () => {
        renderWithRouter(
            <ContactInfo
                onSubmit={vi.fn()}
                isLoading={false}
                isCompleted={false}
                isEditing={true}
                onEdit={vi.fn()}
                emailVerificationEnabled={false}
            />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await blurEmail(emailInput);

        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();
    });

    test('Continue button is not gated by Turnstile when emailVerificationEnabled is false', async () => {
        renderWithRouter(
            <ContactInfo
                onSubmit={vi.fn()}
                isLoading={false}
                isCompleted={false}
                isEditing={true}
                onEdit={vi.fn()}
                emailVerificationEnabled={false}
            />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await blurEmail(emailInput);

        // turnstileEnabled = isTurnstileEnabled(config) && emailVerificationEnabled !== false
        // With emailVerificationEnabled=false, turnstileEnabled = false → not pending
        expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
    });

    // ── cc-tv session suppress ─────────────────────────────────────────────────

    test('when session check says verified, widget does not mount and Continue is not gated', async () => {
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValue(true);
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await blurEmail(emailInput);

        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
        expect(checkSessionMock.checkTurnstileSessionVerified).toHaveBeenCalled();
    });

    test('when session check says not verified, widget mounts on blur', async () => {
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValue(false);
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await mountTurnstileViaEmailBlur(emailInput);
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    });

    test('changing email after session suppress remounts widget on next blur', async () => {
        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValueOnce(true);
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        await blurEmail(emailInput);
        expect(screen.queryByTestId('turnstile-widget-mock')).not.toBeInTheDocument();

        checkSessionMock.checkTurnstileSessionVerified.mockResolvedValueOnce(false);
        act(() => {
            fireEvent.change(emailInput, { target: { value: 'other@example.com' } });
        });
        await mountTurnstileViaEmailBlur(emailInput);
        expect(screen.getByTestId('turnstile-widget-mock')).toBeInTheDocument();
    });
});
