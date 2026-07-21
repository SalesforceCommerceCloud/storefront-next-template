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
import { type ReactElement, useState, useMemo, useEffect, useRef } from 'react';
import type { ShopperCustomers } from '@/scapi';
import { useRevalidator, useFetcher } from 'react-router';
import type { action as paymentMethodAddAction } from '@/routes/action.payment-method-add';
import type { action as paymentMethodRemoveAction } from '@/routes/action.payment-method-remove';
import type { action as paymentMethodSetDefaultAction } from '@/routes/action.payment-method-set-default';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PaymentMethodCard, type PaymentMethod } from './payment-method-card';
import { RemovePaymentMethodDialog } from './remove-payment-method-dialog';
import { AddPaymentMethodDialog } from './add-payment-method-dialog';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast';
import { getLastFourDigits } from '@/lib/payment/payment-utils';
import { UITarget } from '@/targets/ui-target';
import { resourceRoutes } from '@/route-paths';

export interface PaymentMethodsProps {
    customer: ShopperCustomers.schemas['Customer'] | null;
}

/**
 * Convert SFCC payment instrument to PaymentMethod format
 */
function convertToPaymentMethod(
    instrument: ShopperCustomers.schemas['CustomerPaymentInstrument']
): PaymentMethod | null {
    if (!instrument.paymentCard || !instrument.paymentInstrumentId) {
        return null;
    }

    const card = instrument.paymentCard;
    const last4 = getLastFourDigits(card.maskedNumber, card.numberLastDigits);

    return {
        id: instrument.paymentInstrumentId,
        type: card.cardType || '',
        last4,
        expiryMonth: String(card.expirationMonth || ''),
        expiryYear: String(card.expirationYear || ''),
        cardholderName: card.holder || '',
        isDefault: !!instrument.default, // Use the default flag from API
    };
}

/**
 * Payment methods content component
 */
