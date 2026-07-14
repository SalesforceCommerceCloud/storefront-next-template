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
import { ToggleCard, ToggleCardEdit, ToggleCardSummary } from '@/components/toggle-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';
import { getLastFourDigits } from '@/lib/payment/payment-utils';
import { formatAddress } from '@/lib/address/address-utils';
import { getCardIcon } from '@/lib/payment/card-icon-utils';
import { AddressFormFields } from '@/components/address-form-fields';
import { CreditCardInputFields } from '@/components/credit-card-input-fields';
import type { PaymentSubmissionRef } from '@/hooks/use-checkout-actions';
import type { CheckoutActionData } from '../types';
import { useTranslation } from 'react-i18next';
import { UITarget } from '@/targets/ui-target';
import CreditCardOptionIcon from '@/components/icons/credit-card-option-icon';
import type { PaymentData } from '@/lib/checkout/schemas';
import { usePayment, isSameBillingAndShippingAddress } from './use-payment';

interface PaymentProps {
    onSubmit: (data: PaymentData) => void;
    isLoading: boolean;
    actionData?: CheckoutActionData;
    isCompleted: boolean;
    isEditing: boolean;
    onEdit: () => void;
    disabled?: boolean;
    showUseDifferentBilling?: boolean;
    paymentSubmissionRef?: PaymentSubmissionRef;
    hidePaymentSaveCheckbox?: boolean;
}

