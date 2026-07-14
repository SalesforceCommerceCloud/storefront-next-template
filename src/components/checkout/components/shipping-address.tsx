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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { ShopperCustomers } from '@/scapi';
import { ToggleCard, ToggleCardEdit, ToggleCardSummary } from '@/components/toggle-card';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useBasket } from '@/providers/basket';
import { useAuth } from '@/providers/auth';
import { createShippingAddressSchema, type ShippingAddressData } from '@/lib/checkout/schemas';
import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useScapiFetcherEffect } from '@/hooks/use-scapi-fetcher-effect';
import {
    getShippingAddressFromCustomer,
    getAddressBookFromCustomer,
    type AddressBookItem,
} from '@/lib/customer/profile-utils';
import { AddressFormFields } from '@/components/address-form-fields';
import SavedAddressesList from './saved-addresses-list';
import AddressModal from './address-modal';
import type { CheckoutActionData } from '../types';
import { addressToFormData, findMatchingSavedAddressId, isAddressEmpty } from '@/lib/address/address-utils';
import ShippingAddressDisplay from './shipping-address-display';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { DEFAULT_COUNTRY_CODE } from '@/components/customer-address-form/constants';
import { stripCountryCode, extractCountryCode } from '@/lib/address/phone-utils';

interface ShippingAddressProps {
    onSubmit: (formData: FormData) => void;
    isLoading: boolean;
    actionData?: CheckoutActionData;
    // Step state managed by container
    isCompleted: boolean;
    isEditing: boolean;
    onEdit: () => void;
    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    enableMultiAddress: boolean;
    handleToggleShippingAddressMode: () => void;
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP
}

