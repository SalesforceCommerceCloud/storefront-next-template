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

import { useState, useEffect, useMemo, useRef, useCallback, type MutableRefObject } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useBasket } from '@/providers/basket';
import { createPaymentSchema, getPaymentDefaultValues, type PaymentData } from '@/lib/checkout/schemas';
import { getCardTypeDisplay, getLastFourDigits } from '@/lib/payment/payment-utils';
import { getAddressKey, isOrderBillingAddressIncomplete } from '@/lib/address/address-utils';
import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';
import { getAddressBookFromCustomer, getPaymentMethodsFromCustomer } from '@/lib/customer/profile-utils';
import type { ShopperBasketsV2 } from '@/scapi';
import type { PaymentSubmissionRef } from '@/hooks/use-checkout-actions';
import type { CheckoutActionData } from '../types';
import { useTranslation } from 'react-i18next';

function useLatestRef<T>(value: T): MutableRefObject<T> {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}

const INITIAL_VISIBLE_COUNT = 3;

// DOM order of the credit-card fields as rendered by CreditCardInputFields.
// Used to pick the first *visible* invalid field for focus rather than trusting
// object-key iteration order (which the server can return in any order).
const PAYMENT_FIELD_FOCUS_ORDER: readonly (keyof PaymentData)[] = ['cardholderName', 'cardNumber', 'expiryDate', 'cvv'];

function pickFirstInvalidField(errorKeys: readonly string[], hasMessage: (key: string) => boolean): string | undefined {
    const orderedMatch = PAYMENT_FIELD_FOCUS_ORDER.find((field) => errorKeys.includes(field) && hasMessage(field));
    if (orderedMatch) return orderedMatch;
    return errorKeys.find(hasMessage);
}

interface UsePaymentParams {
    onSubmit: (data: PaymentData) => void;
    actionData?: CheckoutActionData;
    isEditing: boolean;
    disabled?: boolean;
    showUseDifferentBilling?: boolean;
    paymentSubmissionRef?: PaymentSubmissionRef;
}

export function isSameBillingAndShippingAddress(
    billingAddr:
        | {
              firstName?: string;
              lastName?: string;
              address1?: string;
              city?: string;
              stateCode?: string;
              postalCode?: string;
          }
        | undefined,
    shippingAddr:
        | {
              firstName?: string;
              lastName?: string;
              address1?: string;
              city?: string;
              stateCode?: string;
              postalCode?: string;
          }
        | undefined
): boolean {
    if (!billingAddr || !shippingAddr) return false;

    return (
        billingAddr.firstName === shippingAddr.firstName &&
        billingAddr.lastName === shippingAddr.lastName &&
        billingAddr.address1 === shippingAddr.address1 &&
        billingAddr.city === shippingAddr.city &&
        billingAddr.stateCode === shippingAddr.stateCode &&
        billingAddr.postalCode === shippingAddr.postalCode
    );
}