export default function Payment({
    onSubmit,
    isLoading,
    actionData,
    isCompleted: _isCompleted,
    isEditing,
    onEdit,
    disabled = false,
    showUseDifferentBilling = true,
    paymentSubmissionRef,
    hidePaymentSaveCheckbox = false,
}: PaymentProps) {
    const { t } = useTranslation('checkout');

    const {
        form,
        customerProfile,
        savedPaymentMethods,
        paymentRadioValue,
        handlePaymentMethodSelectionChange,
        setShowAllPaymentOptions,
        visiblePaymentOptionIds,
        allPaymentOptionIds,
        hiddenPaymentCount,
        showViewLessUnderForm,
        handleViewLess,
        paymentSectionRef,
        shippingAddress,
        billingAddress,
        billingAddressOptions,
        selectedBillingAddressId,
        billingDropdownOpen,
        setBillingDropdownOpen,
        handleBillingAddressChange,
        useDifferentBilling,
        summaryMethodLabel,
        summaryLastFour,
        summaryExpiryMonth,
        summaryExpiryYear,
        hasSummaryExpiry,
        hasSummaryPaymentMethod,
        isUpcomingStep,
        handleFormSubmit,
    } = usePayment({
        onSubmit,
        actionData,
        isEditing,
        disabled,
        showUseDifferentBilling,
        paymentSubmissionRef,
    });

    const stepTitle = t('payment.title');

    return (
        <div ref={paymentSectionRef}>
            <ToggleCard
                id="payment"
                title={stepTitle}
                titleAs="h2"
                titleClassName="text-2xl font-bold tracking-tight text-card-foreground"
                editing={isEditing}
                disabled={isUpcomingStep ? false : disabled}
                disableEdit={isUpcomingStep}
                onEdit={onEdit}
                editLabel={t('payment.changeLabel')}
                isLoading={isLoading}
                showHeaderSeparator>
                <ToggleCardEdit>
                    <Form {...form}>
                        <form
                            onSubmit={(e) => void form.handleSubmit(handleFormSubmit)(e)}
                            className="space-y-6 pt-2 pb-2">
                            <div className="space-y-4">
                                <UITarget targetId="sfcc.checkout.payment.paymentMethods.before" />
                                <UITarget targetId="sfcc.checkout.payment.paymentMethods">
                                    {savedPaymentMethods.length > 0 && (
                                        <div className="space-y-4">
                                            <RadioGroup
                                                value={paymentRadioValue}
                                                onValueChange={handlePaymentMethodSelectionChange}
                                                className="space-y-2">
                                                {visiblePaymentOptionIds.map((optionId) => {
                                                    if (optionId === 'new') {
                                                        if (
                                                            paymentRadioValue === 'new' &&
                                                            savedPaymentMethods.length > 0
                                                        ) {
                                                            return null;
                                                        }
                                                        return (
                                                            <div
                                                                key="new"
                                                                className="flex items-center gap-2 rounded-ui border border-input bg-card p-4">
                                                                <RadioGroupItem value="new" id="new-payment" />
                                                                <Label
                                                                    htmlFor="new-payment"
                                                                    className="flex-1 cursor-pointer flex items-center gap-2">
                                                                    <span className="text-sm font-medium leading-5 text-foreground">
                                                                        {t('payment.creditCardOption')}
                                                                    </span>
                                                                    <CreditCardOptionIcon className="w-5 h-5 flex-shrink-0 ml-auto text-muted-foreground" />
                                                                </Label>
                                                            </div>
                                                        );
                                                    }
                                                    const method = savedPaymentMethods.find((m) => m.id === optionId);
                                                    if (!method) return null;
                                                    const cardTypeIdentifier = method.cardType || 'unknown';
                                                    const CardIcon = getCardIcon(cardTypeIdentifier);
                                                    const cardTypeLabel = method.cardType
                                                        ? method.cardType.charAt(0).toUpperCase() +
                                                          method.cardType.slice(1).toLowerCase()
                                                        : t('payment.unknownCardType');
                                                    return (
                                                        <div
                                                            key={method.id}
                                                            className="flex items-start gap-2 rounded-ui border border-input bg-card p-4">
                                                            <RadioGroupItem
                                                                value={method.id}
                                                                id={method.id}
                                                                className="mt-0.5"
                                                            />
                                                            <Label
                                                                htmlFor={method.id}
                                                                className="flex-1 cursor-pointer min-w-0">
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-sm font-medium leading-5 text-foreground">
                                                                            {cardTypeLabel}
                                                                        </span>
                                                                        {method.preferred && (
                                                                            <Badge
                                                                                variant="secondary"
                                                                                className="text-xs font-normal bg-primary/10 text-primary">
                                                                                {t('payment.defaultBadge')}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-sm font-normal leading-5 text-muted-foreground">
                                                                        {t('payment.endingIn', {
                                                                            lastDigits: getLastFourDigits(
                                                                                method.maskedNumber
                                                                            ),
                                                                        })}
                                                                    </span>
                                                                </div>
                                                            </Label>
                                                            <CardIcon
                                                                className="w-6 h-4 flex-shrink-0 text-muted-foreground mt-0.5"
                                                                aria-hidden
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </RadioGroup>
                                            {hiddenPaymentCount > 0 ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-sm font-medium text-foreground"
                                                    onClick={() => setShowAllPaymentOptions(true)}
                                                    aria-expanded={false}>
                                                    {t('payment.viewAllMore', { count: hiddenPaymentCount })}
                                                </Button>
                                            ) : (
                                                allPaymentOptionIds.length > 3 &&
                                                paymentRadioValue !== 'new' && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-sm font-medium text-foreground"
                                                        onClick={handleViewLess}
                                                        aria-expanded={true}>
                                                        {t('payment.viewLess')}
                                                    </Button>
                                                )
                                            )}
                                        </div>
                                    )}

                                    {(savedPaymentMethods.length === 0 || paymentRadioValue === 'new') && (
                                        <div className="space-y-2">
                                            <div className="rounded-ui border border-input bg-card p-4 space-y-4">
                                                {(savedPaymentMethods.length === 0 || paymentRadioValue === 'new') && (
                                                    <div className="flex items-center gap-2">
                                                        <RadioGroup
                                                            value="new"
                                                            className="flex items-center gap-2 flex-1"
                                                            onValueChange={() => {
                                                                handlePaymentMethodSelectionChange('new');
                                                            }}>
                                                            <RadioGroupItem
                                                                value="new"
                                                                id="credit-card-option"
                                                                checked
                                                            />
                                                            <Label
                                                                htmlFor="credit-card-option"
                                                                className="flex items-center gap-2 cursor-pointer flex-1">
                                                                <span className="text-sm font-medium leading-5 text-foreground">
                                                                    {t('payment.creditCardOption')}
                                                                </span>
                                                                <CreditCardOptionIcon className="w-5 h-5 flex-shrink-0 ml-auto text-muted-foreground" />
                                                            </Label>
                                                        </RadioGroup>
                                                    </div>
                                                )}

                                                <CreditCardInputFields
                                                    form={form}
                                                    autoFocus={isEditing && paymentRadioValue === 'new'}
                                                />
                                                {customerProfile?.customer?.customerId && !hidePaymentSaveCheckbox ? (
                                                    <FormField
                                                        control={form.control}
                                                        name="savePaymentToProfile"
                                                        render={({ field }) => {
                                                            return (
                                                                <FormItem className="space-y-0">
                                                                    <label
                                                                        htmlFor={field.name}
                                                                        className="flex cursor-pointer items-start gap-3">
                                                                        <FormControl>
                                                                            <Checkbox
                                                                                id={field.name}
                                                                                checked={field.value ?? false}
                                                                                onCheckedChange={(checked) => {
                                                                                    field.onChange(checked === true);
                                                                                }}
                                                                                className="size-5 shrink-0 rounded border-2 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground"
                                                                                aria-label={t(
                                                                                    'payment.savePaymentToProfile'
                                                                                )}
                                                                            />
                                                                        </FormControl>
                                                                        <span className="text-sm font-normal leading-none text-foreground pt-0.5">
                                                                            {t('payment.savePaymentToProfile')}
                                                                        </span>
                                                                    </label>
                                                                </FormItem>
                                                            );
                                                        }}
                                                    />
                                                ) : null}
                                            </div>
                                            {showViewLessUnderForm && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-sm font-medium text-foreground"
                                                    onClick={handleViewLess}
                                                    aria-expanded={true}>
                                                    {t('payment.viewLess')}
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </UITarget>
                                <UITarget targetId="sfcc.checkout.payment.paymentMethods.after" />
                            </div>
                            <div className="space-y-4">
                                <UITarget targetId="sfcc.checkout.payment.billingAddress.before" />
                                <UITarget targetId="sfcc.checkout.payment.billingAddress">
                                    <div className="border-t border-input pt-4 space-y-4">
                                        {showUseDifferentBilling && (
                                            <FormField
                                                control={form.control}
                                                name="useDifferentBilling"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-0">
                                                        <label
                                                            htmlFor={field.name}
                                                            className="flex cursor-pointer items-start gap-3">
                                                            <FormControl>
                                                                <Checkbox
                                                                    id={field.name}
                                                                    checked={Boolean(field.value)}
                                                                    onCheckedChange={(checked) => {
                                                                        field.onChange(checked === true);
                                                                    }}
                                                                    aria-label={t('payment.useDifferentBilling')}
                                                                />
                                                            </FormControl>
                                                            <span className="text-sm font-normal leading-none text-foreground pt-0.5">
                                                                {t('payment.useDifferentBilling')}
                                                            </span>
                                                        </label>
                                                    </FormItem>
                                                )}
                                            />
                                        )}

                                        {useDifferentBilling && (
                                            <div className="space-y-4">
                                                {billingAddressOptions.length > 0 && (
                                                    <Popover
                                                        open={billingDropdownOpen}
                                                        onOpenChange={setBillingDropdownOpen}>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center justify-between border border-input bg-card px-4 h-9 text-sm font-medium text-foreground">
                                                                <span
                                                                    className={`truncate ${!selectedBillingAddressId ? 'text-muted-foreground' : ''}`}>
                                                                    {!selectedBillingAddressId
                                                                        ? t('payment.selectAnAddress')
                                                                        : selectedBillingAddressId === 'new'
                                                                          ? `+ ${t('shippingAddress.addNewAddressButton')}`
                                                                          : formatAddress(
                                                                                billingAddressOptions.find(
                                                                                    (a) =>
                                                                                        a.id ===
                                                                                        selectedBillingAddressId
                                                                                )
                                                                            ).fullAddress}
                                                                </span>
                                                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent
                                                            align="start"
                                                            sideOffset={4}
                                                            aria-label={t('payment.selectAnAddress')}
                                                            className="w-[var(--radix-popover-trigger-width)] border border-input bg-card p-0 shadow-md">
                                                            <div className="max-h-[108px] overflow-y-auto">
                                                                {[...billingAddressOptions]
                                                                    .sort((a, b) => {
                                                                        const sel = selectedBillingAddressId;
                                                                        if (a.id === sel) return -1;
                                                                        if (b.id === sel) return 1;
                                                                        return 0;
                                                                    })
                                                                    .map((address) => {
                                                                        const isSelected =
                                                                            selectedBillingAddressId === address.id;
                                                                        return (
                                                                            <button
                                                                                key={address.id}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    handleBillingAddressChange(
                                                                                        address.id
                                                                                    );
                                                                                    setBillingDropdownOpen(false);
                                                                                }}
                                                                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent">
                                                                                <span className="flex-1 truncate text-left">
                                                                                    {formatAddress(address).fullAddress}
                                                                                </span>
                                                                                {isSelected && (
                                                                                    <Check className="h-4 w-4 shrink-0" />
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })}
                                                            </div>
                                                            <div className="sticky bottom-0 border-t border-input bg-card">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleBillingAddressChange('new');
                                                                        setBillingDropdownOpen(false);
                                                                    }}
                                                                    className="flex w-full items-center px-3 py-2 text-sm text-foreground hover:bg-accent">
                                                                    {`+ ${t('shippingAddress.addNewAddressButton')}`}
                                                                </button>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                )}
                                                {(selectedBillingAddressId === 'new' ||
                                                    billingAddressOptions.length === 0) && (
                                                    <div>
                                                        <AddressFormFields
                                                            form={form}
                                                            fieldPrefix="billing"
                                                            showPhone={false}
                                                            showCountry
                                                            countryCode="US"
                                                            autoFocus
                                                            autoFocusField="firstName"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </UITarget>
                                <UITarget targetId="sfcc.checkout.payment.billingAddress.after" />
                            </div>
                        </form>
                    </Form>
                </ToggleCardEdit>

                <ToggleCardSummary>
                    {isUpcomingStep ? (
                        <p className="text-sm text-muted-foreground">{t('shippingOptions.completePreviousSteps')}</p>
                    ) : (
                        <div className="space-y-0.5 w-full">
                            {hasSummaryPaymentMethod ? (
                                <>
                                    <p className="text-sm font-normal leading-5 text-foreground">
                                        {`${summaryMethodLabel} **** ${summaryLastFour}`}
                                    </p>
                                    {hasSummaryExpiry && (
                                        <p className="text-sm font-normal leading-5 text-foreground">
                                            {`Expires ${summaryExpiryMonth}/${summaryExpiryYear.slice(-2)}`}
                                        </p>
                                    )}
                                    {!useDifferentBilling ||
                                    !billingAddress ||
                                    isSameBillingAndShippingAddress(billingAddress, shippingAddress) ? (
                                        <p className="text-sm font-normal leading-5 text-foreground">
                                            {`Billing: ${t('payment.sameAsShippingAddress')}`}
                                        </p>
                                    ) : (
                                        <div className="text-sm font-normal leading-5 text-foreground">
                                            <p>Billing:</p>
                                            <p>{formatAddress(billingAddress).nameLine}</p>
                                            <p>{formatAddress(billingAddress).addressLine}</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm font-normal leading-5 text-muted-foreground">
                                    {t('payment.noPaymentMethodSaved')}
                                </p>
                            )}
                        </div>
                    )}
                </ToggleCardSummary>
            </ToggleCard>
        </div>
    );
}
