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
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { PostOrderRegistration } from './post-order-registration';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { resourceRoutes } from '@/route-paths';

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    })),
}));

const defaultProps = {
    email: 'guest@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    orderNo: '00012345',
};

function renderComponent(props = defaultProps) {
    const Stub = createRoutesStub([
        {
            path: '/',
            Component: () => <PostOrderRegistration {...props} />,
        },
        {
            path: resourceRoutes.postOrderRegister,
            action: () => ({ success: false }),
        },
    ]);
    return render(
        <AllProvidersWrapper>
            <Stub initialEntries={['/']} />
        </AllProvidersWrapper>
    );
}

describe('PostOrderRegistration', () => {
    it('renders the registration card with email pre-filled and disabled', () => {
        renderComponent();

        const emailInput = screen.getByLabelText(/email/i);
        expect(emailInput).toHaveValue('guest@example.com');
        expect(emailInput).toBeDisabled();
    });

    it('renders password and confirm password fields', () => {
        renderComponent();

        expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    it('disables submit button when form is invalid', () => {
        renderComponent();

        const button = screen.getByRole('button', { name: /create account/i });
        expect(button).toBeDisabled();
    });

    it('enables submit button when passwords are valid and match', async () => {
        const user = userEvent.setup();
        renderComponent();

        const passwordInput = screen.getByLabelText(/^password/i);
        const confirmInput = screen.getByLabelText(/confirm/i);

        await user.type(passwordInput, 'StrongPass1!');
        await user.type(confirmInput, 'StrongPass1!');

        const button = screen.getByRole('button', { name: /create account/i });
        expect(button).toBeEnabled();
    });

    it('shows password mismatch message when passwords differ', async () => {
        const user = userEvent.setup();
        renderComponent();

        const passwordInput = screen.getByLabelText(/^password/i);
        const confirmInput = screen.getByLabelText(/confirm/i);

        await user.type(passwordInput, 'StrongPass1!');
        await user.type(confirmInput, 'Different1!');

        expect(screen.getByText(/do not match|mismatch/i)).toBeInTheDocument();
    });

    it('always shows all password requirements', () => {
        renderComponent();

        // All 5 requirements are always visible
        expect(screen.getAllByTestId('x-icon').length).toBe(5);
    });

    it('marks met requirements with check icon when typing', async () => {
        const user = userEvent.setup();
        renderComponent();

        const passwordInput = screen.getByLabelText(/^password/i);
        await user.type(passwordInput, 'Abcdefgh1!');

        // All requirements met — all items should show check icons
        expect(screen.getAllByTestId('check-icon').length).toBe(5);
        expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument();
    });

    it('renders the form with action pointing to post-order-register', () => {
        renderComponent();

        const form = screen.getByRole('button', { name: /create account/i }).closest('form');
        expect(form).toHaveAttribute('action', resourceRoutes.postOrderRegister);
    });

    it('keeps a status live region present but empty while the form is shown', () => {
        renderComponent();

        // The polite live region must exist (empty) before success so the later message is
        // written into an existing node and gets announced, rather than mounting pre-filled.
        const liveRegion = screen.getByRole('status');
        expect(liveRegion).toBeInTheDocument();
        expect(liveRegion).toHaveTextContent('');
    });

    it('fills the status live region with the success message on success', () => {
        const Stub = createRoutesStub([
            {
                path: '/',
                Component: () => <PostOrderRegistration {...defaultProps} defaultSuccess />,
            },
        ]);
        render(
            <AllProvidersWrapper>
                <Stub initialEntries={['/']} />
            </AllProvidersWrapper>
        );

        const liveRegion = screen.getByRole('status');
        expect(liveRegion).toHaveTextContent(/account created/i);
        expect(liveRegion).toHaveTextContent(/guest@example\.com/i);
    });

    it('includes hidden fields for firstName, lastName, and orderNo', () => {
        renderComponent();

        const form = screen.getByRole('button', { name: /create account/i }).closest('form');
        expect(form).toBeInTheDocument();

        const hiddenEmail = form?.querySelector('input[name="email"][type="hidden"]');
        expect(hiddenEmail).toHaveValue('guest@example.com');

        const hiddenFirstName = form?.querySelector('input[name="firstName"][type="hidden"]');
        expect(hiddenFirstName).toHaveValue('Jane');

        const hiddenLastName = form?.querySelector('input[name="lastName"][type="hidden"]');
        expect(hiddenLastName).toHaveValue('Doe');

        const hiddenOrderNo = form?.querySelector('input[name="orderNo"][type="hidden"]');
        expect(hiddenOrderNo).toHaveValue('00012345');
    });
});
