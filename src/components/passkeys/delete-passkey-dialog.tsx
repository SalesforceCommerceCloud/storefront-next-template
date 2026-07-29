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
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { accountDestructiveButtonClasses } from '@/lib/account-action-styles';
import type { PasskeyCredential } from './passkey-card';

export interface DeletePasskeyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    credential: PasskeyCredential | null;
    onConfirm: (credentialId: string) => void;
    isLoading?: boolean;
}

/**
 * Confirmation dialog for deleting a single passkey credential.
 */
export function DeletePasskeyDialog({
    open,
    onOpenChange,
    credential,
    onConfirm,
    isLoading = false,
}: DeletePasskeyDialogProps): ReactElement | null {
    const { t } = useTranslation('account');

    const handleClose = () => {
        if (!isLoading) {
            onOpenChange(false);
        }
    };

    const handleConfirm = () => {
        if (credential?.credentialId && !isLoading) {
            onConfirm(credential.credentialId);
        }
    };

    if (!credential) return null;

    const displayName = credential.nickName || t('passkeys.unnamedPasskey');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-lg font-semibold text-foreground">
                        {t('passkeys.deleteDialogTitle')}
                    </DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    {t('passkeys.deleteDialogDescription', { name: displayName })}
                </p>

                <div className="flex items-center justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                        {t('common.cancel')}
                    </Button>
                    <Button className={accountDestructiveButtonClasses} onClick={handleConfirm} disabled={isLoading}>
                        {isLoading ? t('passkeys.deleting') : t('passkeys.deleteConfirm')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
