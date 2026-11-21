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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFetcher } from 'react-router';
import RegisterCustomerSelection from './register-customer-selection';
import { resourceRoutes } from '@/route-paths';

// Mock dependencies
vi.mock('react-router', () => ({
    useFormAction: () => '.',
    href: (path: string) => path,
    useFetcher: vi.fn(() => ({
        submit: vi.fn(),
        state: 'idle',
        data: undefined,
    })),
}));

vi.mock('@/providers/basket', () => ({
    useBasket: vi.fn(() => ({
        customerInfo: {
            email: 'test@example.com',
        },
    })),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: vi.fn(() => ({
        auth: {
            otpLength: 6,
        },
    })),
}));

vi.mock('@/components/login/otp-modal', () => ({
    default: vi.fn(() => <div data-testid="otp-modal">OTP Modal</div>),
}));

const checkoutTranslations: Record<string, string> = {
    'payment.saveForFutureUse': 'Save for future use',
    'payment.createAccountForFasterCheckout': 'Create an account for a faster checkout next time',
    'registration.accountCreatedTitle': 'Account Created',
    'registration.verified': 'Verified',
    'registration.accountCreatedDescription':
        "We've created and verified your account using the information from your order. Next time you checkout, just enter the code we send to log in - no password needed.",
    'registration.accountCreatedSuccess': 'Account created',
    'registration.checkboxExpandedDescription':
        "When you place your order, we create an account for you and save your payment information and other details for future purchases. During your next checkout, confirm your account using the code we'll send to you.",
    'registration.accountCreationLabel': 'Account creation',
    'registration.accountWillBeCreated': 'An account will be created',
    'registration.continueAsGuest': 'Continue as guest',
    'registration.emailNotFound': 'Email not found',
    'registration.initiationFailed': 'Initiation failed',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => checkoutTranslations[key] ?? key,
        i18n: {},
    }),
}));

