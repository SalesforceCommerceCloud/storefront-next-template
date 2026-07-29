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
import { describe, test, expect, vi } from 'vitest';
import { PasskeyCard, type PasskeyCredential } from './passkey-card';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

describe('PasskeyCard', () => {
    const mockCredential: PasskeyCredential = {
        credentialId: 'cred-1',
        nickName: 'MacBook Pro — Chrome',
    };

    test('renders the passkey nickname', () => {
        render(<PasskeyCard credential={mockCredential} />);

        expect(screen.getByText('MacBook Pro — Chrome')).toBeInTheDocument();
    });

    test('falls back to unnamed passkey label when nickName is missing', () => {
        const unnamedCredential: PasskeyCredential = { credentialId: 'cred-2' };
        render(<PasskeyCard credential={unnamedCredential} />);

        expect(screen.getByText(t('account:passkeys.unnamedPasskey'))).toBeInTheDocument();
    });

    test('calls onRemove when delete button is clicked', async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn();

        render(<PasskeyCard credential={mockCredential} onRemove={onRemove} />);

        await user.click(
            screen.getByRole('button', {
                name: t('account:passkeys.deletePasskeyAriaLabel', { name: 'MacBook Pro — Chrome' }),
            })
        );

        expect(onRemove).toHaveBeenCalledTimes(1);
    });

    test('shows the "New" badge and "Not used yet" for a freshly-created credential', () => {
        const freshCredential: PasskeyCredential = {
            credentialId: 'cred-3',
            nickName: 'iPhone',
            createdTime: '2026-07-16T10:00:00Z',
            uses: 0,
        };
        render(<PasskeyCard credential={freshCredential} isNew />);

        expect(screen.getByText(t('account:passkeys.newBadge'))).toBeInTheDocument();
        expect(screen.getByText(t('account:passkeys.notUsedYet'))).toBeInTheDocument();
        expect(screen.getByText(t('account:passkeys.uses', { count: 0 }))).toBeInTheDocument();
    });

    test('does not show the "New" badge for an unused credential once isNew is false (e.g. after reload)', () => {
        const staleUnusedCredential: PasskeyCredential = {
            credentialId: 'cred-5',
            nickName: 'iPhone',
            createdTime: '2026-07-16T10:00:00Z',
            uses: 0,
        };
        render(<PasskeyCard credential={staleUnusedCredential} />);

        expect(screen.queryByText(t('account:passkeys.newBadge'))).not.toBeInTheDocument();
        expect(screen.getByText(t('account:passkeys.notUsedYet'))).toBeInTheDocument();
    });

    test('shows created date, last-used date, and use count once the credential has been used', () => {
        const usedCredential: PasskeyCredential = {
            credentialId: 'cred-4',
            nickName: 'iPad',
            createdTime: '2026-06-01T10:15:30Z',
            lastUsed: '2026-06-14T08:42:10Z',
            uses: 12,
        };
        render(<PasskeyCard credential={usedCredential} />);

        expect(screen.queryByText(t('account:passkeys.newBadge'))).not.toBeInTheDocument();
        expect(screen.queryByText(t('account:passkeys.notUsedYet'))).not.toBeInTheDocument();
        expect(screen.getByText(t('account:passkeys.uses', { count: 12 }))).toBeInTheDocument();
    });
});
