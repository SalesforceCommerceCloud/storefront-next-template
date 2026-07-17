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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import type { ShopperCustomers } from '@/scapi';
import { ConfigWrapper, getSiteRef, mockSiteObject } from '@/test-utils/config';

const mockFetcherSubmit = vi.fn();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: vi.fn(() => ({
            submit: mockFetcherSubmit,
            state: 'idle',
            data: null,
        })),
    };
});

type Customer = ShopperCustomers.schemas['Customer'];

// --- Mock setup ---

const mockAddToast = vi.fn();

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/providers/auth', () => ({
    useAuth: () => ({ customerId: 'test-customer-id' }),
}));

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => ({
        submit: vi.fn(),
        load: vi.fn(),
        data: null,
        state: 'idle',
    })),
}));

vi.mock('@/hooks/use-scapi-fetcher-effect', () => ({
    useScapiFetcherEffect: vi.fn(),
}));

let capturedFetcherEffectCallbacks: { onSuccess?: () => void; onError?: () => void }[] = [];

vi.mock('@/hooks/use-fetcher-effect', () => ({
    useFetcherEffect: vi.fn((_fetcher, callbacks) => {
        capturedFetcherEffectCallbacks.push(callbacks);
    }),
}));

// Capture props passed to CustomerProfileForm so we can invoke its callbacks
let capturedProfileFormProps: {
    initialData: Record<string, string>;
    onSuccess: (data: Record<string, string>) => void;
    onError: (error: string) => void;
    onCancel: () => void;
} | null = null;

vi.mock('@/components/customer-profile-form', () => ({
    CustomerProfileForm: (props: typeof capturedProfileFormProps) => {
        capturedProfileFormProps = props;
        return <div data-testid="customer-profile-form" />;
    },
}));

vi.mock('@/components/password-update-form', () => ({
    PasswordUpdateForm: () => <div data-testid="password-update-form" />,
}));

// Capture props passed to EmailUpdateForm so we can invoke its callbacks
let capturedEmailFormProps: {
    updateFetcher: unknown;
    onSuccess: (data: { email: string; currentPassword?: string }) => void;
    onError: (error: string) => void;
    onCancel: () => void;
    requirePassword: boolean;
} | null = null;

vi.mock('@/components/email-update-form', () => ({
    EmailUpdateForm: (props: typeof capturedEmailFormProps) => {
        capturedEmailFormProps = props;
        return <div data-testid="email-update-form" />;
    },
}));

// Capture props passed to OtpModal so we can invoke its callbacks
let capturedOtpModalProps: {
    isOpen: boolean;
    email: string;
    otpLength: number;
    initialError?: string;
    onSuccess: () => void;
    onClose: () => void;
    onResendCode: () => void;
    onVerifyCode?: (code: string) => Promise<void>;
} | null = null;

vi.mock('@/components/account-detail-skeleton', () => ({
    AccountDetailSkeleton: () => <div data-testid="account-detail-skeleton" />,
}));

vi.mock('@/components/account/marketing-consent', () => ({
    MarketingConsent: () => <div data-testid="marketing-consent" />,
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({
        url: { prefix: '/:siteId/:localeId', excludeRoutes: ['/resource/**', '/action/**'] },
    }),
}));

vi.mock('@/hooks/use-current-site-and-locale-ref', () => ({
    useCurrentSiteAndLocaleRef: () => ({ siteRef: getSiteRef(), localeRef: mockSiteObject.defaultLocale }),
}));

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    buildUrl: ({ to }: { to: string }) => `/${getSiteRef()}/${mockSiteObject.defaultLocale}${to}`,
}));

// Mock the lazy-loaded OTP modal component to capture its props
vi.mock('@/components/login/otp-modal', () => ({
    default: (props: typeof capturedOtpModalProps) => {
        capturedOtpModalProps = props;
        return <div data-testid="otp-modal" />;
    },
}));

// --- Test data ---

