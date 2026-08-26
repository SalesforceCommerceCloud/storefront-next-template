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

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFetcher } from 'react-router';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { RequestCodeForm } from './request-code-form';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: vi.fn(),
    };
});

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: vi.fn(),
}));

vi.mock('@/components/security/turnstile-widget', () => ({
    TurnstileWidget: ({ onSuccess, enabled }: { onSuccess: (token: string) => void; enabled: boolean }) => {
        if (!enabled) return null;
        return (
            <div data-testid="turnstile-widget">
                <button type="button" onClick={() => onSuccess('mock-token')}>
                    Mock Solve
                </button>
            </div>
        );
    },
}));

vi.mock('@/components/link', () => ({
    Link: ({ to, children, className, 'aria-label': ariaLabel }: any) => (
        <a href={to} className={className} aria-label={ariaLabel}>
            {children}
        </a>
    ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                orderNumberLabel: 'Order Number',
                emailLabel: 'Email Address',
                submitRequestCode: 'Continue',
                errorInvalidInput: 'Please check your order number and email address.',
                errorApiUnavailable: 'Unable to process your request. Please try again later.',
                errorTurnstileFailed: 'Verification failed. Please try again.',
                errorScapiUnsupported: 'Guest order lookup is not available. Please contact support.',
                cooldownActive: `Please wait ${String(params?.seconds ?? 60)} seconds before requesting a new code.`,
                enterCodeDescription: `We've sent a verification code to ${String(params?.email ?? 'your email')}. Please enter it below.`,
                resend: 'Resend Code',
                // OrderLookupErrorMessage (rendered inside RequestCodeForm) uses colon-syntax multi-namespace keys
                'guestOrderLookup:errorInvalidInput': 'Please check your order number and email address.',
                'guestOrderLookup:errorApiUnavailable': 'Unable to process your request. Please try again later.',
                'guestOrderLookup:errorTurnstileFailed': 'Verification failed. Please try again.',
                'orderLookup:verify.errors.rateLimited': 'Too many requests. Please try again later.',
                'orderLookup:verify.errors.rateLimitedWithTime': `Too many requests. Please try again in ${String(params?.seconds ?? 60)} seconds.`,
                'orderLookup:verify.errors.scapiUnsupported':
                    'This feature is temporarily unavailable. Please try again later.',
                'orderLookup:verify.errors.featureDisabled': 'Guest order lookup is not available.',
                'orderLookup:verify.requestNewCode': 'Request a new code',
                'common:contactSupport': 'Contact customer service',
            };
            return translations[key] || key;
        },
    }),
}));

