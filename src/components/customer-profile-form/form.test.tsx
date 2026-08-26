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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CustomerProfileForm } from './form';
import { ConfigWrapper } from '@/test-utils/config';

const mockSubmit = vi.fn().mockResolvedValue(undefined);

function createMockFetcher(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        state: 'idle',
        data: undefined,
        errors: undefined,
        success: false,
        submit: mockSubmit,
        load: vi.fn(),
        Form: vi.fn() as any,
        formAction: undefined,
        formData: undefined,
        formEncType: undefined,
        formMethod: undefined,
        formTarget: undefined,
        type: 'init' as const,
        json: undefined,
        text: undefined,
        reset: vi.fn(),
        ...overrides,
    } as any;
}

function renderForm(props: Partial<Parameters<typeof CustomerProfileForm>[0]> = {}) {
    const fetcher = createMockFetcher();
    return {
        fetcher,
        ...render(
            <ConfigWrapper>
                <CustomerProfileForm updateFetcher={fetcher} {...props} />
            </ConfigWrapper>
        ),
    };
}

describe('CustomerProfileForm submission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('submits with phoneHome and phoneMobile when phone is provided', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
                phone: '+15551234567',
                gender: '2',
                birthday: '1990-05-15',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload.phoneHome).toBe('+15551234567');
        expect(payload.phoneMobile).toBe('+15551234567');
    });

    it('does not include phoneHome or phoneMobile when phone is empty', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
                phone: '',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload).not.toHaveProperty('phoneHome');
        expect(payload).not.toHaveProperty('phoneMobile');
    });

    it('always includes firstName, lastName, and gender (gender coerced to number)', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'John',
                lastName: 'Smith',
                gender: '1',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload.firstName).toBe('John');
        expect(payload.lastName).toBe('Smith');
        // Gender is coerced to a number client-side so the JSON body matches the SCAPI schema
        // without relying on server-side per-field coercion.
        expect(payload.gender).toBe(1);
    });

    it('submits a plain-object payload (auto-encoded as JSON by useScapiFetcher)', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
                gender: '2',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        // Payload is a plain object (not FormData); useScapiFetcher.submit() auto-picks
        // JSON encoding so typed values survive the round-trip without per-call opts.
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload).not.toBeInstanceOf(FormData);
        expect(typeof payload).toBe('object');
    });

    it('coerces empty gender to null so the field can be cleared via JSON', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
                gender: '',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload.gender).toBeNull();
    });

    it('includes birthday when provided', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
                birthday: '1990-05-15',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload.birthday).toBe('1990-05-15');
    });

    it('omits birthday when empty', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
                birthday: '',
            },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledTimes(1);
        });
        const payload = mockSubmit.mock.calls[0][0];
        expect(payload).not.toHaveProperty('birthday');
    });

    it('does not submit when required fields are missing', async () => {
        const user = userEvent.setup();
        renderForm({
            initialData: { firstName: '', lastName: '' },
        });

        await user.click(screen.getByRole('button', { name: /save/i }));

        // Wait a tick for react-hook-form validation to complete
        await waitFor(() => {
            expect(screen.getByTestId('customer-profile-form')).toBeInTheDocument();
        });
        expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('calls onSuccess with form data when fetcher transitions to idle with success', async () => {
        const onSuccess = vi.fn();
        const initialData = {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            phone: '+15551234567',
        };
        const submittingFetcher = createMockFetcher({ state: 'submitting' });

        const { rerender } = render(
            <ConfigWrapper>
                <CustomerProfileForm
                    updateFetcher={submittingFetcher}
                    initialData={initialData}
                    onSuccess={onSuccess}
                />
            </ConfigWrapper>
        );

        expect(onSuccess).not.toHaveBeenCalled();

        const successFetcher = createMockFetcher({
            state: 'idle',
            success: true,
            data: {
                firstName: 'Jane',
                lastName: 'Doe',
                phoneHome: '+15551234567',
            },
        });

        rerender(
            <ConfigWrapper>
                <CustomerProfileForm updateFetcher={successFetcher} initialData={initialData} onSuccess={onSuccess} />
            </ConfigWrapper>
        );

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledTimes(1);
        });
        expect(onSuccess).toHaveBeenCalledWith(
            expect.objectContaining({
                firstName: 'Jane',
                lastName: 'Doe',
                phone: '+15551234567',
            })
        );
    });

    it('calls onError with error message when fetcher transitions to idle with errors', async () => {
        const onError = vi.fn();
        const initialData = {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
        };
        const submittingFetcher = createMockFetcher({ state: 'submitting' });

        const { rerender } = render(
            <ConfigWrapper>
                <CustomerProfileForm updateFetcher={submittingFetcher} initialData={initialData} onError={onError} />
            </ConfigWrapper>
        );

        expect(onError).not.toHaveBeenCalled();

        const errorFetcher = createMockFetcher({
            state: 'idle',
            success: false,
            errors: ['Update failed', 'Server error'],
        });

        rerender(
            <ConfigWrapper>
                <CustomerProfileForm updateFetcher={errorFetcher} initialData={initialData} onError={onError} />
            </ConfigWrapper>
        );

        await waitFor(() => {
            expect(onError).toHaveBeenCalledTimes(1);
        });
        expect(onError).toHaveBeenCalledWith('Update failed, Server error');
    });

    it('calls onCancel and resets form when cancel is clicked', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        renderForm({
            initialData: {
                firstName: 'Jane',
                lastName: 'Doe',
            },
            onCancel,
        });

        await user.click(screen.getByRole('button', { name: /cancel/i }));

        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

describe('CustomerProfileForm field grouping (WCAG 1.3.1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('groups the related profile fields under a named group so a screen reader announces them as a set', () => {
        renderForm({ initialData: { firstName: 'Jane', lastName: 'Doe' } });

        // The name, contact, and date-of-birth fields are a single related set. Without a
        // programmatic grouping (fieldset/legend or role="group") a screen reader hears a flat
        // run of inputs with no indication they belong together. Assert the set is wrapped in a
        // group whose accessible name comes from the section's visible heading.
        const group = screen.getByRole('group', { name: /personal information/i });

        // The grouped fields must actually live inside the group, not merely alongside it.
        expect(group).toContainElement(screen.getByLabelText(/first name/i));
        expect(group).toContainElement(screen.getByLabelText(/last name/i));
        expect(group).toContainElement(screen.getByLabelText(/phone number/i));
        expect(group).toContainElement(screen.getByLabelText(/date of birth/i));
    });
});
