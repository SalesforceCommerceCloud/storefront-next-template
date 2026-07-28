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
import { useMemo, useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AddressFormFields } from '@/components/address-form-fields';
import { FormInput } from '@/components/form-fields';
import { createShippingAddressSchema } from '@/lib/checkout/schemas';
import { usPostalCodeRegex, canadianPostalCodeRegex } from '@/components/customer-address-form/constants';
import type { ShopperCustomers } from '@/scapi';
import { stripCountryCode, extractCountryCode } from '@/lib/address/phone-utils';

function createAddressModalSchema(
    t: TFunction,
    options: { showAddressId: boolean; strictValidation: boolean },
    errorMessages?: {
        stateRequired?: string;
        postalCodeRequired?: string;
        phoneRequired?: string;
        invalidPostalCode?: string;
    }
) {
    const base = createShippingAddressSchema(t).extend({
        countryCode: z.string().min(1),
        addressId: options.showAddressId ? z.string().min(1).max(256) : z.string(),
        preferred: z.boolean().optional().default(false),
        stateCode: z.string().min(1, t('shippingAddress.stateRequired')),
        postalCode: z.string().min(1, t('shippingAddress.postalCodeRequired')),
    });

    if (!options.strictValidation) {
        return base;
    }

    return base
        .extend({
            stateCode: z.string().min(1, errorMessages?.stateRequired),
            postalCode: z.string().min(1, errorMessages?.postalCodeRequired),
            phone: z.string().min(1, errorMessages?.phoneRequired).max(32),
        })
        .refine(
            (data) => {
                if (data.countryCode === 'US') {
                    return usPostalCodeRegex.test(data.postalCode);
                }
                if (data.countryCode === 'CA') {
                    return canadianPostalCodeRegex.test(data.postalCode);
                }
                return true;
            },
            {
                message: errorMessages?.invalidPostalCode ?? '',
                path: ['postalCode'],
            }
        );
}

export interface AddressModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When true, the modal shows "Edit Address" title instead of "Add Address". Default: false */
    isEditMode?: boolean;
    /** Optional default country code. Defaults to 'US' if omitted. */
    countryCode?: string;
    onSave?: (data: ShopperCustomers.schemas['CustomerAddress']) => void;
    /** Optional default values to populate the form fields */
    defaultValues?: Partial<ShopperCustomers.schemas['CustomerAddress']>;
    /** Show the address title/label field (e.g. "Home", "Work"). Default: false */
    showAddressId?: boolean;
    /** Show phone field. Default: false */
    showPhone?: boolean;
    /** Show country selector. Default: true */
    showCountry?: boolean;
    /** When true, hide labels and use placeholders only. Default: false */
    labelsAsPlaceholders?: boolean;
    /**
     * Enable strict validation: phone, stateCode, and postalCode become required,
     * and country-specific postal code format is validated.
     */
    strictValidation?: boolean;
    /**
     * When provided, the modal delegates close-on-save to the parent.
     * Buttons are disabled and the save button shows "Saving..." while true.
     */
    isLoading?: boolean;
}

/**
 * Address modal for adding a new shipping address during checkout.
 *
 * Supports both single-address checkout and multi-address (multiship) scenarios
 * through configurable props. Uses shared {@link AddressFormFields} for address entry
 * with Google Maps autocomplete support.
 */