export default function ShippingAddress({
    onSubmit,
    isLoading,
    actionData,
    isCompleted,
    isEditing,
    onEdit,
    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    enableMultiAddress,
    handleToggleShippingAddressMode,
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP
}: ShippingAddressProps) {
    const cart = useBasket();
    const customerProfile = useCustomerProfile();
    const auth = useAuth();
    const customerId = auth?.customerId;
    const { t } = useTranslation('checkout');
    const { t: tErrors } = useTranslation('errors');
    // @sfdc-extension-line SFDC_EXT_MULTISHIP
    const { t: tMultiship } = useTranslation('extMultiship');

    const shippingAddress = cart?.shipments?.[0]?.shippingAddress;

    // Show the shopper the address they typed so they can modify it
    const attemptedAddress = (actionData?.data as { address?: Partial<ShippingAddressData> } | undefined)?.address;
    const basketAddressDiffersFromAttempted = Boolean(
        actionData?.success &&
            attemptedAddress &&
            shippingAddress &&
            (attemptedAddress.address1 !== shippingAddress.address1 ||
                attemptedAddress.postalCode !== shippingAddress.postalCode ||
                attemptedAddress.stateCode !== shippingAddress.stateCode ||
                attemptedAddress.city !== shippingAddress.city)
    );
    const formSourceAddress = basketAddressDiffersFromAttempted ? attemptedAddress : undefined;

    // Get auto-populated shipping address from customer profile
    const customerShippingAddress = getShippingAddressFromCustomer(customerProfile);

    // Get phone from contact info (prioritize this for auto-population)
    const contactInfoPhone = cart?.customerInfo?.phone;

    // Phone priority: attempted (from last no-methods submit) > saved shipping > contact > profile
    const prioritizedPhoneNumber = (formSourceAddress?.phone ||
        shippingAddress?.phone ||
        contactInfoPhone ||
        customerShippingAddress.phone ||
        '') as string;
    const schema = useMemo(() => createShippingAddressSchema(t as unknown as TFunction), [t]);
    const form = useForm<ShippingAddressData>({
        resolver: zodResolver(schema),
        defaultValues: {
            firstName:
                formSourceAddress?.firstName || shippingAddress?.firstName || customerShippingAddress.firstName || '',
            lastName:
                formSourceAddress?.lastName || shippingAddress?.lastName || customerShippingAddress.lastName || '',
            address1:
                formSourceAddress?.address1 || shippingAddress?.address1 || customerShippingAddress.address1 || '',
            address2:
                formSourceAddress?.address2 || shippingAddress?.address2 || customerShippingAddress.address2 || '',
            city: formSourceAddress?.city || shippingAddress?.city || customerShippingAddress.city || '',
            stateCode:
                formSourceAddress?.stateCode || shippingAddress?.stateCode || customerShippingAddress.stateCode || '',
            postalCode:
                formSourceAddress?.postalCode ||
                shippingAddress?.postalCode ||
                customerShippingAddress.postalCode ||
                '',
            countryCode:
                formSourceAddress?.countryCode ||
                shippingAddress?.countryCode ||
                customerShippingAddress.countryCode ||
                DEFAULT_COUNTRY_CODE,
            phoneCountryCode: extractCountryCode(prioritizedPhoneNumber),
            phone: stripCountryCode(prioritizedPhoneNumber),
        },
    });

    const rawSavedAddresses = getAddressBookFromCustomer(customerProfile);
    const hasSavedAddresses = rawSavedAddresses.length > 0;

    const currentAddressId = findMatchingSavedAddressId(shippingAddress, rawSavedAddresses);
    const defaultSelectedId =
        currentAddressId ?? rawSavedAddresses.find((a) => a.preferred)?.id ?? rawSavedAddresses[0]?.id ?? '';

    const savedAddresses = useMemo(() => {
        if (!currentAddressId) return rawSavedAddresses;
        const idx = rawSavedAddresses.findIndex((a) => a.id === currentAddressId);
        if (idx <= 0) return rawSavedAddresses;
        const reordered = [...rawSavedAddresses];
        const [match] = reordered.splice(idx, 1);
        reordered.unshift(match);
        return reordered;
    }, [rawSavedAddresses, currentAddressId]);

    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const effectiveSelectedId = selectedAddressId ?? defaultSelectedId;

    const [addressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<AddressBookItem | null>(null);
    const pendingEditAddressRef = useRef<FormData | null>(null);
    const pendingAddAddressRef = useRef(false);
    const isEditMode = editingAddress !== null;

    const updateAddressFetcher = useScapiFetcher('shopperCustomers', 'updateCustomerAddress', {
        params: {
            path: {
                customerId: customerId ?? '',
                addressName: editingAddress?.id ?? '',
            },
        },
        body: {} as ShopperCustomers.schemas['CustomerAddress'],
    });

    const applyPendingAddressToBasket = () => {
        if (pendingEditAddressRef.current) {
            onSubmit(pendingEditAddressRef.current);
            pendingEditAddressRef.current = null;
            setEditingAddress(null);
            setAddressModalOpen(false);
        }
    };

    const handleUpdateError = () => {
        // Clear the in-flight marker so subsequent close/save calls aren't blocked, but
        // keep `editingAddress` so the modal stays in edit mode and the user can retry.
        pendingEditAddressRef.current = null;
        toast.error(tErrors('checkout.addressValidationFailed'));
    };

    useScapiFetcherEffect(updateAddressFetcher, {
        onSuccess: applyPendingAddressToBasket,
        onError: handleUpdateError,
    });

    useEffect(() => {
        if (pendingAddAddressRef.current && !isLoading) {
            // Only close modal if there were no errors
            if (!actionData?.error && !actionData?.fieldErrors) {
                pendingAddAddressRef.current = false;
                setAddressModalOpen(false);
            } else {
                // There was an error, keep modal open but reset flag so user can retry
                pendingAddAddressRef.current = false;
            }
        }
    }, [isLoading, actionData]);

    const isModalSaving = isEditMode
        ? updateAddressFetcher.state === 'submitting' || pendingEditAddressRef.current !== null
        : pendingAddAddressRef.current && isLoading;

    const handleEditAddress = (addressId: string) => {
        const address = savedAddresses.find((a) => a.id === addressId);
        if (!address) return;
        setEditingAddress(address);
        setAddressModalOpen(true);
    };

    const handleAddressModalSave = (data: ShopperCustomers.schemas['CustomerAddress']) => {
        const formData = new FormData();
        for (const [key, value] of Object.entries(data)) {
            if (value != null) formData.append(key, String(value));
        }

        if (isEditMode && customerId && editingAddress?.id) {
            pendingEditAddressRef.current = formData;
            void updateAddressFetcher.submit(data);
        } else {
            pendingAddAddressRef.current = true;
            onSubmit(formData);
        }
    };

    const handleAddressModalClose = (open: boolean) => {
        if (!open) {
            if (isModalSaving) return;
            setAddressModalOpen(false);
            if (!pendingEditAddressRef.current) setEditingAddress(null);
        }
    };

    const handleFormSubmit = (data: ShippingAddressData) => {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            if (value != null && value !== '') {
                formData.append(key, value);
            }
        });
        if (!formData.has('countryCode')) {
            formData.append('countryCode', DEFAULT_COUNTRY_CODE);
        }
        onSubmit(formData);
    };

    const handleSavedAddressSubmit = () => {
        const address = savedAddresses.find((a) => a.id === effectiveSelectedId);
        if (!address) return;
        const formData = addressToFormData(address);
        onSubmit(formData);
    };

    const stepTitle = t('shippingAddress.title');

    return (
        <ToggleCard
            id="shipping-address"
            title={stepTitle}
            titleAs="h2"
            titleClassName="text-2xl font-bold tracking-tight text-card-foreground"
            editing={isEditing}
            disableEdit={!isCompleted && !isEditing}
            onEdit={onEdit}
            editLabel={t('common.edit')}
            showHeaderSeparator
            // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
            editAction={
                enableMultiAddress && !hasSavedAddresses ? tMultiship('checkout.deliverToMultipleAddresses') : undefined
            }
            editActionClassName={
                enableMultiAddress && !hasSavedAddresses ? 'text-xs font-normal leading-normal h-auto' : undefined
            }
            onEditActionClick={enableMultiAddress && !hasSavedAddresses ? handleToggleShippingAddressMode : undefined}
            // @sfdc-extension-block-end SFDC_EXT_MULTISHIP
            isLoading={isLoading}>
            <ToggleCardEdit>
                {hasSavedAddresses ? (
                    <div className="flex flex-col gap-4 pt-2 pb-2">
                        {/* Saved-address action buttons: above the list, outside the heading */}
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-36 font-medium text-secondary-foreground sm:w-auto"
                                onClick={() => setAddressModalOpen(true)}
                                aria-label={t('shippingAddress.addNewAddressButton')}>
                                {t('shippingAddress.addNewAddressButton')}
                            </Button>
                            {/* @sfdc-extension-block-start SFDC_EXT_MULTISHIP */}
                            {enableMultiAddress && (
                                <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="h-auto w-36 cursor-pointer justify-start whitespace-normal px-0 text-left text-xs font-medium leading-normal sm:w-auto sm:justify-center"
                                    onClick={handleToggleShippingAddressMode}>
                                    {tMultiship('checkout.deliverToMultipleAddresses')}
                                </Button>
                            )}
                            {/* @sfdc-extension-block-end SFDC_EXT_MULTISHIP */}
                        </div>
                        <SavedAddressesList
                            addresses={savedAddresses}
                            value={effectiveSelectedId}
                            onValueChange={setSelectedAddressId}
                            onEditAddress={handleEditAddress}
                        />
                        <div
                            data-checkout-mobile-bar
                            className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background px-6 py-4 lg:static lg:inset-auto lg:z-auto lg:w-full lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
                            <Button
                                type="button"
                                disabled={isLoading}
                                className="w-full"
                                onClick={handleSavedAddressSubmit}>
                                {isLoading ? t('shippingAddress.saving') : t('shippingAddress.continue')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Form {...form}>
                        <form
                            onSubmit={(e) => void form.handleSubmit(handleFormSubmit)(e)}
                            className="flex flex-col gap-4 pt-2 pb-2">
                            <AddressFormFields
                                form={form}
                                showPhone={false}
                                showCountry={true}
                                autoFocus={isEditing}
                                autoFocusField="firstName"
                                countryCode={DEFAULT_COUNTRY_CODE}
                            />
                            <div
                                data-checkout-mobile-bar
                                className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background px-6 py-4 lg:static lg:inset-auto lg:z-auto lg:w-full lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
                                <Button type="submit" disabled={isLoading} className="w-full">
                                    {isLoading ? t('shippingAddress.saving') : t('shippingAddress.continue')}
                                </Button>
                            </div>
                        </form>
                    </Form>
                )}
            </ToggleCardEdit>

            <ToggleCardSummary>
                {shippingAddress && !isAddressEmpty(shippingAddress) ? (
                    <ShippingAddressDisplay address={shippingAddress} />
                ) : (
                    <p className="text-sm text-muted-foreground">{t('shippingAddress.completePreviousSteps')}</p>
                )}
            </ToggleCardSummary>
            <AddressModal
                open={addressModalOpen}
                onOpenChange={handleAddressModalClose}
                isEditMode={isEditMode}
                countryCode={editingAddress?.countryCode ?? DEFAULT_COUNTRY_CODE}
                defaultValues={editingAddress ? { ...editingAddress, addressId: editingAddress.id } : undefined}
                onSave={handleAddressModalSave}
                isLoading={!!isModalSaving}
            />
        </ToggleCard>
    );
}