export function PaymentMethods({ customer }: PaymentMethodsProps): ReactElement {
    const { t } = useTranslation('account');
    const revalidator = useRevalidator();
    const { addToast } = useToast();

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

    const paymentFetcher = useFetcher<
        typeof paymentMethodAddAction | typeof paymentMethodRemoveAction | typeof paymentMethodSetDefaultAction
    >();
    const previousFetcherStateRef = useRef(paymentFetcher.state);
    const currentIntentRef = useRef<string | null>(null);

    const paymentMethods = useMemo(() => {
        return (customer?.paymentInstruments || [])
            .map(convertToPaymentMethod)
            .filter((method): method is PaymentMethod => method !== null)
            .sort((a, b) => {
                // Sort default payment methods first
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return 0;
            });
    }, [customer?.paymentInstruments]);

    const hasPaymentMethods = paymentMethods.length > 0;

    const handleAddClick = () => setIsAddDialogOpen(true);

    const handleAddSubmitForm = (formData: FormData) => {
        currentIntentRef.current = 'add';
        void paymentFetcher.submit(formData, { method: 'POST', action: resourceRoutes.paymentMethodAdd });
    };

    const handleRemoveClick = (method: PaymentMethod) => {
        setSelectedPaymentMethod(method);
        setIsRemoveDialogOpen(true);
    };

    const handleRemoveDialogClose = () => {
        setIsRemoveDialogOpen(false);
        setSelectedPaymentMethod(null);
    };

    const handleRemoveConfirm = (paymentInstrumentId: string) => {
        currentIntentRef.current = 'delete';
        const formData = new FormData();
        formData.append('paymentInstrumentId', paymentInstrumentId);
        void paymentFetcher.submit(formData, { method: 'POST', action: resourceRoutes.paymentMethodRemove });
    };

    const handleSetDefault = (method: PaymentMethod) => {
        if (!method.id) return;
        currentIntentRef.current = 'setDefault';
        const formData = new FormData();
        formData.append('paymentInstrumentId', method.id);
        void paymentFetcher.submit(formData, { method: 'POST', action: resourceRoutes.paymentMethodSetDefault });
    };

    useEffect(() => {
        const stateChanged = previousFetcherStateRef.current !== paymentFetcher.state;
        previousFetcherStateRef.current = paymentFetcher.state;

        if (stateChanged && paymentFetcher.state === 'idle' && paymentFetcher.data) {
            const intent = currentIntentRef.current;
            const { success } = paymentFetcher.data;

            const intentHandlers: Record<string, () => void> = {
                delete: () => {
                    setIsRemoveDialogOpen(false);
                    setSelectedPaymentMethod(null);
                    addToast(t(`paymentMethods.remove${success ? 'Success' : 'Error'}`), success ? 'success' : 'error');
                },
                setDefault: () => {
                    addToast(
                        t(`paymentMethods.setDefault${success ? 'Success' : 'Error'}`),
                        success ? 'success' : 'error'
                    );
                },
                add: () => {
                    addToast(t(`paymentMethods.add${success ? 'Success' : 'Error'}`), success ? 'success' : 'error');
                    setIsAddDialogOpen(false);
                },
            };

            if (intent && intentHandlers[intent]) {
                intentHandlers[intent]();
                if (success) void revalidator.revalidate();
            }

            currentIntentRef.current = null;
        }
    }, [paymentFetcher.state, paymentFetcher.data, addToast, t, revalidator]);

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <h1 className="text-2xl font-semibold text-foreground mb-1">{t('navigation.paymentMethods')}</h1>
                    <p className="text-sm text-muted-foreground">{t('paymentMethods.pageSubtitle')}</p>
                </CardContent>
            </Card>

            {/* Payment Methods Section */}
            <UITarget targetId="sfcc.accountPaymentOptions.payments.savedPaymentMethods">
                <Card className="p-6">
                    <div className="flex items-center justify-between pb-6 border-b">
                        <div>
                            <h2 className="text-base font-semibold text-foreground mb-1">
                                {t('navigation.paymentMethods')}
                            </h2>
                            <p className="text-sm text-muted-foreground">{t('paymentMethods.subtitle')}</p>
                        </div>
                        <Button variant="outline" onClick={handleAddClick}>
                            {t('paymentMethods.addPaymentMethod')}
                        </Button>
                    </div>

                    <div className="pt-2">
                        {!hasPaymentMethods ? (
                            /* Empty State */
                            <div className="py-8 text-center">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="text-muted-foreground">
                                        <p className="text-sm font-medium">
                                            {t('paymentMethods.noSavedPaymentMethods')}
                                        </p>
                                        <p className="text-sm mt-1">{t('paymentMethods.empty')}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Payment Methods List */
                            <div className="space-y-6">
                                {paymentMethods.map((method) => (
                                    <PaymentMethodCard
                                        key={method.id}
                                        paymentMethod={method}
                                        onRemove={() => handleRemoveClick(method)}
                                        onSetDefault={() => handleSetDefault(method)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            </UITarget>
            <UITarget targetId="sfcc.myAccountPaymentMethods.giftCards.manage" />

            {/* Add Payment Method Dialog */}
            {isAddDialogOpen && (
                <UITarget targetId="sfcc.myAccount.payments.addMethod">
                    <AddPaymentMethodDialog
                        open={isAddDialogOpen}
                        onOpenChange={setIsAddDialogOpen}
                        onSubmitForm={handleAddSubmitForm}
                        addresses={customer?.addresses || []}
                        isLoading={
                            (paymentFetcher.state === 'submitting' || paymentFetcher.state === 'loading') &&
                            currentIntentRef.current === 'add'
                        }
                    />
                </UITarget>
            )}

            {/* Remove Payment Method Dialog */}
            <RemovePaymentMethodDialog
                open={isRemoveDialogOpen}
                onOpenChange={handleRemoveDialogClose}
                paymentMethod={selectedPaymentMethod}
                onConfirm={handleRemoveConfirm}
                isLoading={
                    (paymentFetcher.state === 'submitting' || paymentFetcher.state === 'loading') &&
                    currentIntentRef.current === 'delete'
                }
            />
        </div>
    );
}
