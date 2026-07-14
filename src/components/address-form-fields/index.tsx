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
import { useMemo, useState, type ChangeEvent } from 'react';
import { type UseFormReturn, type FieldValues, type Path } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FormInput, FormNativeSelect } from '@/components/form-fields';
import { NativeSelectOption } from '@/components/ui/native-select';
import { COUNTRY_CODES } from '@/components/customer-address-form/constants';
import AddressSuggestionDropdown, { type AddressSuggestion } from '@/components/address-suggestion-dropdown';
import { MIN_INPUT_LENGTH, useAutocompleteSuggestions } from '@/hooks/use-autocomplete-suggestions';
import { processAddressSuggestion } from '@/lib/address/address-suggestions';
import { UITarget } from '@/targets/ui-target';
import { getCommonPhoneCountryCodes } from '@/lib/address/country-codes';
import { formatPhoneInput, stripNonDigits, stripCountryCode } from '@/lib/address/phone-utils';

/**
 * Base address field names that the form must support
 */
export interface AddressFields {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    stateCode: string;
    postalCode: string;
    phoneCountryCode?: string;
    phone?: string;
}

/**
 * Props for the AddressFormFields component
 */
export interface AddressFormFieldsProps<TFormValues extends FieldValues> {
    /** React Hook Form instance */
    form: UseFormReturn<TFormValues>;
    /**
     * Prefix for field names (e.g., 'billing' for billing address fields).
     * When provided, field names become 'billingFirstName', 'billingAddress1', etc.
     * When empty, field names are 'firstName', 'address1', etc.
     */
    fieldPrefix?: string;
    /** Whether to show the phone field (default: true) */
    showPhone?: boolean;
    /** Whether to auto-focus a field when the form is shown (default: false) */
    autoFocus?: boolean;
    /** Which field to focus when autoFocus is true: 'firstName' or 'address1' (default: 'address1') */
    autoFocusField?: 'firstName' | 'address1';
    /** Country code for address autocomplete (default: 'US') */
    countryCode?: string;
    /** Custom class name for the container */
    className?: string;
    /** When true, hide labels and use placeholders only (e.g. for billing address UX) */
    labelsAsPlaceholders?: boolean;
    /** When true, show Country dropdown (e.g. for billing address) */
    showCountry?: boolean;
    /** When true, phone is required (append * to label / placeholder when using placeholder labels) */
    phoneRequired?: boolean;
}

/**
 * Shared address form fields component with Google Maps autocomplete integration.
 *
 * This component renders address form fields (firstName, lastName, address1, address2,
 * city, stateCode, postalCode, and optionally phone) with address autocomplete
 * functionality powered by Google Maps Places API.
 *
 * @example
 * ```tsx
 * // For shipping address (no prefix)
 * <AddressFormFields form={form} showPhone={true} autoFocus={isEditing} />
 *
 * // For billing address (with prefix)
 * <AddressFormFields form={form} fieldPrefix="billing" showPhone={false} />
 * ```
 */