const mockCustomer: Customer = {
    customerId: 'test-customer-id',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    login: 'john@example.com',
    phoneHome: '555-0100',
    gender: 1,
    birthday: '1990-05-15',
    emailVerified: true,
    hasPassword: true, // Default to password-based user
};

/**
 * Helper to render AccountDetails inside a router that provides outlet context,
 * similar to how _app.account.tsx provides it via <Outlet context={...}>.
 */
async function renderAccountDetails(customer: Customer | null = mockCustomer) {
    const AccountDetails = (await import('./_app.account._index')).default;

    const router = createMemoryRouter(
        [
            {
                path: '/account',
                element: (
                    <Outlet
                        context={{
                            customer: Promise.resolve(customer),
                            subscriptions: Promise.resolve(null),
                        }}
                    />
                ),
                children: [
                    {
                        index: true,
                        element: <AccountDetails />,
                    },
                ],
            },
        ],
        { initialEntries: ['/account'] }
    );

    const result = render(
        <ConfigWrapper>
            <RouterProvider router={router} />
        </ConfigWrapper>
    );

    // Wait for the Await/Suspense boundary to resolve
    await waitFor(() => {
        expect(screen.queryByTestId('account-detail-skeleton')).not.toBeInTheDocument();
    });

    return result;
}

/**
 * Helper: enter profile edit mode and return captured form props.
 * Clicks the Edit button on the profile toggle card, waits for the
 * CustomerProfileForm stub to render and capture its props.
 */
async function enterEditMode() {
    const profileCard = screen.getByTestId('profile-card');
    const editButton = within(profileCard).getByRole('button', { name: 'Edit' });
    act(() => {
        editButton.click();
    });
    await waitFor(() => {
        expect(capturedProfileFormProps).not.toBeNull();
    });
    // Safe to return non-null after the assertion above
    return capturedProfileFormProps as NonNullable<typeof capturedProfileFormProps>;
}

/**
 * Helper: enter email edit mode and return captured form props.
 * Clicks the "Change email" button on the email toggle card.
 * - Passwordless shoppers: waits for OTP modal, simulates success, then waits for the form.
 * - Password-based shoppers: the form appears directly with no OTP step.
 */
async function enterEmailEditMode() {
    const emailCard = screen.getByTestId('sf-toggle-card-email');
    const editButton = within(emailCard).getByRole('button', { name: 'Change email' });

    // Click "Change Email"
    act(() => {
        editButton.click();
    });

    // Wait for either the OTP modal (passwordless) or the email form (password-based) to appear.
    await waitFor(() => {
        const otpOpen = capturedOtpModalProps?.isOpen === true;
        const formRendered = capturedEmailFormProps !== null;
        expect(otpOpen || formRendered).toBe(true);
    });

    // If OTP modal opened first, simulate successful verification before continuing.
    if (capturedOtpModalProps?.isOpen) {
        act(() => {
            capturedOtpModalProps?.onSuccess();
        });

        await waitFor(() => {
            expect(capturedEmailFormProps).not.toBeNull();
        });
    }

    return capturedEmailFormProps as NonNullable<typeof capturedEmailFormProps>;
}

// --- Tests ---