export function usePayment({
    onSubmit,
    actionData,
    isEditing,
    disabled = false,
    showUseDifferentBilling = true,
    paymentSubmissionRef,
}: UsePaymentParams) {
    const cart = useBasket();
    const customerProfile = useCustomerProfile();
    const onSubmitRef = useLatestRef(onSubmit);

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
    const selectedPaymentMethodRef = useRef(selectedPaymentMethod);
    const userHasChosenPaymentMethodRef = useRef(false);
    selectedPaymentMethodRef.current = selectedPaymentMethod;

    const [showAllPaymentOptions, setShowAllPaymentOptions] = useState(false);
    const paymentSectionRef = useRef<HTMLDivElement | null>(null);
    const shouldScrollToPaymentOnCollapseRef = useRef(false);

    const { t } = useTranslation('checkout');
    const isUpcomingStep = disabled && !isEditing;

    const savedPaymentMethods = getPaymentMethodsFromCustomer(customerProfile);
    const savedAddresses = getAddressBookFromCustomer(customerProfile);

    useEffect(() => {
        if (savedPaymentMethods.length === 0) {
            setSelectedPaymentMethod('new');
            return;
        }

        const validIds = new Set(savedPaymentMethods.map((m) => m.id));
        const current = selectedPaymentMethodRef.current;
        const isValidSelection = current === 'new' || validIds.has(current);
        const shouldReplaceBootstrapNewSelection =
            current === 'new' && savedPaymentMethods.length > 0 && !userHasChosenPaymentMethodRef.current;
        if (isValidSelection && current !== '' && !shouldReplaceBootstrapNewSelection) {
            return;
        }

        const preferredWithId = savedPaymentMethods.find((method) => method.preferred && method.id);
        const firstWithId = savedPaymentMethods.find((method) => method.id);
        setSelectedPaymentMethod(preferredWithId?.id ?? firstWithId?.id ?? 'new');
    }, [savedPaymentMethods]);

    const shippingAddress = cart?.shipments?.[0]?.shippingAddress;
    const paymentMethod = cart?.paymentInstruments?.[0];
    const billingAddress = cart?.billingAddress;

    const paymentRadioValue =
        selectedPaymentMethod ||
        (savedPaymentMethods.length > 0
            ? (savedPaymentMethods.find((m) => m.preferred)?.id ?? savedPaymentMethods[0]?.id ?? 'new')
            : 'new');

    const selectedSavedMethod =
        paymentRadioValue !== 'new' ? savedPaymentMethods.find((method) => method.id === paymentRadioValue) : undefined;
    const hasSummaryPaymentMethod = Boolean(paymentMethod || selectedSavedMethod);
    const summaryMethodLabel = paymentMethod
        ? getCardTypeDisplay(paymentMethod)
        : selectedSavedMethod
          ? getCardTypeDisplay({
                paymentCard: { cardType: selectedSavedMethod.cardType },
            } as ShopperBasketsV2.schemas['OrderPaymentInstrument'])
          : '';
    const summaryLastFour =
        getLastFourDigits(paymentMethod?.paymentCard?.numberLastDigits || paymentMethod?.paymentCard?.maskedNumber) ||
        getLastFourDigits(selectedSavedMethod?.maskedNumber);
    const summaryExpiryMonthRaw = paymentMethod?.paymentCard?.expirationMonth ?? selectedSavedMethod?.expirationMonth;
    const summaryExpiryYearRaw = paymentMethod?.paymentCard?.expirationYear ?? selectedSavedMethod?.expirationYear;
    const summaryExpiryMonth =
        summaryExpiryMonthRaw !== undefined && summaryExpiryMonthRaw !== null
            ? String(summaryExpiryMonthRaw).padStart(2, '0')
            : '';
    const summaryExpiryYear =
        summaryExpiryYearRaw !== undefined && summaryExpiryYearRaw !== null ? String(summaryExpiryYearRaw) : '';
    const hasSummaryExpiry = Boolean(summaryExpiryMonth && summaryExpiryYear);

    // View more/less
    const allPaymentOptionIds = useMemo(() => [...savedPaymentMethods.map((m) => m.id), 'new'], [savedPaymentMethods]);
    const visiblePaymentOptionIds = useMemo(() => {
        if (showAllPaymentOptions || allPaymentOptionIds.length <= INITIAL_VISIBLE_COUNT) {
            return allPaymentOptionIds;
        }
        const first = allPaymentOptionIds.slice(0, INITIAL_VISIBLE_COUNT);
        const current = paymentRadioValue;
        if (!first.includes(current)) {
            return [...first, current];
        }
        return first;
    }, [showAllPaymentOptions, allPaymentOptionIds, paymentRadioValue]);
    const hiddenPaymentCount = allPaymentOptionIds.length - visiblePaymentOptionIds.length;
    const showViewLessUnderForm =
        savedPaymentMethods.length > 0 &&
        allPaymentOptionIds.length > INITIAL_VISIBLE_COUNT &&
        hiddenPaymentCount === 0;

    const handleViewLess = useCallback(() => {
        setShowAllPaymentOptions(false);
        shouldScrollToPaymentOnCollapseRef.current = true;
        const firstVisible = allPaymentOptionIds.slice(0, INITIAL_VISIBLE_COUNT);
        if (!firstVisible.includes(paymentRadioValue)) {
            userHasChosenPaymentMethodRef.current = true;
            setSelectedPaymentMethod(firstVisible[0]);
        }
    }, [allPaymentOptionIds, paymentRadioValue]);

    const handlePaymentMethodSelectionChange = useCallback((value: string) => {
        userHasChosenPaymentMethodRef.current = true;
        setSelectedPaymentMethod(value);
    }, []);

    useEffect(() => {
        if (!showAllPaymentOptions && shouldScrollToPaymentOnCollapseRef.current) {
            paymentSectionRef.current?.scrollIntoView({ block: 'start' });
            shouldScrollToPaymentOnCollapseRef.current = false;
        }
    }, [showAllPaymentOptions]);

    // Billing address
    const billingAddressOptions = useMemo(
        () => savedAddresses.filter((addr) => !isSameBillingAndShippingAddress(addr, shippingAddress)),
        [savedAddresses, shippingAddress]
    );

    const defaultValues = useMemo(() => {
        const baseDefaults = getPaymentDefaultValues({
            shippingAddress,
            paymentMethod:
                paymentRadioValue !== 'new' && paymentMethod?.paymentCard?.holder
                    ? { holder: paymentMethod.paymentCard.holder }
                    : undefined,
        });

        const isUsingSavedPayment = paymentRadioValue !== 'new' && savedPaymentMethods.length > 0;

        const basketHasDistinctBilling = Boolean(
            showUseDifferentBilling &&
                billingAddress &&
                !isOrderBillingAddressIncomplete(billingAddress) &&
                shippingAddress &&
                !isSameBillingAndShippingAddress(billingAddress, shippingAddress)
        );
        const defaultUseDifferentBilling = showUseDifferentBilling ? basketHasDistinctBilling : true;

        const computedDefaults = {
            ...baseDefaults,
            cardholderName: '',
            useSavedPaymentMethod: isUsingSavedPayment,
            selectedSavedPaymentMethod: isUsingSavedPayment ? paymentRadioValue : undefined,
            useDifferentBilling: defaultUseDifferentBilling,
            ...(basketHasDistinctBilling && billingAddress
                ? {
                      billingFirstName: billingAddress.firstName ?? '',
                      billingLastName: billingAddress.lastName ?? '',
                      billingAddress1: billingAddress.address1 ?? '',
                      billingAddress2: billingAddress.address2 ?? '',
                      billingCity: billingAddress.city ?? '',
                      billingStateCode: billingAddress.stateCode ?? '',
                      billingPostalCode: billingAddress.postalCode ?? '',
                      billingCountryCode: billingAddress.countryCode ?? 'US',
                  }
                : {}),
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            ...(!showUseDifferentBilling && {
                cardholderName: '',
                billingFirstName: '',
                billingLastName: '',
                billingAddress1: '',
                billingAddress2: '',
                billingCity: '',
                billingStateCode: '',
                billingPostalCode: '',
                billingCountryCode: 'US',
            }),
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        };

        return computedDefaults;
    }, [
        paymentRadioValue,
        shippingAddress,
        paymentMethod,
        savedPaymentMethods.length,
        showUseDifferentBilling,
        billingAddress,
    ]);

    const schema = useMemo(() => createPaymentSchema(t), [t]);

    const form = useForm<PaymentData>({
        resolver: zodResolver(schema),
        defaultValues,
        mode: 'onSubmit',
    });

    // Billing address sync
    const shippingAddressSyncKey = useMemo(
        () => (shippingAddress ? getAddressKey(shippingAddress) : ''),
        [shippingAddress]
    );
    const previousUseDifferentBillingRef = useRef<boolean | null>(null);
    const useDifferentBillingWatched = form.watch('useDifferentBilling');
    const [selectedBillingAddressId, setSelectedBillingAddressId] = useState('');

    useEffect(() => {
        if (!showUseDifferentBilling || !shippingAddress || !shippingAddressSyncKey) return;

        const previousValue = previousUseDifferentBillingRef.current;
        const toggledFromSameToDifferent = previousValue === false && useDifferentBillingWatched === true;
        previousUseDifferentBillingRef.current = useDifferentBillingWatched;

        if (!useDifferentBillingWatched) {
            form.setValue('billingFirstName', shippingAddress.firstName ?? '');
            form.setValue('billingLastName', shippingAddress.lastName ?? '');
            form.setValue('billingAddress1', shippingAddress.address1 ?? '');
            form.setValue('billingAddress2', shippingAddress.address2 ?? '');
            form.setValue('billingCity', shippingAddress.city ?? '');
            form.setValue('billingStateCode', shippingAddress.stateCode ?? '');
            form.setValue('billingPostalCode', shippingAddress.postalCode ?? '');
            form.setValue('billingCountryCode', shippingAddress.countryCode ?? 'US');
            return;
        }

        if (toggledFromSameToDifferent) {
            // In multi-ship, saved addresses that differ from the shipping address are available
            // as billing options. Auto-select the first one so the form populates immediately
            // instead of showing an empty dropdown with no address form visible.
            if (billingAddressOptions.length > 0) {
                const firstOption = billingAddressOptions[0];
                setSelectedBillingAddressId(firstOption.id);
                form.setValue('billingFirstName', firstOption.firstName ?? '');
                form.setValue('billingLastName', firstOption.lastName ?? '');
                form.setValue('billingAddress1', firstOption.address1 ?? '');
                form.setValue('billingAddress2', firstOption.address2 ?? '');
                form.setValue('billingCity', firstOption.city ?? '');
                form.setValue('billingStateCode', firstOption.stateCode ?? '');
                form.setValue('billingPostalCode', firstOption.postalCode ?? '');
                form.setValue('billingCountryCode', firstOption.countryCode ?? 'US');
            } else {
                // Case when user just toggles the button without providing any new address:
                // No saved addresses differ from shipping — pre-fill billing with the
                // shipping address so the form is valid and ready for the user to edit.
                // Clearing the fields here would cause place-order validation to fail
                // if the user doesn't manually fill in every required billing field.
                form.setValue('billingFirstName', shippingAddress.firstName ?? '');
                form.setValue('billingLastName', shippingAddress.lastName ?? '');
                form.setValue('billingAddress1', shippingAddress.address1 ?? '');
                form.setValue('billingAddress2', shippingAddress.address2 ?? '');
                form.setValue('billingCity', shippingAddress.city ?? '');
                form.setValue('billingStateCode', shippingAddress.stateCode ?? '');
                form.setValue('billingPostalCode', shippingAddress.postalCode ?? '');
                form.setValue('billingCountryCode', shippingAddress.countryCode ?? 'US');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- billingAddressOptions excluded: derived from savedAddresses (unstable ref) and shippingAddress (already covered by shippingAddressSyncKey). Including it causes infinite re-renders. The value is read synchronously when the toggle fires.
    }, [showUseDifferentBilling, shippingAddress, shippingAddressSyncKey, useDifferentBillingWatched, form]);

    useEffect(() => {
        const effectiveSelection = selectedPaymentMethod || paymentRadioValue;
        const isUsingSavedPayment = effectiveSelection !== 'new' && savedPaymentMethods.length > 0;

        form.setValue('useSavedPaymentMethod', isUsingSavedPayment);
        form.setValue('selectedSavedPaymentMethod', isUsingSavedPayment ? effectiveSelection : undefined);

        if (isUsingSavedPayment) {
            void form.trigger();
        }
    }, [selectedPaymentMethod, paymentRadioValue, savedPaymentMethods.length, form]);

    const watchedFields = {
        cardNumber: form.watch('cardNumber'),
        cardholderName: form.watch('cardholderName'),
        expiryDate: form.watch('expiryDate'),
        cvv: form.watch('cvv'),
        billingFirstName: form.watch('billingFirstName'),
        billingLastName: form.watch('billingLastName'),
        billingAddress1: form.watch('billingAddress1'),
        billingCity: form.watch('billingCity'),
        billingPostalCode: form.watch('billingPostalCode'),
        billingStateCode: form.watch('billingStateCode'),
        billingCountryCode: form.watch('billingCountryCode'),
    };
    useEffect(() => {
        for (const [field, value] of Object.entries(watchedFields)) {
            if ((value ?? '').trim().length > 0) {
                form.clearErrors(field as keyof PaymentData);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        watchedFields.cardNumber,
        watchedFields.cardholderName,
        watchedFields.expiryDate,
        watchedFields.cvv,
        watchedFields.billingFirstName,
        watchedFields.billingLastName,
        watchedFields.billingAddress1,
        watchedFields.billingCity,
        watchedFields.billingPostalCode,
        watchedFields.billingStateCode,
        watchedFields.billingCountryCode,
        form,
    ]);

    // Payment submission ref
    const savedPaymentMethodsRef = useLatestRef(savedPaymentMethods);
    useEffect(() => {
        if (!paymentSubmissionRef) return;
        const refCurrent = paymentSubmissionRef.current;
        refCurrent.formDataGetter = () => {
            const current = selectedPaymentMethodRef.current;
            const methods = savedPaymentMethodsRef.current;
            const effective =
                current ||
                (methods.length > 0 ? (methods.find((m) => m.preferred)?.id ?? methods[0]?.id ?? 'new') : 'new');
            const isUsingSaved = effective !== 'new' && methods.length > 0;
            return {
                ...form.getValues(),
                selectedSavedPaymentMethod: isUsingSaved ? effective : undefined,
                useSavedPaymentMethod: isUsingSaved,
            };
        };
        refCurrent.setFormErrors = (errors) => {
            for (const [field, error] of Object.entries(errors)) {
                form.setError(field as keyof PaymentData, error);
            }
            // Focus the first invalid field so screen reader / keyboard users know
            // where the form failed instead of being stranded on Place Order.
            // Prefer DOM order over object-key order so focus lands on the topmost
            // visible field even if the server returns errors in a different order.
            const firstField = pickFirstInvalidField(Object.keys(errors), (key) => Boolean(errors[key]?.message));
            if (firstField) {
                form.setFocus(firstField as keyof PaymentData);
            }
        };
        refCurrent.billingAddressGetter = () => {
            const data = form.getValues();
            if (!data.useDifferentBilling) return null;
            return {
                firstName: data.billingFirstName || '',
                lastName: data.billingLastName || '',
                address1: data.billingAddress1 || '',
                address2: data.billingAddress2 || '',
                city: data.billingCity || '',
                stateCode: data.billingStateCode || '',
                postalCode: data.billingPostalCode || '',
                phone: data.billingPhone || '',
                countryCode: data.billingCountryCode || 'US',
            };
        };
        return () => {
            refCurrent.formDataGetter = null;
            refCurrent.setFormErrors = null;
            refCurrent.billingAddressGetter = null;
        };
    }, [form, paymentSubmissionRef, savedPaymentMethodsRef]);

    useEffect(() => {
        if (!actionData?.fieldErrors || typeof actionData.fieldErrors !== 'object') return;
        const fieldErrors = actionData.fieldErrors;
        const getMessage = (key: string): string => {
            const raw = fieldErrors[key];
            return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
        };
        for (const field of Object.keys(fieldErrors)) {
            const message = getMessage(field);
            if (message) form.setError(field as keyof PaymentData, { type: 'server', message });
        }
        // Focus the first server-side invalid field for AT users, preferring DOM
        // order so focus lands on the topmost visible field regardless of the
        // order the server returned the errors in.
        const firstField = pickFirstInvalidField(Object.keys(fieldErrors), (key) => Boolean(getMessage(key)));
        if (firstField) {
            form.setFocus(firstField as keyof PaymentData);
        }
    }, [actionData?.fieldErrors, form]);

    const handleFormSubmit = useCallback(
        (data: PaymentData) => {
            const effectiveSelection = selectedPaymentMethod || paymentRadioValue;
            const isUsingSaved = effectiveSelection !== 'new' && savedPaymentMethods.length > 0;
            const paymentData = {
                ...data,
                selectedSavedPaymentMethod: isUsingSaved ? effectiveSelection : undefined,
                useSavedPaymentMethod: isUsingSaved,
            };
            onSubmitRef.current(paymentData);
        },
        [selectedPaymentMethod, paymentRadioValue, savedPaymentMethods.length, onSubmitRef]
    );

    const useDifferentBilling = form.watch('useDifferentBilling');

    const [billingDropdownOpen, setBillingDropdownOpen] = useState(false);

    const setBillingFields = useCallback(
        (values: Record<string, string>) => {
            for (const [key, value] of Object.entries(values)) {
                form.setValue(key as keyof PaymentData, value, { shouldDirty: false, shouldValidate: false });
            }
        },
        [form]
    );

    const handleBillingAddressChange = useCallback(
        (addressId: string) => {
            setSelectedBillingAddressId(addressId);
            if (addressId === 'new') {
                setBillingFields({
                    billingFirstName: '',
                    billingLastName: '',
                    billingAddress1: '',
                    billingAddress2: '',
                    billingCity: '',
                    billingStateCode: '',
                    billingPostalCode: '',
                    billingPhone: '',
                    billingCountryCode: 'US',
                });
                return;
            }
            const addr = savedAddresses.find((a) => a.id === addressId);
            if (!addr) return;
            setBillingFields({
                billingFirstName: addr.firstName ?? '',
                billingLastName: addr.lastName ?? '',
                billingAddress1: addr.address1 ?? '',
                billingAddress2: addr.address2 ?? '',
                billingCity: addr.city ?? '',
                billingStateCode: addr.stateCode ?? '',
                billingPostalCode: addr.postalCode ?? '',
                billingPhone: addr.phone ?? '',
                billingCountryCode: addr.countryCode ?? 'US',
            });
        },
        [savedAddresses, setBillingFields]
    );

    return {
        form,
        cart,
        customerProfile,
        savedPaymentMethods,
        savedAddresses,
        selectedPaymentMethod,
        paymentRadioValue,
        handlePaymentMethodSelectionChange,
        showAllPaymentOptions,
        setShowAllPaymentOptions,
        visiblePaymentOptionIds,
        allPaymentOptionIds,
        hiddenPaymentCount,
        showViewLessUnderForm,
        handleViewLess,
        paymentSectionRef,
        shippingAddress,
        billingAddress,
        paymentMethod,
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
        selectedSavedMethod,
        isUpcomingStep,
        handleFormSubmit,
    };
}