export function AddressFormFields<TFormValues extends FieldValues>({
    form,
    fieldPrefix = '',
    showPhone = true,
    autoFocus = false,
    autoFocusField = 'address1',
    countryCode = 'US',
    className,
    labelsAsPlaceholders = false,
    showCountry = false,
    phoneRequired = false,
}: AddressFormFieldsProps<TFormValues>) {
    const { t } = useTranslation('checkout');
    const { t: tCountries } = useTranslation('countries');

    // Address autocomplete state
    const [addressInput, setAddressInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Use the autocomplete suggestions hook for Google Maps Places API
    const {
        suggestions: addressSuggestions,
        isLoading: isLoadingSuggestions,
        resetSession,
    } = useAutocompleteSuggestions({
        inputString: addressInput,
        countryCode,
    });

    // Country code options for phone number
    const countryCodeOptions = useMemo(
        () =>
            getCommonPhoneCountryCodes()
                .filter((c, i, arr) => arr.findIndex((x) => x.dialingCode === c.dialingCode) === i)
                .map((c) => (
                    <option key={c.dialingCode} value={c.dialingCode}>
                        {c.dialingCode}
                    </option>
                )),
        []
    );

    /**
     * Helper to construct field names with optional prefix
     * e.g., with prefix 'billing': 'firstName' becomes 'billingFirstName'
     */
    const getFieldName = (baseName: string): Path<TFormValues> => {
        if (!fieldPrefix) {
            return baseName as Path<TFormValues>;
        }
        // Capitalize first letter of baseName when prefixing
        const capitalizedBaseName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        return `${fieldPrefix}${capitalizedBaseName}` as Path<TFormValues>;
    };

    /**
     * Helper to construct autoComplete attribute with proper section prefix
     * e.g., with prefix 'billing': 'given-name' becomes 'billing given-name'
     * e.g., with prefix '' (shipping): 'given-name' becomes 'shipping given-name'
     */
    const getAutoComplete = (autoCompleteValue: string): string => {
        const section = fieldPrefix || 'shipping';
        return `${section} ${autoCompleteValue}`;
    };

    // When showCountry is true (e.g. billing), watch country so we can show State/Province and Zip Code/Postal Code labels
    const watchedCountry = showCountry ? form.watch(getFieldName('countryCode')) : undefined;
    const effectiveCountry = showCountry ? watchedCountry || countryCode || 'US' : countryCode || 'US';
    const useProvinceLabel = effectiveCountry === 'CA';
    const useZipLabel = effectiveCountry === 'US';

    const statesObj = useMemo(() => {
        return effectiveCountry && (effectiveCountry === 'US' || effectiveCountry === 'CA')
            ? (tCountries(`${effectiveCountry}.states`, { returnObjects: true }) as Record<string, string>)
            : null;
    }, [effectiveCountry, tCountries]);

    const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
        setShowSuggestions(false);

        // Process the suggestion to get structured address fields
        const addressFields = await processAddressSuggestion(suggestion);

        // Populate address form fields using the prefixed field names
        form.setValue(getFieldName('address1'), addressFields.address1 as TFormValues[Path<TFormValues>]);
        if (addressFields.city) {
            form.setValue(getFieldName('city'), addressFields.city as TFormValues[Path<TFormValues>]);
        }
        if (addressFields.stateCode) {
            form.setValue(getFieldName('stateCode'), addressFields.stateCode as TFormValues[Path<TFormValues>]);
        }
        if (addressFields.postalCode) {
            form.setValue(getFieldName('postalCode'), addressFields.postalCode as TFormValues[Path<TFormValues>]);
        }

        // Reset the autocomplete session after selection
        resetSession();
        setAddressInput('');
    };

    const handleCloseSuggestions = () => {
        setShowSuggestions(false);
    };

    const handleAddressInputChange = (e: ChangeEvent<HTMLInputElement>, fieldOnChange: (value: string) => void) => {
        const value = e.target.value;
        fieldOnChange(value);
        setAddressInput(value);
        // Show suggestions dropdown when user starts typing
        if (value.length >= MIN_INPUT_LENGTH) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    /**
     * Renders the address autocomplete dropdown with target extensibility.
     * Uses different targetIds for shipping vs billing addresses to allow
     * extension developers to customize each independently.
     */
    const renderAddressAutocomplete = (): React.ReactNode => {
        if (!showSuggestions || addressSuggestions.length === 0) {
            return null;
        }

        const dropdown = (
            <AddressSuggestionDropdown
                suggestions={addressSuggestions}
                isVisible={showSuggestions}
                isLoading={isLoadingSuggestions}
                onClose={handleCloseSuggestions}
                onSelectSuggestion={(suggestion) => void handleSelectSuggestion(suggestion)}
            />
        );

        if (fieldPrefix === 'billing') {
            return (
                <div>
                    <UITarget targetId="sfcc.checkout.payment.billingAddress.autocomplete">{dropdown}</UITarget>
                </div>
            );
        }

        // Default: shipping address (no fieldPrefix)
        return (
            <div>
                <UITarget targetId="sfcc.checkout.shippingAddress.autocomplete">{dropdown}</UITarget>
            </div>
        );
    };

    return (
        <div className={className}>
            {/* First Name and Last Name Row */}
            <div className="grid grid-cols-2 gap-2 mb-4 items-start">
                <FormField
                    control={form.control}
                    name={getFieldName('firstName')}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                {t('addressForm.firstNameLabel')}*
                            </FormLabel>
                            <FormInput
                                placeholder={
                                    labelsAsPlaceholders
                                        ? `${t('addressForm.firstNameLabel')}*`
                                        : t('addressForm.firstNamePlaceholder')
                                }
                                autoComplete={getAutoComplete('given-name')}
                                autoFocus={autoFocus && autoFocusField === 'firstName'}
                                {...field}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name={getFieldName('lastName')}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                {t('addressForm.lastNameLabel')}*
                            </FormLabel>
                            <FormInput
                                placeholder={
                                    labelsAsPlaceholders
                                        ? `${t('addressForm.lastNameLabel')}*`
                                        : t('addressForm.lastNamePlaceholder')
                                }
                                autoComplete={getAutoComplete('family-name')}
                                {...field}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Address Line 1 with Autocomplete */}
            <div className="mb-4">
                <FormField
                    control={form.control}
                    name={getFieldName('address1')}
                    render={({ field }) => (
                        <FormItem className="relative">
                            <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                {t('addressForm.addressLabel')}*
                            </FormLabel>
                            <FormInput
                                placeholder={
                                    labelsAsPlaceholders
                                        ? `${t('addressForm.addressLabel')}*`
                                        : t('addressForm.addressPlaceholder')
                                }
                                autoComplete={getAutoComplete('street-address')}
                                autoFocus={autoFocus && autoFocusField === 'address1'}
                                {...field}
                                onChange={(e) => handleAddressInputChange(e, field.onChange)}
                            />
                            {renderAddressAutocomplete()}
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Address Line 2 */}
            <div className="mb-4">
                <FormField
                    control={form.control}
                    name={getFieldName('address2')}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                {t('addressForm.address2Label')}
                            </FormLabel>
                            <FormInput
                                placeholder={t('addressForm.address2Placeholder')}
                                autoComplete={getAutoComplete('address-line2')}
                                {...field}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* City and State / Province Row */}
            <div className="grid grid-cols-2 gap-2 mb-4 items-start">
                <FormField
                    control={form.control}
                    name={getFieldName('city')}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                {t('addressForm.cityLabel')}*
                            </FormLabel>
                            <FormInput
                                placeholder={
                                    labelsAsPlaceholders
                                        ? `${t('addressForm.cityLabel')}*`
                                        : t('addressForm.cityPlaceholder')
                                }
                                autoComplete={getAutoComplete('address-level2')}
                                {...field}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name={getFieldName('stateCode')}
                    render={({ field }) => {
                        const stateOptions = statesObj ? Object.entries(statesObj) : [];
                        const stateLabel = useProvinceLabel
                            ? t('addressForm.provinceLabel')
                            : t('addressForm.stateLabel');
                        const statePlaceholder = useProvinceLabel
                            ? t('addressForm.provincePlaceholder')
                            : t('addressForm.statePlaceholder');

                        return (
                            <FormItem className="[&_[data-slot=native-select-wrapper]]:w-full">
                                <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                    {stateLabel}*
                                </FormLabel>
                                {stateOptions.length > 0 ? (
                                    <FormNativeSelect
                                        autoComplete={getAutoComplete('address-level1')}
                                        className={!field.value ? 'text-muted-foreground' : ''}
                                        {...field}
                                        value={field.value || ''}
                                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                            field.onChange(e.target.value)
                                        }>
                                        <NativeSelectOption value="" className="text-muted-foreground">
                                            {labelsAsPlaceholders ? `${stateLabel}*` : statePlaceholder}
                                        </NativeSelectOption>
                                        {stateOptions.map(([code, name]) => (
                                            <NativeSelectOption key={code} value={code}>
                                                {name}
                                            </NativeSelectOption>
                                        ))}
                                    </FormNativeSelect>
                                ) : (
                                    <FormInput
                                        placeholder={labelsAsPlaceholders ? `${stateLabel}*` : statePlaceholder}
                                        autoComplete={getAutoComplete('address-level1')}
                                        {...field}
                                    />
                                )}
                                <FormMessage />
                            </FormItem>
                        );
                    }}
                />
            </div>

            {/* Zip Code / Postal Code and Country Row */}
            <div className={`grid grid-cols-2 gap-2 items-start ${showPhone ? 'mb-4' : ''}`}>
                <FormField
                    control={form.control}
                    name={getFieldName('postalCode')}
                    render={({ field }) => {
                        const postalLabel = useZipLabel ? t('addressForm.zipLabel') : t('addressForm.postalCodeLabel');
                        const postalPlaceholder = useZipLabel
                            ? t('addressForm.zipPlaceholder')
                            : t('addressForm.postalCodePlaceholder');
                        return (
                            <FormItem>
                                <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                    {postalLabel}*
                                </FormLabel>
                                <FormInput
                                    placeholder={labelsAsPlaceholders ? `${postalLabel}*` : postalPlaceholder}
                                    autoComplete={getAutoComplete('postal-code')}
                                    {...field}
                                />
                                <FormMessage />
                            </FormItem>
                        );
                    }}
                />

                {showCountry ? (
                    <FormField
                        control={form.control}
                        name={getFieldName('countryCode')}
                        render={({ field }) => (
                            <FormItem className="[&_[data-slot=native-select-wrapper]]:w-full">
                                <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                    {t('addressForm.countryLabel')}*
                                </FormLabel>
                                <FormNativeSelect
                                    autoComplete={getAutoComplete('country')}
                                    aria-label={t('addressForm.countryLabel')}
                                    {...field}
                                    value={field.value || 'US'}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                        field.onChange(e.target.value || 'US')
                                    }>
                                    {COUNTRY_CODES.map((code) => (
                                        <NativeSelectOption key={code} value={code}>
                                            {tCountries(`${code}.name`)}
                                        </NativeSelectOption>
                                    ))}
                                </FormNativeSelect>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : (
                    <FormItem>
                        <FormLabel>{t('addressForm.countryLabel')}*</FormLabel>
                        <Input
                            value={tCountries(`${countryCode}.name` as `US.name`)}
                            readOnly
                            aria-label={t('addressForm.countryLabel')}
                            className="text-foreground bg-background cursor-default"
                            tabIndex={-1}
                        />
                    </FormItem>
                )}
            </div>

            {/* Phone Field (optional) */}
            {showPhone && (
                <div className="flex items-start gap-2">
                    <FormField
                        control={form.control}
                        name={getFieldName('phoneCountryCode')}
                        render={({ field }) => (
                            <FormItem className="w-20">
                                <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                    {t('addressForm.codeLabel')}
                                </FormLabel>
                                <FormNativeSelect
                                    aria-label={t('addressForm.codeLabel')}
                                    value={field.value || '+1'}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => field.onChange(e.target.value)}>
                                    {countryCodeOptions}
                                </FormNativeSelect>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name={getFieldName('phone')}
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormLabel className={labelsAsPlaceholders ? 'sr-only' : undefined}>
                                    {t('addressForm.phoneLabel')}
                                    {phoneRequired ? '*' : ''}
                                </FormLabel>
                                <FormInput
                                    type="tel"
                                    inputMode="numeric"
                                    placeholder={
                                        labelsAsPlaceholders && phoneRequired
                                            ? `${t('addressForm.phoneLabel')}*`
                                            : t('addressForm.phonePlaceholder')
                                    }
                                    autoComplete="tel-national"
                                    maxLength={14}
                                    {...field}
                                    value={stripCountryCode(field.value || '')}
                                    onChange={(e) => {
                                        field.onChange(stripNonDigits(e.target.value).slice(0, 10));
                                    }}
                                    onBlur={(e) => {
                                        field.onBlur();
                                        field.onChange(formatPhoneInput(e.target.value));
                                    }}
                                    onFocus={(e) => {
                                        const digits = stripNonDigits(e.target.value);
                                        if (digits !== e.target.value) field.onChange(digits);
                                    }}
                                />
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}
        </div>
    );
}

export default AddressFormFields;
