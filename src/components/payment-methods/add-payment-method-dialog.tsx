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

import { type ReactElement, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, X, CreditCard } from 'lucide-react';
import type { ShopperCustomers } from '@/scapi';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { type CountryCode } from '@/components/customer-address-form';
import { AddressFormFields } from '@/components/address-form-fields';
import { CreditCardInputFields } from '@/components/credit-card-input-fields';
import { Form } from '@/components/ui/form';
import { accountDestructiveAlertClasses } from '@/lib/account-action-styles';
import { createPaymentSchema, type PaymentData } from '@/lib/checkout/schemas';
import { detectCardType } from '@/lib/payment/payment-utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

type AddPaymentData = PaymentData & { saveAsDefault?: boolean };

export interface AddPaymentMethodDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Submit FormData built from form values (card fields + saveAsDefault) for server action */
    onSubmitForm: (formData: FormData) => void;
    addresses: ShopperCustomers.schemas['CustomerAddress'][];
    isLoading?: boolean;
}

/**
 * Add payment method dialog. Uses CreditCardInputFields; submits card data via FormData to server action.
 */
export function AddPaymentMethodDialog({
    open,
    onOpenChange,
    onSubmitForm,
    addresses,
    isLoading = false,
}: AddPaymentMethodDialogProps): ReactElement {
    const { t } = useTranslation('account');
    const [countryCode] = useState<CountryCode>('US');
    const [selectedAddress, setSelectedAddress] = useState('');
    const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const paymentSchema = createPaymentSchema(t as unknown as TFunction);
    const paymentForm = useForm<AddPaymentData>({
        resolver: zodResolver(paymentSchema),
        mode: 'onSubmit',
        defaultValues: {
            cardholderName: '',
            cardNumber: '',
            expiryDate: '',
            cvv: '',
            useDifferentBilling: false,
            useSavedPaymentMethod: false,
            saveAsDefault: false,
            billingFirstName: '',
            billingLastName: '',
            billingAddress1: '',
            billingAddress2: '',
            billingCity: '',
            billingStateCode: '',
            billingPostalCode: '',
            billingPhone: '',
        },
    });

    const handleClose = () => {
        if (isLoading) return;
        setSelectedAddress('');
        setIsAddingNewAddress(false);
        setFormError(null);
        paymentForm.reset();
        onOpenChange(false);
    };

    const handleSubmit = async () => {
        setFormError(null);

        if (!isAddingNewAddress && selectedAddress) {
            const address = addresses.find((a) => a.addressId === selectedAddress);
            if (address) {
                paymentForm.setValue('billingFirstName', address.firstName || '');
                paymentForm.setValue('billingLastName', address.lastName || '');
                paymentForm.setValue('billingAddress1', address.address1 || '');
                paymentForm.setValue('billingAddress2', address.address2 || '');
                paymentForm.setValue('billingCity', address.city || '');
                paymentForm.setValue('billingStateCode', address.stateCode || '');
                paymentForm.setValue('billingPostalCode', address.postalCode || '');
                paymentForm.setValue('billingPhone', address.phone || '');
            }
        } else if (!isAddingNewAddress && !selectedAddress) {
            setFormError(t('paymentMethods.selectAddressError', 'Please select a billing address'));
            return;
        }

        const isValid = await paymentForm.trigger();
        if (!isValid) {
            setFormError(t('paymentMethods.validationError', 'Please correct the errors in the form'));
            return;
        }

        const formData = paymentForm.getValues();
        // Parse expiry date (mm/yy format)
        const expiryParts = (formData.expiryDate || '').split('/');
        if (expiryParts.length !== 2) {
            setFormError(t('paymentMethods.invalidExpiryFormat', 'Invalid expiry date format'));
            return;
        }
        const expirationMonth = parseInt(expiryParts[0], 10);
        const expirationYear = parseInt(`20${expiryParts[1]}`, 10);
        if (
            Number.isNaN(expirationMonth) ||
            Number.isNaN(expirationYear) ||
            expirationMonth < 1 ||
            expirationMonth > 12
        ) {
            setFormError(t('paymentMethods.invalidExpiryFormat', 'Invalid expiry date format'));
            return;
        }

        const cardNumber = (formData.cardNumber || '').replace(/\s/g, '');
        const formDataToSend = new FormData();
        formDataToSend.append('cardNumber', cardNumber);
        formDataToSend.append('cardholderName', formData.cardholderName || '');
        formDataToSend.append('cardType', detectCardType(cardNumber));
        formDataToSend.append('expirationMonth', String(expirationMonth));
        formDataToSend.append('expirationYear', String(expirationYear));
        if (paymentForm.getValues('saveAsDefault' as keyof PaymentData)) {
            formDataToSend.append('saveAsDefault', 'on');
        }
        onSubmitForm(formDataToSend);
    };

    const handleToggleAddAddress = () => {
        if (!isAddingNewAddress) setSelectedAddress('');
        setIsAddingNewAddress(!isAddingNewAddress);
    };

    // Reset form when dialog closes (after successful submit or cancel)
    useEffect(() => {
        if (!open) {
            setSelectedAddress('');
            setIsAddingNewAddress(false);
            setFormError(null);
            paymentForm.reset();
        }
    }, [open, paymentForm]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-lg font-semibold text-foreground">
                        {t('paymentMethods.addPaymentMethodTitle')}
                    </DialogTitle>
                </DialogHeader>

                {formError && (
                    <Alert className={accountDestructiveAlertClasses}>
                        <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-5">
                    <div className="border border-primary bg-background">
                        <label className="flex items-center gap-3 p-4 cursor-pointer">
                            <input
                                type="radio"
                                name="paymentMethod"
                                className="w-4 h-4 text-primary border-input"
                                defaultChecked
                            />
                            <span className="text-sm font-medium">{t('paymentMethods.creditCard')}</span>
                            <div className="ml-auto">
                                <CreditCard className="w-5 h-5 text-primary" />
                            </div>
                        </label>
                        <div className="px-4 pb-4 space-y-3 border-t pt-3">
                            <Form {...paymentForm}>
                                <CreditCardInputFields
                                    form={paymentForm as unknown as Parameters<typeof CreditCardInputFields>[0]['form']}
                                    showIsDefaultOption
                                    defaultOptionLabel={t('paymentMethods.saveAsDefault')}
                                />
                            </Form>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Label htmlFor="billing-address" className="text-sm font-medium mb-2 block">
                            {t('paymentMethods.billingAddress')}
                        </Label>
                        <div className="[&_[data-slot=native-select-wrapper]]:w-full">
                            <NativeSelect
                                id="billing-address"
                                value={selectedAddress}
                                onChange={(e) => {
                                    setSelectedAddress(e.target.value);
                                    if (e.target.value) setIsAddingNewAddress(false);
                                }}
                                required
                                aria-required="true">
                                <NativeSelectOption value="">{t('paymentMethods.selectAddress')}</NativeSelectOption>
                                {addresses.map((address) => (
                                    <NativeSelectOption key={address.addressId} value={address.addressId || ''}>
                                        {address.firstName} {address.lastName} - {address.address1}
                                        {address.city && `, ${address.city}`}...
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>
                        {!isAddingNewAddress ? (
                            <button
                                type="button"
                                onClick={handleToggleAddAddress}
                                className="flex items-center gap-1 mt-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                                <Plus className="w-4 h-4" />
                                {t('paymentMethods.addNewAddress')}
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={handleToggleAddAddress}
                                    className="flex items-center gap-1 mt-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                                    <X className="w-4 h-4" />
                                    {t('paymentMethods.cancel')}
                                </button>
                                <div className="mt-4">
                                    <Form {...paymentForm}>
                                        <AddressFormFields<AddPaymentData>
                                            form={paymentForm}
                                            fieldPrefix="billing"
                                            showPhone={false}
                                            countryCode={countryCode}
                                        />
                                    </Form>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-2 pt-6 border-t">
                        <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                            {t('paymentMethods.cancel')}
                        </Button>
                        <Button onClick={() => void handleSubmit()} disabled={isLoading}>
                            {t('paymentMethods.save')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
