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
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { accountDestructiveButtonClasses } from '@/lib/account-action-styles';
import { getCardIcon } from '@/lib/payment/card-icon-utils';
import { getCardTypeDisplay } from '@/lib/payment/payment-utils';
import type { ShopperBasketsV2 } from '@/scapi';
import type { PaymentMethod } from './payment-method-card';

export interface RemovePaymentMethodDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    paymentMethod: PaymentMethod | null;
    onConfirm: (paymentInstrumentId: string) => void;
    isLoading?: boolean;
}

/**
 * Remove payment method confirmation dialog
 */
export function RemovePaymentMethodDialog({
    open,
    onOpenChange,
    paymentMethod,
    onConfirm,
    isLoading = false,
}: RemovePaymentMethodDialogProps): ReactElement | null {
    const { t } = useTranslation('account');

    const handleClose = () => {
        if (!isLoading) {
            onOpenChange(false);
        }
    };

    const handleConfirm = () => {
        if (paymentMethod?.id && !isLoading) {
            onConfirm(paymentMethod.id);
        }
    };

    if (!paymentMethod) return null;

    // Use lib utility to normalize card type
    const displayName = getCardTypeDisplay({
        paymentCard: { cardType: paymentMethod.type },
    } as ShopperBasketsV2.schemas['OrderPaymentInstrument']);
    const CardIcon = getCardIcon(displayName);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-lg font-semibold text-foreground">
                        {t('paymentMethods.removePaymentMethod')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t('paymentMethods.removeConfirmation')}</p>

                    <Card className="rounded-ui border-border bg-muted/60 py-0">
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{t('paymentMethods.paymentMethod')}</span>
                                <div className="flex items-center" aria-hidden="true">
                                    <CardIcon width={40} height={32} className="max-w-[40px] max-h-[32px]" />
                                </div>
                            </div>
                            <p className="text-base font-semibold mb-1">
                                {displayName} **** {paymentMethod.last4}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {paymentMethod.expiryMonth}/{paymentMethod.expiryYear} | {paymentMethod.cardholderName}
                            </p>
                            {paymentMethod.isDefault && (
                                <div className="mt-2">
                                    <span className="px-2 py-0.5 bg-muted border border-border text-primary text-xs font-semibold rounded-ui">
                                        {t('paymentMethods.default')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Card>

                    {paymentMethod.isDefault && (
                        <div className="mt-4 flex gap-3 p-3 bg-warning-bg border border-warning-border">
                            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" aria-hidden />
                            <p className="text-xs text-warning-foreground">
                                {t('paymentMethods.defaultRemovalWarning')}
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                        {t('paymentMethods.cancel')}
                    </Button>
                    <Button className={accountDestructiveButtonClasses} onClick={handleConfirm} disabled={isLoading}>
                        {t('paymentMethods.remove')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