export function AddressModal({
    open,
    onOpenChange,
    isEditMode = false,
    countryCode = 'US',
    onSave,
    defaultValues,
    showAddressId = false,
    showPhone = false,
    showCountry = true,
    labelsAsPlaceholders = false,
    strictValidation = false,
    isLoading,
}: AddressModalProps) {
    const { t } = useTranslation('checkout');
    const { t: tAccount } = useTranslation('account');
    const { t: tErrors } = useTranslation('errors');

    const schema = useMemo(
        () =>
            createAddressModalSchema(
                t as unknown as TFunction,
                { showAddressId, strictValidation },
                strictValidation
                    ? {
                          stateRequired: tAccount('addressForm.validation.stateRequired'),
                          postalCodeRequired: tErrors('customer.postalCodeRequired'),
                          phoneRequired: tAccount('addressForm.validation.phoneRequired'),
                          invalidPostalCode: tErrors('validation.invalidPostalCode'),
                      }
                    : undefined
            ),
        [t, tAccount, tErrors, showAddressId, strictValidation]
    );

    const form = useForm<Partial<ShopperCustomers.schemas['CustomerAddress'] & { phoneCountryCode?: string }>>({
        // Schema validates a stricter set of fields than `Partial<CustomerAddress>` exposes
        // (e.g., `address1` is required by the schema but optional in `Partial<>`).
        // The Resolver generic mismatch is intentional — at runtime the schema enforces
        // the required fields. Cast to satisfy TS without polluting consumers with the
        // schema's exact input type.
        resolver: zodResolver(schema) as Resolver<
            Partial<ShopperCustomers.schemas['CustomerAddress'] & { phoneCountryCode?: string }>
        >,
        defaultValues: {
            addressId: defaultValues?.addressId || '',
            firstName: defaultValues?.firstName || '',
            lastName: defaultValues?.lastName || '',
            address1: defaultValues?.address1 || '',
            address2: defaultValues?.address2 || '',
            city: defaultValues?.city || '',
            stateCode: defaultValues?.stateCode || '',
            postalCode: defaultValues?.postalCode || '',
            phoneCountryCode: extractCountryCode(defaultValues?.phone || ''),
            phone: stripCountryCode(defaultValues?.phone || ''),
            countryCode: defaultValues?.countryCode || countryCode,
            preferred: defaultValues?.preferred ?? false,
        },
    });

    useEffect(() => {
        if (open) {
            form.reset({
                addressId: defaultValues?.addressId || '',
                firstName: defaultValues?.firstName || '',
                lastName: defaultValues?.lastName || '',
                address1: defaultValues?.address1 || '',
                address2: defaultValues?.address2 || '',
                city: defaultValues?.city || '',
                stateCode: defaultValues?.stateCode || '',
                postalCode: defaultValues?.postalCode || '',
                phoneCountryCode: extractCountryCode(defaultValues?.phone || ''),
                phone: stripCountryCode(defaultValues?.phone || ''),
                countryCode: defaultValues?.countryCode || countryCode,
                preferred: defaultValues?.preferred ?? false,
            });
        }
        // Reset only when dialog opens; defaultValues is captured from the closure
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [open, form, countryCode]);

    const handleCancel = () => {
        onOpenChange(false);
    };

    const handleSave = (formData: Partial<ShopperCustomers.schemas['CustomerAddress']>) => {
        const data = formData as ShopperCustomers.schemas['CustomerAddress'] & { phoneCountryCode?: string };
        // Combine phoneCountryCode and phone into a single phone field
        const phone =
            data.phone && data.phoneCountryCode ? `${data.phoneCountryCode} ${data.phone}`.trim() : data.phone || '';

        // Remove phoneCountryCode from the result as it's not part of SCAPI schema
        // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        const { phoneCountryCode, ...addressData } = data;

        const result: ShopperCustomers.schemas['CustomerAddress'] = {
            ...addressData,
            phone,
        };

        onSave?.(result);
        if (isLoading === undefined) {
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Radix Content uses an internal titleId for aria-labelledby; setting id on DialogTitle overrides the DOM id only, so we align labelledby for E2E and AT. */}
            <DialogContent
                className="w-full max-w-[calc(100%-2rem)] sm:min-w-[32rem] sm:max-w-2xl border border-border bg-card shadow-lg gap-0 p-0 overflow-hidden"
                showCloseButton
                aria-labelledby="address-modal-title"
                aria-describedby="address-modal-desc">
                <DialogHeader className="pt-6 px-6 pb-4 gap-1.5 text-left border-b border-border">
                    <DialogTitle
                        id="address-modal-title"
                        className="text-base font-bold tracking-tight text-card-foreground">
                        {isEditMode ? t('addressModal.editTitle') : t('addressModal.title')}
                    </DialogTitle>
                    <DialogDescription id="address-modal-desc" className="sr-only">
                        {isEditMode ? t('addressModal.editDescription') : t('addressModal.description')}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        id="address-modal-form"
                        onSubmit={(e) => void form.handleSubmit(handleSave)(e)}
                        className="contents">
                        <div className="flex flex-col gap-6 px-6 py-8">
                            {showAddressId && (
                                <FormField
                                    control={form.control}
                                    name="addressId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                                {tAccount('addressForm.addressTitleLabel')}*
                                            </FormLabel>
                                            <FormInput
                                                type="text"
                                                maxLength={256}
                                                placeholder={
                                                    labelsAsPlaceholders
                                                        ? `${tAccount('addressForm.addressTitleLabel')}*`
                                                        : tAccount('addressForm.addressTitlePlaceholder')
                                                }
                                                {...field}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <AddressFormFields<Partial<ShopperCustomers.schemas['CustomerAddress']>>
                                form={form}
                                showPhone={showPhone}
                                showCountry={showCountry}
                                countryCode={countryCode}
                                labelsAsPlaceholders={labelsAsPlaceholders}
                                phoneRequired={strictValidation && showPhone}
                            />
                        </div>
                        <DialogFooter className="flex flex-row gap-2 items-center justify-end pb-6 pt-0 px-6 border-t-0">
                            <Button
                                type="button"
                                variant="outline"
                                size="default"
                                className="h-9 px-4 py-2 text-sm font-medium text-foreground border border-input bg-background shadow-sm"
                                disabled={isLoading}
                                onClick={handleCancel}>
                                {t('addressModal.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                form="address-modal-form"
                                size="default"
                                disabled={isLoading}
                                className="h-9 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary shadow-sm">
                                {isLoading ? t('addressModal.saving') : t('addressModal.save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

export default AddressModal;
