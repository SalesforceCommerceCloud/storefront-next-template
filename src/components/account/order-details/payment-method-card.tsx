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
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PaymentMethodDisplay } from './order-badge-shared';

export type PaymentMethodCardProps = {
    payments: PaymentMethodDisplay[];
    /**
     * Forwarded to the Card so callers not nested under `[data-testid="account-layout"]`
     * (e.g. the guest order-lookup results page) can force `--ui-border-width` on for
     * verticals that ambiently disable Card borders outside the account layout.
     */
    className?: string;
};

/** Renders nothing when there are no displayable payment methods. */
export function PaymentMethodCard({ payments, className }: PaymentMethodCardProps): ReactElement | null {
    const { t } = useTranslation('account');

    if (payments.length === 0) {
        return null;
    }

    return (
        <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">{t('orders.paymentMethod')}</p>
            <Card className={cn('rounded-ui p-0 bg-card', className)} data-card="payment-method">
                <CardContent className="p-3 py-2">
                    <ul className="text-sm font-medium text-muted-foreground space-y-1 list-none">
                        {payments.map(({ id, label }) => (
                            <li key={id}>{label}</li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

export default PaymentMethodCard;
