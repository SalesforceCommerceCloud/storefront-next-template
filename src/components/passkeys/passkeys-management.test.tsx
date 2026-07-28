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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { PasskeysManagement } from './passkeys-management';
import type { PasskeyCredential } from './passkey-card';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

const submitMock = vi.fn();
const openModalMock = vi.fn();
const addToastMock = vi.fn();

// Mutable so individual tests can flip WebAuthn support and the authenticated user off.
let isSupported = true;
let mockAuth: { encUserId?: string } | null = { encUserId: 'enc-user-1' };

vi.mock('./passkey-card', () => ({
    PasskeyCard: ({
        credential,
        onRemove,
        isNew,
    }: {
        credential: { credentialId?: string };
        onRemove?: () => void;
        isNew?: boolean;
    }) => (
        <div data-testid="passkey-card">
            {credential.credentialId}
            {isNew && <span data-testid={`new-badge-${credential.credentialId}`}>new</span>}
            <button onClick={onRemove}>remove-{credential.credentialId}</button>
        </div>
    ),
}));

vi.mock('./delete-passkey-dialog', () => ({
    DeletePasskeyDialog: ({
        credential,
        onConfirm,
    }: {
        credential: { credentialId?: string } | null;
        onConfirm: (id: string) => void;
    }) =>
        credential ? (
            <div data-testid="delete-dialog">
                <button onClick={() => onConfirm(credential.credentialId ?? '')}>confirm-delete</button>
            </div>
        ) : null,
}));

vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useFetcher: () => ({ state: 'idle', data: null, submit: submitMock }),
    };
});

// jsdom has no WebAuthn API, so isPasskeyRegistrationSupported() would report false and the
// add-passkey entry point would short-circuit before opening the modal. Drive it from a flag.
vi.mock('@/lib/auth/webauthn', () => ({
    isPasskeyRegistrationSupported: () => isSupported,
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: addToastMock }),
}));

vi.mock('@/providers/passkey-registration', () => ({
    usePasskeyRegistrationContext: () => ({ openModal: openModalMock, isOpen: false, closeModal: vi.fn() }),
}));

vi.mock('@/providers/auth', () => ({
    useAuth: () => mockAuth,
}));

vi.mock('@/targets/ui-target', () => ({
    UITarget: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('PasskeysManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isSupported = true;
        mockAuth = { encUserId: 'enc-user-1' };
    });

    const mockCredentials: PasskeyCredential[] = [
        { credentialId: 'cred-1', nickName: 'MacBook Pro' },
        { credentialId: 'cred-2', nickName: 'iPhone' },
    ];

    test('renders page header and passkey list', () => {
        render(<PasskeysManagement credentials={mockCredentials} />);

        expect(screen.getByText(t('account:passkeys.pageTitle'))).toBeInTheDocument();
        expect(screen.getAllByTestId('passkey-card')).toHaveLength(2);
    });

    test('renders empty state when there are no credentials', () => {
        render(<PasskeysManagement credentials={[]} />);

        expect(screen.getByText(t('account:passkeys.empty'))).toBeInTheDocument();
        expect(screen.queryByTestId('passkey-card')).not.toBeInTheDocument();
    });

    test('calls openModal with the encoded user id when add passkey is clicked', async () => {
        const user = userEvent.setup();
        render(<PasskeysManagement credentials={mockCredentials} />);

        await user.click(screen.getByText(t('account:passkeys.addPasskey')));
        expect(openModalMock).toHaveBeenCalledWith('enc-user-1', { suppressSuccessToast: true });
    });

    test('shows an error toast and does not open the modal when the browser lacks WebAuthn support', async () => {
        isSupported = false;
        const user = userEvent.setup();
        render(<PasskeysManagement credentials={mockCredentials} />);

        await user.click(screen.getByText(t('account:passkeys.addPasskey')));
        expect(openModalMock).not.toHaveBeenCalled();
        expect(addToastMock).toHaveBeenCalledWith(t('account:passkeys.unsupportedBrowser'), 'error');
    });

    test('shows an error toast and does not open the modal when there is no encoded user id', async () => {
        mockAuth = {};
        const user = userEvent.setup();
        render(<PasskeysManagement credentials={mockCredentials} />);

        await user.click(screen.getByText(t('account:passkeys.addPasskey')));
        expect(openModalMock).not.toHaveBeenCalled();
        expect(addToastMock).toHaveBeenCalledWith(t('account:passkeys.addError'), 'error');
    });

    test('opens the delete dialog and submits the fetcher when a card requests removal', async () => {
        const user = userEvent.setup();
        render(<PasskeysManagement credentials={mockCredentials} />);

        await user.click(screen.getByText('remove-cred-1'));
        expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();

        await user.click(screen.getByText('confirm-delete'));
        expect(submitMock).toHaveBeenCalledWith(expect.any(FormData), expect.objectContaining({ method: 'POST' }));
    });

    test('does not mark initially-loaded credentials as new', () => {
        render(<PasskeysManagement credentials={mockCredentials} />);

        expect(screen.queryByTestId('new-badge-cred-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('new-badge-cred-2')).not.toBeInTheDocument();
    });

    test('marks a credential added after the initial render as new, until the component remounts (reload)', () => {
        const { rerender, unmount } = render(<PasskeysManagement credentials={mockCredentials} />);

        const withNewCredential = [
            ...mockCredentials,
            { credentialId: 'cred-3', nickName: 'iPad' } as PasskeyCredential,
        ];
        rerender(<PasskeysManagement credentials={withNewCredential} />);

        expect(screen.getByTestId('new-badge-cred-3')).toBeInTheDocument();
        expect(screen.queryByTestId('new-badge-cred-1')).not.toBeInTheDocument();

        // Simulating a page reload: unmount and remount with the same credentials
        // now returned by the server — the "new" signal must not survive.
        unmount();
        render(<PasskeysManagement credentials={withNewCredential} />);

        expect(screen.queryByTestId('new-badge-cred-3')).not.toBeInTheDocument();
    });
});
