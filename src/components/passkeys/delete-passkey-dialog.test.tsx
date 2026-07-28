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
import { DeletePasskeyDialog } from './delete-passkey-dialog';
import type { PasskeyCredential } from './passkey-card';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

describe('DeletePasskeyDialog', () => {
    const mockCredential: PasskeyCredential = {
        credentialId: 'cred-1',
        nickName: 'MacBook Pro — Chrome',
    };

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        credential: mockCredential,
        onConfirm: vi.fn(),
    };

    test('renders dialog with credential name when open and a credential is set', () => {
        render(<DeletePasskeyDialog {...defaultProps} />);

        expect(screen.getByText(t('account:passkeys.deleteDialogTitle'))).toBeInTheDocument();
        expect(
            screen.getByText(t('account:passkeys.deleteDialogDescription', { name: 'MacBook Pro — Chrome' }))
        ).toBeInTheDocument();
    });

    test('renders nothing when credential is null', () => {
        render(<DeletePasskeyDialog {...defaultProps} credential={null} />);

        expect(screen.queryByText(t('account:passkeys.deleteDialogTitle'))).not.toBeInTheDocument();
    });

    test('calls onOpenChange when cancel is clicked', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();

        render(<DeletePasskeyDialog {...defaultProps} onOpenChange={onOpenChange} />);

        await user.click(screen.getByText(t('account:common.cancel')));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('calls onConfirm with the credentialId when confirm is clicked', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();

        render(<DeletePasskeyDialog {...defaultProps} onConfirm={onConfirm} />);

        await user.click(screen.getByText(t('account:passkeys.deleteConfirm')));
        expect(onConfirm).toHaveBeenCalledWith('cred-1');
    });

    test('disables actions and shows loading label while isLoading', () => {
        render(<DeletePasskeyDialog {...defaultProps} isLoading />);

        expect(screen.getByText(t('account:passkeys.deleting'))).toBeInTheDocument();
        expect(screen.getByText(t('account:common.cancel'))).toBeDisabled();
    });
});