describe('RegisterCustomerSelection', () => {
    let mockUseFetcher: ReturnType<typeof vi.fn>;
    let mockSubmit: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSubmit = vi.fn();
        mockUseFetcher = vi.fn(() => ({
            submit: mockSubmit,
            state: 'idle',
            data: undefined,
        }));

        vi.mocked(useFetcher).mockImplementation(mockUseFetcher as any);
    });

    test('renders component with correct elements', () => {
        render(<RegisterCustomerSelection />);

        // Should render checkbox
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).toHaveAttribute('id', 'create-account-checkbox');
    });

    test('checkbox has correct initial state', () => {
        render(<RegisterCustomerSelection />);

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();
    });

    test('initiates passwordless registration when checkbox is checked', async () => {
        const user = userEvent.setup();

        render(<RegisterCustomerSelection />);

        const checkbox = screen.getByRole('checkbox');

        // Click checkbox
        await user.click(checkbox);

        // Should have submitted registration form
        expect(mockSubmit).toHaveBeenCalledWith(
            expect.any(FormData),
            expect.objectContaining({
                method: 'POST',
                action: resourceRoutes.initiateCheckoutRegistration,
            })
        );
    });

    test('does not initiate registration when checkbox is unchecked', async () => {
        const user = userEvent.setup();
        const handleSaved = vi.fn();

        render(<RegisterCustomerSelection onSaved={handleSaved} />);

        const checkbox = screen.getByRole('checkbox');

        // Check then uncheck
        await user.click(checkbox);
        mockSubmit.mockClear();
        await user.click(checkbox);

        // Should not submit form when unchecking
        expect(mockSubmit).not.toHaveBeenCalled();
        expect(handleSaved).toHaveBeenLastCalledWith(false);
    });

    test('shows OTP modal after successful registration initiation', async () => {
        const user = userEvent.setup();

        const { rerender } = render(<RegisterCustomerSelection />);

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        // Mock successful response after click
        mockUseFetcher.mockReturnValue({
            submit: mockSubmit,
            state: 'idle',
            data: { success: true, email: 'test@example.com' },
        });

        // Trigger re-render to fire useEffect
        rerender(<RegisterCustomerSelection />);

        // OTP modal should be rendered
        await waitFor(() => {
            expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
        });
    });

    test('disables checkbox while submitting registration', () => {
        mockUseFetcher.mockReturnValue({
            submit: mockSubmit,
            state: 'submitting',
            data: undefined,
        });

        render(<RegisterCustomerSelection />);

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeDisabled();
    });

    test('handles registration failure gracefully', async () => {
        const user = userEvent.setup();
        const mockShowToast = vi.fn();

        // Start with no data so checkbox can be checked first
        mockUseFetcher.mockReturnValue({
            submit: mockSubmit,
            state: 'idle',
            data: undefined,
        });

        const { rerender } = render(<RegisterCustomerSelection showToast={mockShowToast} />);

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        // Now simulate fetcher returning error so useEffect processes it
        mockUseFetcher.mockReturnValue({
            submit: mockSubmit,
            state: 'idle',
            data: { success: false, error: { code: 'OPERATION_FAILED', message: 'Registration failed' } },
        });
        rerender(<RegisterCustomerSelection showToast={mockShowToast} />);

        // Should show error toast
        await waitFor(() => {
            expect(mockShowToast).toHaveBeenCalledWith('Initiation failed', 'error');
        });

        // Checkbox should be unchecked after error state (state updates async)
        await waitFor(
            () => {
                const currentCheckbox = screen.getByRole('checkbox');
                expect(currentCheckbox).not.toBeChecked();
            },
            { timeout: 2000 }
        );
    });

    test('works without optional callbacks', async () => {
        const user = userEvent.setup();

        // Should not throw when callbacks are not provided
        expect(() => render(<RegisterCustomerSelection />)).not.toThrow();

        const checkbox = screen.getByRole('checkbox');

        // Should be able to click without error
        await expect(user.click(checkbox)).resolves.not.toThrow();
    });

    test('shows error toast when email is missing from basket', async () => {
        const user = userEvent.setup();
        const mockShowToast = vi.fn();

        const { useBasket } = await import('@/providers/basket');
        vi.mocked(useBasket).mockReturnValue({
            customerInfo: {
                email: undefined,
            },
        } as any);

        render(<RegisterCustomerSelection showToast={mockShowToast} />);

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        // Should show error toast for missing email
        await waitFor(() => {
            expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/email/i), 'error');
        });

        // Checkbox should remain unchecked
        expect(checkbox).not.toBeChecked();
    });

    test('renders ToggleCard structure', () => {
        render(<RegisterCustomerSelection />);

        // Should have the toggle card with editing state
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeInTheDocument();

        // Should have label element connected to checkbox
        const label = document.querySelector('label[for="create-account-checkbox"]');
        expect(label).toBeInTheDocument();
    });

    test('renders success card after OTP verification with verified badge', async () => {
        const user = userEvent.setup();
        const mockShowToast = vi.fn();

        // Mock OTP modal component to trigger success
        const { default: OtpModal } = await import('@/components/login/otp-modal');
        vi.mocked(OtpModal).mockImplementation((props: any) => {
            return (
                <div data-testid="otp-modal">
                    <button onClick={() => props.onSuccess?.()}>Verify OTP</button>
                </div>
            );
        });

        mockUseFetcher.mockReturnValue({
            submit: vi.fn(),
            state: 'idle',
            data: { success: true, email: 'test@example.com' },
        });

        render(<RegisterCustomerSelection showToast={mockShowToast} />);

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        // Wait for OTP modal and verify
        await waitFor(() => {
            expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
        });

        const verifyButton = screen.getByText('Verify OTP');
        await user.click(verifyButton);

        // Should show success card with verified badge
        await waitFor(() => {
            expect(screen.getByText(/Account Created/i)).toBeInTheDocument();
            expect(screen.getAllByText(/Verified/i).length).toBeGreaterThanOrEqual(1);
        });

        // Original checkbox should no longer be visible
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    test('success card shows account creation description', async () => {
        const user = userEvent.setup();

        const { default: OtpModal } = await import('@/components/login/otp-modal');
        vi.mocked(OtpModal).mockImplementation((props: any) => {
            return (
                <div data-testid="otp-modal">
                    <button onClick={() => props.onSuccess?.()}>Verify OTP</button>
                </div>
            );
        });

        mockUseFetcher.mockReturnValue({
            submit: vi.fn(),
            state: 'idle',
            data: { success: true, email: 'test@example.com' },
        });

        render(<RegisterCustomerSelection />);

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        await waitFor(() => {
            expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
        });

        const verifyButton = screen.getByText('Verify OTP');
        await user.click(verifyButton);

        // Should show the description text
        await waitFor(() => {
            expect(screen.getByText(/verified your account using the information from your order/)).toBeInTheDocument();
        });
    });
});