describe('RequestCodeForm', () => {
    let mockSubmit: Mock;
    let mockUseFetcher: Mock;

    beforeEach(() => {
        mockSubmit = vi.fn();
        mockUseFetcher = vi.fn(() => ({
            data: null,
            state: 'idle',
            submit: mockSubmit,
        }));

        (useFetcher as Mock).mockImplementation(mockUseFetcher);
        (useConfig as Mock).mockReturnValue({
            security: {
                turnstile: {
                    enabled: true,
                    sites: {
                        default: [
                            {
                                siteKey: 'test-site-key',
                                domains: ['localhost'],
                            },
                        ],
                    },
                },
            },
        });
    });

    it('renders order number and email inputs with Turnstile widget', () => {
        render(<RequestCodeForm />);

        expect(screen.getByLabelText('Order Number')).toBeInTheDocument();
        expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
        expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });

    it('submits to /action/order-lookup-request-code with correct formData keys', async () => {
        const user = userEvent.setup();
        render(<RequestCodeForm />);

        const orderNumberInput = screen.getByLabelText('Order Number');
        const emailInput = screen.getByLabelText('Email Address');

        await user.type(orderNumberInput, '12345678');
        await user.type(emailInput, 'test@example.com');
        await user.click(screen.getByText('Mock Solve'));
        await user.click(screen.getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });

        const [formData, options] = mockSubmit.mock.calls[0];
        expect(formData.get('orderNumber')).toBe('12345678');
        expect(formData.get('email')).toBe('test@example.com');
        expect(formData.get('turnstileToken')).toBe('mock-token');
        expect(options.action).toBe('/action/order-lookup-request-code');
        expect(options.method).toBe('post');
    });

    it('blocks submit and displays field error when validation fails', async () => {
        const user = userEvent.setup();
        render(<RequestCodeForm />);

        const orderNumberInput = screen.getByLabelText('Order Number');
        const emailInput = screen.getByLabelText('Email Address');

        // Invalid order number (too short)
        await user.type(orderNumberInput, '123');
        await user.tab();

        await waitFor(() => {
            expect(screen.getByText('Please check your order number and email address.')).toBeInTheDocument();
        });

        // Invalid email
        await user.type(emailInput, 'not-an-email');
        await user.tab();

        await waitFor(() => {
            expect(screen.getAllByText('Please check your order number and email address.')).toHaveLength(2);
        });

        // Try to submit
        await user.click(screen.getByRole('button', { name: /continue/i }));

        // Should not submit
        expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('switches to code-sent state on success response', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<RequestCodeForm />);

        const orderNumberInput = screen.getByLabelText('Order Number');
        const emailInput = screen.getByLabelText('Email Address');

        await user.type(orderNumberInput, '12345678');
        await user.type(emailInput, 'test@example.com');

        // Re-render with success response
        mockUseFetcher.mockReturnValue({
            data: { ok: true },
            state: 'idle',
            submit: mockSubmit,
        });
        (useFetcher as Mock).mockImplementation(mockUseFetcher);
        rerender(<RequestCodeForm />);

        await waitFor(() => {
            expect(screen.getByText(/We've sent a verification code to test@example.com/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
        });
    });

    it.each([
        ['VALIDATION', 'Please check your order number and email address.'],
        ['RATE_LIMITED', 'Too many requests. Please try again later.'],
        ['SCAPI_UNSUPPORTED', 'This feature is temporarily unavailable. Please try again later.'],
        ['REQUEST_FAILED', 'Unable to process your request. Please try again later.'],
        ['TURNSTILE_FAILED', 'Verification failed. Please try again.'],
        ['FEATURE_DISABLED', 'Guest order lookup is not available.'],
    ])('renders distinct error message for code %s', (code, expectedMessage) => {
        mockUseFetcher.mockReturnValue({
            data: { ok: false, code },
            state: 'idle',
            submit: mockSubmit,
        });

        render(<RequestCodeForm />);

        expect(screen.getByRole('alert')).toHaveTextContent(expectedMessage);
    });

    it('shows same codeSent state regardless of SCAPI order-not-found (enumeration defense)', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<RequestCodeForm />);

        const orderNumberInput = screen.getByLabelText('Order Number');
        const emailInput = screen.getByLabelText('Email Address');

        await user.type(orderNumberInput, 'NONEXISTENT');
        await user.type(emailInput, 'test@example.com');

        // Re-render with success response (G5 action returns ok:true even if order not found)
        mockUseFetcher.mockReturnValue({
            data: { ok: true },
            state: 'idle',
            submit: mockSubmit,
        });
        (useFetcher as Mock).mockImplementation(mockUseFetcher);
        rerender(<RequestCodeForm />);

        // Should show code-sent state (enumeration defense: no distinction for not-found)
        await waitFor(() => {
            expect(screen.getByText(/We've sent a verification code to test@example.com/i)).toBeInTheDocument();
        });
    });

    it('does not render Turnstile widget when disabled in config', () => {
        (useConfig as Mock).mockReturnValue({
            security: {
                turnstile: {
                    enabled: false,
                    sites: {},
                },
            },
        });

        render(<RequestCodeForm />);

        expect(screen.queryByTestId('turnstile-widget')).not.toBeInTheDocument();
    });

    it('does not include turnstileToken when Turnstile disabled', async () => {
        (useConfig as Mock).mockReturnValue({
            security: {
                turnstile: {
                    enabled: false,
                    sites: {},
                },
            },
        });

        const user = userEvent.setup();
        render(<RequestCodeForm />);

        const orderNumberInput = screen.getByLabelText('Order Number');
        const emailInput = screen.getByLabelText('Email Address');

        await user.type(orderNumberInput, '12345678');
        await user.type(emailInput, 'test@example.com');
        await user.click(screen.getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });

        const [formData] = mockSubmit.mock.calls[0];
        expect(formData.get('turnstileToken')).toBeNull();
    });

    it('calls onCodeSent exactly once even when the parent re-renders with the same fetcher.data', async () => {
        const user = userEvent.setup();
        const mockOnCodeSent = vi.fn();
        const { rerender } = render(<RequestCodeForm onCodeSent={mockOnCodeSent} />);

        const orderNumberInput = screen.getByLabelText('Order Number');
        const emailInput = screen.getByLabelText('Email Address');

        await user.type(orderNumberInput, '12345678');
        await user.type(emailInput, 'test@example.com');

        const successData = { ok: true };
        mockUseFetcher.mockReturnValue({
            data: successData,
            state: 'idle',
            submit: mockSubmit,
        });
        (useFetcher as Mock).mockImplementation(mockUseFetcher);

        // Simulate the parent (_app.order-lookup._index.tsx) re-rendering with a new
        // onCodeSent closure on every render — e.g. because navigate() triggered
        // a route re-render — without fetcher.data itself changing.
        rerender(<RequestCodeForm onCodeSent={mockOnCodeSent} />);
        rerender(<RequestCodeForm onCodeSent={vi.fn()} />);
        rerender(<RequestCodeForm onCodeSent={mockOnCodeSent} />);

        await waitFor(() => {
            expect(mockOnCodeSent).toHaveBeenCalledTimes(1);
        });
    });

    it('disables submit button while submitting', () => {
        mockUseFetcher.mockReturnValue({
            data: null,
            state: 'submitting',
            submit: mockSubmit,
        });

        render(<RequestCodeForm />);

        const submitButton = screen.getByRole('button', { name: /continue/i });
        expect(submitButton).toBeDisabled();
    });
});
