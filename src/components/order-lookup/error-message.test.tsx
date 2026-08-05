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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OrderLookupErrorMessage } from './error-message';

// Mock i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { seconds?: number }) => {
            const translations: Record<string, string> = {
                'guestOrderLookup:errorInvalidInput': 'Please check your order number and email address.',
                'guestOrderLookup:errorTurnstileFailed': 'Verification failed. Please try again.',
                'orderLookup:verify.errors.rateLimited': 'Too many requests. Please try again later.',
                'orderLookup:verify.errors.rateLimitedWithTime': `Too many requests. Please try again in ${options?.seconds} seconds.`,
                'orderLookup:verify.errors.invalidCode':
                    'The code you entered is invalid or has expired. Please try again or request a new code.',
                'orderLookup:verify.errors.attemptsExceeded':
                    'Maximum verification attempts exceeded. Please request a new code.',
                'orderLookup:verify.errors.scapiUnsupported':
                    'This feature is temporarily unavailable. Please try again later.',
                'guestOrderLookup:errorApiUnavailable': 'Unable to process your request. Please try again later.',
                'orderLookup:verify.errors.featureDisabled': 'Guest order lookup is not available.',
                'orderLookup:verify.requestNewCode': 'Request a new code',
                'orderLookup:verify.retryVerification': 'Retry verification',
                'common:contactSupport': 'Contact customer service',
            };
            return translations[key] || key;
        },
    }),
}));

// Mock Link component
vi.mock('@/components/link', () => ({
    Link: ({ to, children, className, 'aria-label': ariaLabel }: any) => (
        <a href={to} className={className} aria-label={ariaLabel}>
            {children}
        </a>
    ),
}));

describe('OrderLookupErrorMessage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ['VALIDATION', 'Please check your order number and email address.'],
        ['TURNSTILE_FAILED', 'Verification failed. Please try again.'],
        ['REQUEST_FAILED', 'Unable to process your request. Please try again later.'],
        ['LOOKUP_FAILED', 'Unable to process your request. Please try again later.'],
        ['FEATURE_DISABLED', 'Guest order lookup is not available.'],
        ['SCAPI_UNSUPPORTED', 'This feature is temporarily unavailable. Please try again later.'],
    ])('renders correct message for %s error code', (code, expectedMessage) => {
        render(<OrderLookupErrorMessage code={code} />);
        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });

    it('renders INVALID_CODE without distinguishing from not found (enumeration defense)', () => {
        render(<OrderLookupErrorMessage code="INVALID_CODE" />);
        const message = screen.getByText(/invalid or has expired/i);
        expect(message).toBeInTheDocument();
        // Message is generic — doesn't reveal whether code exists
    });

    it('renders countdown for RATE_LIMITED with retryAfterSeconds', () => {
        render(<OrderLookupErrorMessage code="RATE_LIMITED" retryAfterSeconds={30} />);

        expect(screen.getByText('Too many requests. Please try again in 30 seconds.')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.getByText('Too many requests. Please try again in 29 seconds.')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.getByText('Too many requests. Please try again in 28 seconds.')).toBeInTheDocument();
    });

    it('renders generic RATE_LIMITED message without retryAfterSeconds', () => {
        render(<OrderLookupErrorMessage code="RATE_LIMITED" />);
        expect(screen.getByText('Too many requests. Please try again later.')).toBeInTheDocument();
    });

    it('renders CTA button for ATTEMPTS_EXCEEDED', () => {
        const onRequestNewCode = vi.fn();

        render(<OrderLookupErrorMessage code="ATTEMPTS_EXCEEDED" onRequestNewCode={onRequestNewCode} />);

        const button = screen.getByRole('button', { name: 'Request a new code' });
        expect(button).toBeInTheDocument();

        button.click();
        expect(onRequestNewCode).toHaveBeenCalledOnce();
    });

    it('renders support link for SCAPI_UNSUPPORTED', () => {
        render(<OrderLookupErrorMessage code="SCAPI_UNSUPPORTED" />);

        const link = screen.getByRole('link', { name: 'Contact customer service' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/customer-service');
    });

    it('renders support link for FEATURE_DISABLED', () => {
        render(<OrderLookupErrorMessage code="FEATURE_DISABLED" />);

        const link = screen.getByRole('link', { name: 'Contact customer service' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/customer-service');
    });

    it('sets role=alert when submitBlocking is true', () => {
        const { container } = render(<OrderLookupErrorMessage code="VALIDATION" submitBlocking={true} />);
        const alertDiv = container.querySelector('[role="alert"]');
        expect(alertDiv).toBeInTheDocument();
    });

    it('sets aria-live=polite when submitBlocking is false (default)', () => {
        const { container } = render(<OrderLookupErrorMessage code="VALIDATION" />);
        const liveDiv = container.querySelector('[aria-live="polite"]');
        expect(liveDiv).toBeInTheDocument();
    });

    it('falls through to generic error for unknown code', () => {
        render(<OrderLookupErrorMessage code="UNKNOWN_ERROR" />);
        expect(screen.getByText('Unable to process your request. Please try again later.')).toBeInTheDocument();
    });

    it('does not expose raw error strings for unknown codes', () => {
        const { container } = render(<OrderLookupErrorMessage code="INTERNAL_SERVER_ERROR_500" />);
        expect(container.textContent).not.toContain('INTERNAL_SERVER_ERROR_500');
        expect(screen.getByText('Unable to process your request. Please try again later.')).toBeInTheDocument();
    });
});