describe('AccountDetails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedProfileFormProps = null;
        capturedEmailFormProps = null;
        capturedOtpModalProps = null;
        capturedFetcherEffectCallbacks = [];
    });

    test('renders customer data in the profile summary', async () => {
        await renderAccountDetails();

        expect(screen.getByText('John')).toBeInTheDocument();
        expect(screen.getByText('Doe')).toBeInTheDocument();
        expect(screen.getByText('Male')).toBeInTheDocument();
    });

    test('shows "Not provided" for missing customer fields', async () => {
        const sparseCustomer: Customer = {
            customerId: 'test-customer-id',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
            login: 'jane@example.com',
        };

        await renderAccountDetails(sparseCustomer);

        expect(screen.getByText('Jane')).toBeInTheDocument();
        // Gender and birthday are not set, so "Not provided" should appear
        const notProvidedElements = screen.getAllByText('Not provided');
        expect(notProvidedElements.length).toBeGreaterThanOrEqual(2);
    });

    test('applies optimistic override after profile save success', async () => {
        await renderAccountDetails();

        // Verify initial data
        expect(screen.getByText('John')).toBeInTheDocument();
        expect(screen.getByText('Doe')).toBeInTheDocument();

        const formProps = await enterEditMode();

        // Simulate a successful profile update with new data
        act(() => {
            formProps.onSuccess({
                firstName: 'Jane',
                lastName: 'Updated',
                phone: '555-9999',
                gender: '2',
                birthday: '1985-12-25',
            });
        });

        // After success, editing mode closes and summary shows optimistic values
        expect(screen.getByText('Jane')).toBeInTheDocument();
        expect(screen.getByText('Updated')).toBeInTheDocument();
        expect(screen.getByText('Female')).toBeInTheDocument();
    });

    test('shows success toast on profile save', async () => {
        await renderAccountDetails();

        const formProps = await enterEditMode();

        act(() => {
            formProps.onSuccess({
                firstName: 'Jane',
                lastName: 'Updated',
            });
        });

        expect(mockAddToast).toHaveBeenCalledWith('Your profile was updated.', 'success');
    });

    test('shows error toast on profile save failure', async () => {
        await renderAccountDetails();

        const formProps = await enterEditMode();

        act(() => {
            formProps.onError('Something went wrong');
        });

        expect(mockAddToast).toHaveBeenCalledWith('Something went wrong', 'error');
    });

    test('passes displayCustomer data to CustomerProfileForm initialData', async () => {
        await renderAccountDetails();

        const formProps = await enterEditMode();

        expect(formProps.initialData).toEqual({
            firstName: 'John',
            lastName: 'Doe',
            phone: '555-0100',
            gender: '1',
            birthday: '1990-05-15',
        });
    });

    test('renders skeleton while data is loading', async () => {
        const AccountDetails = (await import('./_app.account._index')).default;

        // Use a promise that never resolves to keep the Suspense boundary active
        const pendingPromise = new Promise<Customer | null>(() => {});

        const router = createMemoryRouter(
            [
                {
                    path: '/account',
                    element: (
                        <Outlet
                            context={{
                                customer: pendingPromise,
                                subscriptions: new Promise(() => {}),
                            }}
                        />
                    ),
                    children: [
                        {
                            index: true,
                            element: <AccountDetails />,
                        },
                    ],
                },
            ],
            { initialEntries: ['/account'] }
        );

        render(
            <ConfigWrapper>
                <RouterProvider router={router} />
            </ConfigWrapper>
        );

        expect(screen.getByTestId('account-detail-skeleton')).toBeInTheDocument();
    });

    test('handles null customer gracefully', async () => {
        await renderAccountDetails(null);

        // When customer is null, all profile fields should show "Not provided"
        const notProvidedElements = screen.getAllByText('Not provided');
        expect(notProvidedElements.length).toBeGreaterThanOrEqual(4);
    });

    describe('email card', () => {
        test('shows Verify Email button and Unverified badge when email verification is enabled and email is not verified', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            expect(screen.getByRole('button', { name: 'Verify Email' })).toBeInTheDocument();
            expect(screen.getByTestId('email-unverified-badge')).toBeInTheDocument();
        });

        test('does not show Verify Email button when emailVerified field is absent', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: undefined });

            expect(screen.queryByRole('button', { name: 'Verify Email' })).not.toBeInTheDocument();
        });

        test('does not show Verify Email button when email is already verified', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: true });

            expect(screen.queryByRole('button', { name: 'Verify Email' })).not.toBeInTheDocument();
            expect(screen.getByTestId('email-verified-badge')).toBeInTheDocument();
        });

        test('opens OTP modal in verifyEmail mode when Verify Email is clicked', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            act(() => {
                screen.getByRole('button', { name: 'Verify Email' }).click();
            });

            await waitFor(() => {
                expect(capturedOtpModalProps).not.toBeNull();
                expect(capturedOtpModalProps?.isOpen).toBe(true);
            });
        });

        test('shows Verified badge optimistically after successful verify-email OTP', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            act(() => {
                screen.getByRole('button', { name: 'Verify Email' }).click();
            });

            await waitFor(() => {
                expect(capturedOtpModalProps).not.toBeNull();
            });

            act(() => {
                capturedOtpModalProps?.onSuccess();
            });

            await waitFor(() => {
                expect(screen.getByTestId('email-verified-badge')).toBeInTheDocument();
            });
            expect(screen.queryByRole('button', { name: 'Verify Email' })).not.toBeInTheDocument();
        });

        test('keeps Unverified badge and Verify Email button when OTP modal is cancelled', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            act(() => {
                screen.getByRole('button', { name: 'Verify Email' }).click();
            });

            await waitFor(() => {
                expect(capturedOtpModalProps).not.toBeNull();
            });

            act(() => {
                capturedOtpModalProps?.onClose();
            });

            await waitFor(() => {
                expect(screen.getByTestId('email-unverified-badge')).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'Verify Email' })).toBeInTheDocument();
            });
        });

        test('unmounts the OTP modal subtree after close so its fetcher and timer tear down', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            // The lazy OTP subtree is not mounted before the shopper opens it.
            expect(screen.queryByTestId('otp-modal')).not.toBeInTheDocument();

            act(() => {
                screen.getByRole('button', { name: 'Verify Email' }).click();
            });

            await waitFor(() => {
                expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
            });

            // Closing must eventually tear the subtree down — not merely flip isOpen —
            // so OtpModal's useFetcher, resend countdown timer, and effects stop existing.
            act(() => {
                capturedOtpModalProps?.onClose();
            });

            await waitFor(() => {
                expect(screen.queryByTestId('otp-modal')).not.toBeInTheDocument();
            });
        });

        test('translates invalid token OTP verify error in handleVerifyOtp', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
                new Response(
                    JSON.stringify({
                        success: false,
                        error: {
                            code: 'OPERATION_FAILED',
                            message: 'Invalid OTP or token',
                        },
                    }),
                    {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            );

            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            act(() => {
                screen.getByRole('button', { name: 'Verify Email' }).click();
            });

            await waitFor(() => {
                expect(capturedOtpModalProps).not.toBeNull();
                expect(capturedOtpModalProps?.onVerifyCode).toBeDefined();
            });

            await act(async () => {
                await capturedOtpModalProps?.onVerifyCode?.('123456');
            });

            await waitFor(() => {
                expect(capturedOtpModalProps?.initialError).toBe('Invalid verification code. Please try again.');
            });

            fetchSpy.mockRestore();
        });

        test('renders current email in summary', async () => {
            await renderAccountDetails();
            expect(screen.getByText('john@example.com')).toBeInTheDocument();
        });

        test('shows "Not provided" when customer has no email', async () => {
            await renderAccountDetails({ ...mockCustomer, email: undefined, login: undefined });
            const notProvided = screen.getAllByText('Not provided');
            expect(notProvided.length).toBeGreaterThanOrEqual(1);
        });

        test('shows success toast and closes form on success', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            act(() => {
                formProps.onSuccess({ email: 'new@example.com', currentPassword: 'myPassword' });
            });
            expect(mockAddToast).toHaveBeenCalledWith('Email address updated successfully.', 'success');
            await waitFor(() => {
                expect(screen.queryByTestId('email-update-form')).not.toBeInTheDocument();
            });
            expect(screen.getByText('new@example.com')).toBeInTheDocument();
        });

        test('shows error toast on failure', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            act(() => {
                formProps.onError('Update failed');
            });
            expect(mockAddToast).toHaveBeenCalledWith('Failed to update email address. Try again.', 'error');
        });

        test('closes form on cancel', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            act(() => {
                formProps.onCancel();
            });
            await waitFor(() => {
                expect(screen.queryByTestId('email-update-form')).not.toBeInTheDocument();
            });
        });

        test('passes requirePassword=true for shoppers with a password', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            expect(formProps.requirePassword).toBe(true);
        });

        test('passes requirePassword=false for shoppers without a password', async () => {
            await renderAccountDetails({ ...mockCustomer, hasPassword: false });
            const formProps = await enterEmailEditMode();
            expect(formProps.requirePassword).toBe(false);
        });

        test('submits login request with new email and password after email update', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            // Clear mock calls from OTP flow before checking login submission
            mockFetcherSubmit.mockClear();
            act(() => {
                formProps.onSuccess({ email: 'new@example.com', currentPassword: 'myPassword' });
            });
            expect(mockFetcherSubmit).toHaveBeenCalledWith(
                {
                    email: 'new@example.com',
                    password: 'myPassword',
                    loginMode: 'password',
                    returnUrl: '/global/en-GB/account',
                    skipUsid: 'true',
                },
                { method: 'POST', action: '/global/en-GB/login' }
            );
        });

        test('shows auto-login failed toast when credentials are missing after email update', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            // Clear mock calls from OTP flow before checking login submission
            mockFetcherSubmit.mockClear();
            act(() => {
                formProps.onSuccess({ email: 'new@example.com', currentPassword: '' });
            });
            expect(mockFetcherSubmit).not.toHaveBeenCalled();
            expect(mockAddToast).toHaveBeenCalledWith(
                'Email updated successfully, but automatic login failed. Please log in again.',
                'error'
            );
        });

        test('shows auto-login failed toast when login fetcher errors after email update', async () => {
            await renderAccountDetails();
            const formProps = await enterEmailEditMode();
            act(() => {
                formProps.onSuccess({ email: 'new@example.com', currentPassword: 'myPassword' });
            });
            act(() => {
                // Index 1 = email login fetcher; trigger its error callback.
                capturedFetcherEffectCallbacks[1]?.onError?.();
            });
            expect(mockAddToast).toHaveBeenCalledWith(
                'Email updated successfully, but automatic login failed. Please log in again.',
                'error'
            );
        });

        test('uses updated email in OTP modal and request after email change success', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: false });

            const formProps = await enterEmailEditMode();
            act(() => {
                formProps.onSuccess({ email: 'new@example.com', currentPassword: 'myPassword' });
            });

            mockFetcherSubmit.mockClear();

            act(() => {
                screen.getByRole('button', { name: 'Verify Email' }).click();
            });

            await waitFor(() => {
                expect(capturedOtpModalProps).not.toBeNull();
                expect(capturedOtpModalProps?.isOpen).toBe(true);
                expect(capturedOtpModalProps?.email).toBe('new@example.com');
            });

            const otpRequestCall = mockFetcherSubmit.mock.calls.find(
                ([, options]) => options?.action === '/action/otp-request'
            );

            expect(otpRequestCall).toBeDefined();
            const [submittedData, options] = otpRequestCall as [FormData, { method: string; action: string }];
            expect(options).toEqual({ method: 'POST', action: '/action/otp-request' });
            expect(submittedData.get('email')).toBe('new@example.com');
        });

        test('shows unverified badge after email update when email verification is enabled', async () => {
            await renderAccountDetails({ ...mockCustomer, emailVerified: true });
            const formProps = await enterEmailEditMode();
            act(() => {
                formProps.onSuccess({ email: 'new@example.com', currentPassword: 'myPassword' });
            });
            // After email update, badge should show "Unverified" optimistically
            await waitFor(() => {
                expect(screen.getByTestId('email-unverified-badge')).toBeInTheDocument();
                expect(screen.queryByTestId('email-verified-badge')).not.toBeInTheDocument();
            });
        });

        describe('change email button visibility', () => {
            test('shows Change email button when emailVerified is true', async () => {
                await renderAccountDetails();
                const emailCard = screen.getByTestId('sf-toggle-card-email');
                expect(within(emailCard).getByRole('button', { name: 'Change email' })).toBeInTheDocument();
            });

            test('shows Change email button when emailVerified is false', async () => {
                await renderAccountDetails({ ...mockCustomer, emailVerified: false });
                const emailCard = screen.getByTestId('sf-toggle-card-email');
                expect(within(emailCard).getByRole('button', { name: 'Change email' })).toBeInTheDocument();
            });

            test('hides Change email button when emailVerified is undefined', async () => {
                await renderAccountDetails({ ...mockCustomer, emailVerified: undefined });
                const emailCard = screen.getByTestId('sf-toggle-card-email');
                expect(within(emailCard).queryByRole('button', { name: 'Change email' })).not.toBeInTheDocument();
            });
        });

        describe('email verification badge', () => {
            test('shows Verified badge when emailVerified is true', async () => {
                await renderAccountDetails({ ...mockCustomer, emailVerified: true });
                const badge = screen.getByText('Verified').closest('span');
                expect(badge).toBeInTheDocument();
                expect(badge).toHaveClass('bg-blue-600');
            });

            test('shows Unverified badge when emailVerified is false', async () => {
                await renderAccountDetails({ ...mockCustomer, emailVerified: false });
                const badge = screen.getByText('Unverified').closest('span');
                expect(badge).toBeInTheDocument();
                expect(badge).toHaveClass('bg-secondary');
            });

            test('does not show badge when emailVerified is undefined', async () => {
                await renderAccountDetails({ ...mockCustomer, emailVerified: undefined });
                expect(screen.queryByText('Verified')).not.toBeInTheDocument();
                expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
            });
        });

        describe('passwordless email change flow', () => {
            test('triggers OTP modal for passwordless shopper after email update success', async () => {
                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: false });

                const formProps = await enterEmailEditMode();

                // Clear previous OTP modal calls
                capturedOtpModalProps = null;
                mockFetcherSubmit.mockClear();

                // Simulate successful email update
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: undefined });
                });

                // Should trigger OTP modal in reauthenticate mode
                await waitFor(() => {
                    expect(capturedOtpModalProps).not.toBeNull();
                    expect(capturedOtpModalProps?.isOpen).toBe(true);
                    expect(capturedOtpModalProps?.email).toBe('newemail@example.com');
                });

                // Should send OTP to new email address using passwordless login flow
                const otpRequestCall = mockFetcherSubmit.mock.calls.find(
                    ([, options]) => options?.action === '/action/authorize-passwordless-email'
                );
                expect(otpRequestCall).toBeDefined();
                const [submittedData] = otpRequestCall as [FormData, { method: string; action: string }];
                expect(submittedData.get('email')).toBe('newemail@example.com');
            });

            test('does not trigger OTP modal for password-based shopper after email update', async () => {
                await renderAccountDetails({ ...mockCustomer, hasPassword: true, emailVerified: true });

                const formProps = await enterEmailEditMode();

                mockFetcherSubmit.mockClear();

                // Simulate successful email update with password
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: 'myPassword' });
                });

                // Should submit password-based login instead of OTP
                await waitFor(() => {
                    expect(mockFetcherSubmit).toHaveBeenCalledWith(
                        {
                            email: 'newemail@example.com',
                            password: 'myPassword',
                            loginMode: 'password',
                            returnUrl: '/global/en-GB/account',
                            skipUsid: 'true',
                        },
                        { method: 'POST', action: '/global/en-GB/login' }
                    );
                });

                // OTP modal should not have been triggered (no OTP request to new email)
                const otpRequestToNewEmail = mockFetcherSubmit.mock.calls.find(
                    ([data, options]) =>
                        options?.action === '/action/otp-request' &&
                        data instanceof FormData &&
                        data.get('email') === 'newemail@example.com' &&
                        options?.method === 'POST'
                );
                expect(otpRequestToNewEmail).toBeUndefined();
            });

            test('uses verify-passwordless-otp endpoint for reauthenticate mode', async () => {
                const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                );

                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: false });

                const formProps = await enterEmailEditMode();
                capturedOtpModalProps = null;

                // Trigger email update success
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: undefined });
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps).not.toBeNull();
                    expect(capturedOtpModalProps?.onVerifyCode).toBeDefined();
                });

                // Simulate OTP code submission
                await act(async () => {
                    await capturedOtpModalProps?.onVerifyCode?.('123456');
                });

                // Should call verify-passwordless-otp endpoint (not otp-verify)
                await waitFor(() => {
                    expect(fetchSpy).toHaveBeenCalledWith(
                        '/action/verify-passwordless-otp',
                        expect.objectContaining({ method: 'POST' })
                    );
                });

                // Verify the form data includes OTP code and email
                const fetchCall = fetchSpy.mock.calls[0];
                const formData = fetchCall[1]?.body as FormData;
                expect(formData.get('otpCode')).toBe('123456');
                expect(formData.get('email')).toBe('newemail@example.com');

                fetchSpy.mockRestore();
            });

            test('uses otp-verify endpoint for changeEmail mode', async () => {
                const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                );

                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: false });

                const emailCard = screen.getByTestId('sf-toggle-card-email');
                const editButton = within(emailCard).getByRole('button', { name: 'Change email' });

                // Click "Change Email" to trigger OTP in changeEmail mode
                act(() => {
                    editButton.click();
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps).not.toBeNull();
                    expect(capturedOtpModalProps?.onVerifyCode).toBeDefined();
                });

                // Simulate OTP code submission
                await act(async () => {
                    await capturedOtpModalProps?.onVerifyCode?.('123456');
                });

                // Should call otp-verify endpoint (not verify-passwordless-otp)
                await waitFor(() => {
                    expect(fetchSpy).toHaveBeenCalledWith(
                        '/action/otp-verify',
                        expect.objectContaining({ method: 'POST' })
                    );
                });

                fetchSpy.mockRestore();
            });

            test('shows error toast when email update but OTP send fails', async () => {
                // Mock OTP request to fail (for reauthenticate mode, uses authorize-passwordless-email)
                mockFetcherSubmit.mockImplementation((_data: unknown, options?: { action?: string }) => {
                    if (options?.action === '/action/authorize-passwordless-email') {
                        // Simulate error by triggering the error callback
                        setTimeout(() => {
                            const errorCallback = capturedFetcherEffectCallbacks.find((cb) => cb.onError)?.onError;
                            errorCallback?.();
                        }, 0);
                    }
                });

                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: true });

                const formProps = await enterEmailEditMode();
                mockAddToast.mockClear();

                // Trigger email update success
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: undefined });
                });

                // Should show error toast when OTP send fails
                await waitFor(() => {
                    expect(mockAddToast).toHaveBeenCalledWith(expect.any(String), 'error');
                });
            });

            test('closes OTP modal and updates optimistic state after reauthenticate success', async () => {
                const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
                    new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    })
                );

                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: false });

                const formProps = await enterEmailEditMode();
                capturedOtpModalProps = null;

                // Trigger email update success
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: undefined });
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(true);
                });

                // Simulate successful OTP verification
                await act(async () => {
                    await capturedOtpModalProps?.onVerifyCode?.('123456');
                });

                // OTP modal should close
                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(false);
                });

                // Email should be updated optimistically
                expect(screen.getByText('newemail@example.com')).toBeInTheDocument();

                fetchSpy.mockRestore();
            });

            test('uses authorize-passwordless-email endpoint for OTP resend in reauthenticate mode', async () => {
                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: true });

                const formProps = await enterEmailEditMode();
                capturedOtpModalProps = null;

                // Trigger email update success
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: undefined });
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps?.onResendCode).toBeDefined();
                });

                mockFetcherSubmit.mockClear();

                // Trigger OTP resend
                act(() => {
                    capturedOtpModalProps?.onResendCode();
                });

                // Should use authorize-passwordless-email endpoint, not otp-request
                await waitFor(() => {
                    const resendCall = mockFetcherSubmit.mock.calls.find(
                        ([, options]) => options?.action === '/action/authorize-passwordless-email'
                    );
                    expect(resendCall).toBeDefined();
                    const [submittedData] = resendCall as [FormData, { method: string; action: string }];
                    expect(submittedData.get('email')).toBe('newemail@example.com');
                });
            });

            test('uses otp-request endpoint for OTP resend in changeEmail mode', async () => {
                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: false });

                const emailCard = screen.getByTestId('sf-toggle-card-email');
                const editButton = within(emailCard).getByRole('button', { name: 'Change email' });

                // Click "Change Email" to trigger OTP in changeEmail mode
                act(() => {
                    editButton.click();
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps?.onResendCode).toBeDefined();
                });

                mockFetcherSubmit.mockClear();

                // Trigger OTP resend
                act(() => {
                    capturedOtpModalProps?.onResendCode();
                });

                // Should use otp-request endpoint in changeEmail mode
                await waitFor(() => {
                    const resendCall = mockFetcherSubmit.mock.calls.find(
                        ([, options]) => options?.action === '/action/otp-request'
                    );
                    expect(resendCall).toBeDefined();
                    const [submittedData] = resendCall as [FormData, { method: string; action: string }];
                    expect(submittedData.get('email')).toBe('john@example.com');
                });
            });

            test('logs out user when OTP modal is cancelled in reauthenticate mode', async () => {
                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: true });

                const formProps = await enterEmailEditMode();
                capturedOtpModalProps = null;

                // Trigger email update success
                act(() => {
                    formProps.onSuccess({ email: 'newemail@example.com', currentPassword: undefined });
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(true);
                });

                mockFetcherSubmit.mockClear();

                // Cancel OTP modal
                act(() => {
                    capturedOtpModalProps?.onClose();
                });

                // Should trigger logout to prevent stale JWT session
                await waitFor(() => {
                    expect(mockFetcherSubmit).toHaveBeenCalledWith(null, {
                        method: 'POST',
                        action: '/global/en-GB/logout',
                    });
                });
            });

            test('does not log out when OTP modal is cancelled in changeEmail mode', async () => {
                await renderAccountDetails({ ...mockCustomer, hasPassword: false, emailVerified: false });

                const emailCard = screen.getByTestId('sf-toggle-card-email');
                const editButton = within(emailCard).getByRole('button', { name: 'Change email' });

                // Click "Change Email" to trigger OTP in changeEmail mode
                act(() => {
                    editButton.click();
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(true);
                });

                mockFetcherSubmit.mockClear();

                // Cancel OTP modal
                act(() => {
                    capturedOtpModalProps?.onClose();
                });

                // Should NOT trigger logout in changeEmail mode
                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(false);
                });
                expect(mockFetcherSubmit).not.toHaveBeenCalled();
            });

            test('does not log out when OTP modal is cancelled in verifyEmail mode', async () => {
                await renderAccountDetails({ ...mockCustomer, emailVerified: false });

                act(() => {
                    screen.getByRole('button', { name: 'Verify Email' }).click();
                });

                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(true);
                });

                mockFetcherSubmit.mockClear();

                // Cancel OTP modal
                act(() => {
                    capturedOtpModalProps?.onClose();
                });

                // Should NOT trigger logout in verifyEmail mode
                await waitFor(() => {
                    expect(capturedOtpModalProps?.isOpen).toBe(false);
                });
                expect(mockFetcherSubmit).not.toHaveBeenCalled();
            });
        });
    });

    describe('password card', () => {
        test('shows "Reset password" button and "Not provided" text when user has no password', async () => {
            const customerWithoutPassword: Customer = {
                ...mockCustomer,
                hasPassword: false,
            };

            await renderAccountDetails(customerWithoutPassword);

            const passwordCard = screen.getByTestId('sf-toggle-card-password');
            expect(within(passwordCard).getByText('Not provided')).toBeInTheDocument();
            expect(within(passwordCard).getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
        });

        test('shows "Change password" button and hidden password when user has password', async () => {
            const customerWithPassword: Customer = {
                ...mockCustomer,
                hasPassword: true,
            };

            await renderAccountDetails(customerWithPassword);

            const passwordCard = screen.getByTestId('sf-toggle-card-password');
            expect(within(passwordCard).getByText('••••••••')).toBeInTheDocument();
            expect(within(passwordCard).getByRole('button', { name: 'Change password' })).toBeInTheDocument();
        });
    });
});
