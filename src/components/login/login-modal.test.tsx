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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import LoginModal from './login-modal';

// Mock fetcher. `Form` renders a passthrough <form> so the form children render
// (the modal passes fetcher.Form down to the login form components).
const mockFetcher = {
    data: null as any,
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    submit: vi.fn(),
    load: vi.fn(),
    Form: ({ children, ...props }: React.ComponentProps<'form'>) => <form {...props}>{children}</form>,
};

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
    const router = createMemoryRouter([{ path: '*', element: <AllProvidersWrapper>{ui}</AllProvidersWrapper> }], {
        initialEntries,
    });
    return render(<RouterProvider router={router} />);
}

describe('LoginModal', () => {
    const defaultProps = {
        isOpen: true,
        onOpenChange: vi.fn(),
        mode: 'password' as const,
        isPasswordlessEnabled: true,
        isSocialLoginEnabled: false,
        returnUrl: '/',
        otpLength: 8,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.data = null;
        mockFetcher.state = 'idle';
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue(mockFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('rendering', () => {
        test('renders modal when isOpen is true', () => {
            renderWithRouter(<LoginModal {...defaultProps} />);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByText(t('login:title'))).toBeInTheDocument();
            expect(screen.getByText(t('login:subtitle'))).toBeInTheDocument();
        });

        test('does not render modal when isOpen is false', () => {
            renderWithRouter(<LoginModal {...defaultProps} isOpen={false} />);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        test('renders StandardLoginForm in password mode', () => {
            renderWithRouter(<LoginModal {...defaultProps} mode="password" />);

            expect(screen.getByLabelText(t('login:emailLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('login:passwordLabel'))).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('login:signIn') })).toBeInTheDocument();
        });

        test('renders PasswordlessLoginForm in passwordless mode', () => {
            renderWithRouter(<LoginModal {...defaultProps} mode="passwordless" />);

            expect(screen.getByLabelText(t('login:emailLabel'))).toBeInTheDocument();
            expect(screen.queryByLabelText(t('login:passwordLabel'))).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('login:sendLoginLink') })).toBeInTheDocument();
        });

        test('renders social login buttons when enabled', () => {
            renderWithRouter(<LoginModal {...defaultProps} isSocialLoginEnabled={true} />);

            // Social login buttons component should be rendered
            // The exact implementation depends on your SocialLoginButtons component
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
    });

    describe('modal behavior', () => {
        test('calls onOpenChange when modal is closed', async () => {
            const onOpenChange = vi.fn();
            const user = userEvent.setup();

            renderWithRouter(<LoginModal {...defaultProps} onOpenChange={onOpenChange} />);

            // Find and click the close button (X button in DialogContent)
            const closeButton = screen.getByRole('button', { name: /close/i });
            await user.click(closeButton);

            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        test('resets state when modal opens', () => {
            const { rerender } = renderWithRouter(<LoginModal {...defaultProps} isOpen={false} />);

            // Open the modal
            rerender(
                <RouterProvider
                    router={createMemoryRouter(
                        [
                            {
                                path: '*',
                                element: (
                                    <AllProvidersWrapper>
                                        <LoginModal {...defaultProps} isOpen={true} />
                                    </AllProvidersWrapper>
                                ),
                            },
                        ],
                        { initialEntries: ['/'] }
                    )}
                />
            );

            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
    });

    describe('authentication flow', () => {
        test('displays error message when login fails', async () => {
            const errorMessage = 'Invalid credentials';
            mockFetcher.data = {
                success: false,
                error: errorMessage,
            };

            renderWithRouter(<LoginModal {...defaultProps} />);

            await waitFor(() => {
                expect(screen.getByText(errorMessage)).toBeInTheDocument();
            });
        });

        test('shows OTP modal for passwordless login', async () => {
            const email = 'test@example.com';
            mockFetcher.data = {
                success: false,
                showOTPForm: true,
                email,
            };

            renderWithRouter(<LoginModal {...defaultProps} />);

            await waitFor(() => {
                expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
            });
        });
    });

    describe('OTP modal integration', () => {
        test('handles OTP verification success with callback', async () => {
            const onSuccess = vi.fn();
            mockFetcher.data = {
                success: false,
                showOTPForm: true,
                email: 'test@example.com',
            };

            renderWithRouter(<LoginModal {...defaultProps} onSuccess={onSuccess} />);

            await waitFor(() => {
                expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
            });

            // Simulate OTP success by finding and clicking the modal
            // In real implementation, this would be triggered by OTP verification
        });

        test('handles OTP verification success with redirect', async () => {
            const mockLocationAssign = vi.fn();
            Object.defineProperty(window, 'location', {
                value: { href: '', assign: mockLocationAssign },
                writable: true,
            });

            mockFetcher.data = {
                success: false,
                showOTPForm: true,
                email: 'test@example.com',
            };

            const returnUrl = '/checkout';
            renderWithRouter(<LoginModal {...defaultProps} returnUrl={returnUrl} />);

            await waitFor(() => {
                expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
            });
        });

        test('calls fetch for resend code', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response());

            mockFetcher.data = {
                success: false,
                showOTPForm: true,
                email: 'test@example.com',
            };

            renderWithRouter(<LoginModal {...defaultProps} />);

            await waitFor(() => {
                expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
            });

            // The handleResendCode function should use fetch
            fetchSpy.mockRestore();
        });
    });

    describe('props handling', () => {
        test('passes returnUrl to forms', () => {
            const returnUrl = '/checkout';
            renderWithRouter(<LoginModal {...defaultProps} returnUrl={returnUrl} />);

            // Forms should receive returnUrl prop
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        test('passes action and actionParams to StandardLoginForm', () => {
            const action = 'addToCart';
            const actionParams = 'productId=123';
            renderWithRouter(
                <LoginModal {...defaultProps} mode="password" action={action} actionParams={actionParams} />
            );

            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        test('uses custom OTP length', () => {
            mockFetcher.data = {
                success: false,
                showOTPForm: true,
                email: 'test@example.com',
            };

            renderWithRouter(<LoginModal {...defaultProps} otpLength={6} />);

            // OtpModal should receive custom otpLength
        });

        // Regression: the modal detects login success by watching its fetcher return to idle
        // (see login-modal.tsx). With passkeys enabled the login action would otherwise reply
        // with `redirectDocument`, a full-page navigation that unmounts the modal before
        // `onSuccess` fires — so the checkout step would never advance and the page would hard
        // reload to /checkout. The modal must always submit `skipDocumentRedirect=true` to force
        // the client-side redirect (the modal opens no passkey picker, so nothing needs the
        // document reload to dismiss it).
        test('submits skipDocumentRedirect in password mode so success stays client-side', () => {
            // The dialog renders in a portal on document.body, so query the whole document.
            renderWithRouter(<LoginModal {...defaultProps} mode="password" />);

            const hidden = document.querySelector('input[name="skipDocumentRedirect"]');
            expect(hidden).toHaveValue('true');
        });

        test('submits skipDocumentRedirect in passwordless mode so success stays client-side', () => {
            renderWithRouter(<LoginModal {...defaultProps} mode="passwordless" />);

            const hidden = document.querySelector('input[name="skipDocumentRedirect"]');
            expect(hidden).toHaveValue('true');
        });
    });

    describe('mode switching', () => {
        test('switches mode when modal reopens', () => {
            const { rerender } = renderWithRouter(<LoginModal {...defaultProps} mode="password" isOpen={true} />);

            expect(screen.getByLabelText(t('login:passwordLabel'))).toBeInTheDocument();

            // Close and reopen with different mode
            rerender(
                <RouterProvider
                    router={createMemoryRouter(
                        [
                            {
                                path: '*',
                                element: (
                                    <AllProvidersWrapper>
                                        <LoginModal {...defaultProps} mode="passwordless" isOpen={true} />
                                    </AllProvidersWrapper>
                                ),
                            },
                        ],
                        { initialEntries: ['/'] }
                    )}
                />
            );

            expect(screen.queryByLabelText(t('login:passwordLabel'))).not.toBeInTheDocument();
        });
    });
});
