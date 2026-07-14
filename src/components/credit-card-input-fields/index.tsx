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
import { useState } from 'react';
import { type UseFormReturn, type FieldValues, type Path } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormInput } from '@/components/form-fields';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCardNumber, formatExpiryDate } from '@/lib/form-utils';
import { detectCardType } from '@/lib/payment/payment-utils';
import { getCardIcon } from '@/lib/payment/card-icon-utils';
import { Info, Eye, EyeOff } from 'lucide-react';

// Define the field structure for credit card forms (optional to support forms where card fields are conditionally required, e.g. payment step)
export interface CreditCardFormFields {
    cardNumber?: string;
    cardholderName?: string;
    expiryDate?: string;
    cvv?: string;
    saveAsDefault?: boolean;
}

export interface CreditCardInputFieldsProps<TFormValues extends FieldValues & Partial<CreditCardFormFields>> {
    /** React Hook Form instance */
    form: UseFormReturn<TFormValues>;
    /** Whether to auto-focus the cardholder name field when the form is shown (default: false) */
    autoFocus?: boolean;
    /** Whether to show the "save as default" checkbox (default: false) */
    showIsDefaultOption?: boolean;
    /** Label for the "save as default" checkbox */
    defaultOptionLabel?: string;
}

/**
 * Reusable credit card input fields component.
 * Renders card number, cardholder name, expiry date, and CVV fields with validation and formatting.
 * Used in both checkout and account payment methods flows.
 */
export function CreditCardInputFields<TFormValues extends FieldValues & Partial<CreditCardFormFields>>({
    form,
    autoFocus = false,
    showIsDefaultOption = false,
    defaultOptionLabel,
}: CreditCardInputFieldsProps<TFormValues>) {
    const { t } = useTranslation('checkout');
    const [detectedCardType, setDetectedCardType] = useState<string>('');
    const [cvvVisible, setCvvVisible] = useState(false);

    return (
        <>
            <FormField
                control={form.control}
                name={'cardholderName' as Path<TFormValues>}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="sr-only">{t('payment.nameOnCardLabel')}</FormLabel>
                        <FormInput
                            placeholder={t('payment.cardholderPlaceholder')}
                            autoComplete="cc-name"
                            autoFocus={autoFocus}
                            {...field}
                        />
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name={'cardNumber' as Path<TFormValues>}
                render={({ field }) => {
                    const CardIcon = getCardIcon(detectedCardType || t('payment.unknownCardType'));
                    const showCardIcon = detectedCardType && detectedCardType !== t('payment.unknownCardType');
                    return (
                        <FormItem>
                            <FormLabel className="sr-only">{t('payment.cardNumberLabel')}</FormLabel>
                            <div className="relative flex items-center">
                                <FormInput
                                    placeholder={t('payment.cardNumberPlaceholder')}
                                    autoComplete="cc-number"
                                    maxLength={23}
                                    className={showCardIcon ? 'pr-12' : ''}
                                    {...field}
                                    onChange={(e) => {
                                        const formatted = formatCardNumber(e.target.value);
                                        field.onChange(formatted);
                                        const cardType = detectCardType(e.target.value);
                                        setDetectedCardType(cardType);
                                    }}
                                />
                                {showCardIcon && (
                                    <div
                                        className="absolute left-auto right-3 top-1/2 -translate-y-1/2 z-10 flex items-center pointer-events-none"
                                        aria-hidden>
                                        <CardIcon className="w-8 h-5 flex-shrink-0 text-muted-foreground" />
                                    </div>
                                )}
                            </div>
                            <FormMessage />
                        </FormItem>
                    );
                }}
            />

            <div className="grid grid-cols-2 gap-2">
                <FormField
                    control={form.control}
                    name={'expiryDate' as Path<TFormValues>}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="sr-only">{t('payment.expiryDateLabel')}*</FormLabel>
                            <FormInput
                                placeholder={t('payment.expiryPlaceholder')}
                                autoComplete="cc-exp"
                                maxLength={5}
                                {...field}
                                onChange={(e) => {
                                    const formatted = formatExpiryDate(e.target.value);
                                    field.onChange(formatted);
                                }}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name={'cvv' as Path<TFormValues>}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="sr-only">{t('payment.cvvLabel')}</FormLabel>
                            <div className="relative flex items-center">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center size-5 rounded-ui text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            aria-label={t('payment.cvvHelp')}>
                                            <Info className="size-4 shrink-0" strokeWidth={2.25} />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={4} className="px-4 py-2">
                                        {t('payment.cvvHelp')}
                                    </TooltipContent>
                                </Tooltip>
                                <FormInput
                                    type={cvvVisible ? 'text' : 'password'}
                                    inputMode="numeric"
                                    placeholder={t('payment.cvvPlaceholder')}
                                    autoComplete="cc-csc"
                                    maxLength={4}
                                    className="pl-10 pr-10"
                                    {...field}
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, '');
                                        field.onChange(digits);
                                    }}
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center size-5 rounded-ui text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => setCvvVisible((v) => !v)}
                                    aria-label={cvvVisible ? t('payment.cvvHide') : t('payment.cvvShow')}>
                                    {cvvVisible ? (
                                        <EyeOff className="size-4 shrink-0" strokeWidth={2.25} />
                                    ) : (
                                        <Eye className="size-4 shrink-0" strokeWidth={2.25} />
                                    )}
                                </button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {showIsDefaultOption && (
                <FormField
                    control={form.control}
                    name={'saveAsDefault' as Path<TFormValues>}
                    render={({ field }) => (
                        <FormItem className="flex items-center gap-2 pt-1 space-y-0">
                            <FormControl>
                                <Checkbox id="save-default" checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel htmlFor="save-default" className="text-sm text-foreground/80 cursor-pointer">
                                {defaultOptionLabel ?? (t as (key: string) => string)('payment.saveAsDefault')}
                            </FormLabel>
                        </FormItem>
                    )}
                />
            )}
        </>
    );
}

export default CreditCardInputFields;
