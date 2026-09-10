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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCardIcon } from '@/lib/payment/card-icon-utils';
import { getCardTypeDisplay } from '@/lib/payment/payment-utils';
import type { ShopperBasketsV2 } from '@/scapi';

export interface PaymentMethod {
    id: string;
    /** Card brand (visa, mastercard, …) or `sepa_debit` for SEPA rows. */
    type: string;
    last4: string;
    expiryMonth: string;
    expiryYear: string;
    cardholderName: string;
    isDefault: boolean;
}

export interface PaymentMethodCardProps {
    paymentMethod: PaymentMethod;
    /** When set, shows Remove. Omit to hide (e.g. read-only rows). */
    onRemove?: () => void;
    /** When set, shows Set Default. Omit to hide (e.g. SFP SPMs until Set Default ships). */
    onSetDefault?: () => void;
}

function resolveDisplayName(
    paymentMethod: PaymentMethod,
    isSepa: boolean,
    sepaLabel: string,
    genericCardLabel: string
): string {
    if (isSepa) return sepaLabel;
    return getCardTypeDisplay(
        {
            paymentCard: { cardType: paymentMethod.type },
        } as ShopperBasketsV2.schemas['OrderPaymentInstrument'],
        genericCardLabel
    );
}

function buildDetailsLine(paymentMethod: PaymentMethod, isSepa: boolean, expiresLabel: string): string | null {
    if (isSepa) {
        return paymentMethod.cardholderName || null;
    }

    const expiry =
        paymentMethod.expiryMonth && paymentMethod.expiryYear
            ? `${expiresLabel} ${paymentMethod.expiryMonth}/${paymentMethod.expiryYear}`
            : null;
    const name = (paymentMethod.cardholderName ?? '').trim();

    if (expiry && name) return `${expiry} | ${name}`;
    if (expiry) return expiry;
    return name || null;
}

/**
 * Payment method card for My Account.
 * Action buttons follow callbacks: pass onRemove / onSetDefault only when that action is available.
 * Default pill follows paymentMethod.isDefault (SFP rows map isDefault: false).
 */
export function PaymentMethodCard({ paymentMethod, onRemove, onSetDefault }: PaymentMethodCardProps): ReactElement {
    const { t } = useTranslation('account');

    const isSepa = paymentMethod.type.toLowerCase() === 'sepa_debit';

    const displayName = resolveDisplayName(
        paymentMethod,
        isSepa,
        t('paymentMethods.sepaDebit', { defaultValue: 'SEPA Debit' }),
        t('paymentMethods.creditCard')
    );
    const CardIcon = getCardIcon(isSepa ? '' : displayName);
    const title = paymentMethod.last4.length > 0 ? `${displayName} **** ${paymentMethod.last4}` : displayName;
    const details = buildDetailsLine(paymentMethod, isSepa, t('paymentMethods.expires'));
    const removeLabel = t('paymentMethods.remove');

    return (
        <Card className={`p-6 ${paymentMethod.isDefault ? 'border-primary' : ''}`} data-testid="payment-method-card">
            <div className="flex items-start justify-between">
                <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-base font-medium text-foreground">{title}</span>
                        {paymentMethod.isDefault ? (
                            <Badge variant="secondary" className="text-xs font-normal bg-primary/10 text-primary">
                                {t('paymentMethods.default')}
                            </Badge>
                        ) : null}
                    </div>

                    {details ? <p className="text-sm text-muted-foreground mb-4">{details}</p> : null}

                    <div className="flex items-center gap-4">
                        {onSetDefault ? (
                            <Button
                                variant="link"
                                size="sm"
                                disabled={paymentMethod.isDefault}
                                onClick={onSetDefault}
                                className="h-auto p-0 text-sm cursor-pointer">
                                {t('paymentMethods.setDefault')}
                            </Button>
                        ) : null}
                        {onRemove ? (
                            <Button
                                variant="link"
                                size="sm"
                                onClick={onRemove}
                                className="h-auto p-0 text-sm cursor-pointer"
                                aria-label={`${removeLabel} ${title}`}>
                                {removeLabel}
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="flex-shrink-0 flex items-center" aria-hidden="true">
                    <CardIcon width={40} height={32} className="max-w-[40px] max-h-[32px]" />
                </div>
            </div>
        </Card>
    );
}
