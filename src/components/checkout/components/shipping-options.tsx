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
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { CheckoutActionData } from '../types';
import type { ShopperBasketsV2 } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { formatCurrency } from '@/lib/currency';
import { useShippingOptions } from './use-shipping-options';
import { formatDeliveryWindow } from '@/lib/date-utils';

interface ShippingOptionsProps {
    onSubmit: (formData: FormData) => void;
    /**
     * Called when the hook wants to auto-submit for price recalculation without advancing
     * the checkout step. Used after a shopper enters a new address so they see the options
     * with correct promotional prices before confirming.
     */
    onAutoSubmit?: (formData: FormData) => void;
    isLoading: boolean;
    actionData?: CheckoutActionData;
    shippingMethods?: ShopperBasketsV2.schemas['ShippingMethodResult'];
    validationError?: string | null;
    isCompleted: boolean;
    isEditing: boolean;
    onEdit: () => void;
    /**
     * True when the shopper just submitted a shipping address in this session. When set, the
     * auto-submit uses onAutoSubmit (recalculate-only, no step advance) so the shopper can
     * review the shipping options and their promotional prices before confirming.
     */
    justEnteredAddress?: boolean;
}

export default function ShippingOptions({
    onSubmit,
    onAutoSubmit,
    isLoading,
    actionData,
    shippingMethods,
    validationError: _validationError,
    isCompleted: _isCompleted,
    isEditing,
    onEdit,
    justEnteredAddress,
}: ShippingOptionsProps) {
    const { currency } = useSite();
    const { t, i18n } = useTranslation('checkout');

    const {
        availableShippingMethods,
        selectedMethod,
        summaryMethod,
        defaultShippingMethodId,
        isGuest,
        hideChangeForGuest,
        isUpcomingStep,
        getDiscountedPrice,
        handleSubmit,
    } = useShippingOptions({
        onSubmit,
        onAutoSubmit,
        isLoading,
        actionData,
        shippingMethods,
        isEditing,
        justEnteredAddress,
    });

    const stepTitle = t('shippingOptions.title');

    return (
        <ToggleCard
            id="shipping-options"
            title={stepTitle}
            titleAs="h2"
            titleClassName="text-2xl font-bold tracking-tight text-card-foreground"
            editing={isEditing}
            disabled={false}
            onEdit={onEdit}
            editLabel={t('common.edit')}
            disableEdit={hideChangeForGuest || isUpcomingStep}
            showHeaderSeparator
            isLoading={isLoading}>
            <ToggleCardEdit>
                <form method="post" className="flex flex-col gap-4 pt-2 pb-2" onSubmit={handleSubmit}>
                    <RadioGroup
                        name="shippingMethodId"
                        defaultValue={selectedMethod?.id || defaultShippingMethodId || ''}
                        required
                        aria-label={t('shippingOptions.title')}
                        className="flex flex-col gap-4">
                        {availableShippingMethods.map((method) => {
                            const deliveryWindowFormatted = formatDeliveryWindow(method.deliveryWindow, i18n.language);
                            return (
                                <label
                                    key={method.id}
                                    htmlFor={method.id}
                                    className="group flex cursor-pointer flex-col gap-1 rounded-ui border border-border-subtle p-4 transition-all duration-200 has-[[data-state=checked]]:border-foreground">
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem
                                            value={method.id}
                                            id={method.id}
                                            className="shrink-0"
                                            autoFocus={isEditing && availableShippingMethods.indexOf(method) === 0}
                                        />
                                        <span className="flex-1 text-sm font-medium leading-none">
                                            {deliveryWindowFormatted
                                                ? t('shippingOptions.deliveryWindow', {
                                                      window: deliveryWindowFormatted,
                                                  })
                                                : method.description || method.name}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            {method.shippingPromotions?.length &&
                                            method.price > 0 &&
                                            getDiscountedPrice(method.price) !== method.price ? (
                                                <>
                                                    <span className="text-sm text-muted-foreground line-through">
                                                        {formatCurrency(method.price, i18n.language, currency)}
                                                    </span>
                                                    <span className="text-sm font-semibold leading-none">
                                                        {getDiscountedPrice(method.price) === 0
                                                            ? t('shippingOptions.free')
                                                            : formatCurrency(
                                                                  getDiscountedPrice(method.price),
                                                                  i18n.language,
                                                                  currency
                                                              )}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-sm font-semibold leading-none">
                                                    {method.price === 0
                                                        ? t('shippingOptions.free')
                                                        : formatCurrency(method.price, i18n.language, currency)}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <span className="pl-6 text-sm text-foreground">{method.name}</span>
                                </label>
                            );
                        })}
                    </RadioGroup>

                    <div
                        data-checkout-mobile-bar
                        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background px-6 py-4 lg:static lg:inset-auto lg:z-auto lg:w-full lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
                        <Button
                            type="submit"
                            disabled={isLoading || availableShippingMethods.length === 0}
                            className="w-full">
                            {isLoading ? t('shippingOptions.saving') : t('shippingOptions.continue')}
                        </Button>
                    </div>
                </form>
            </ToggleCardEdit>

            <ToggleCardSummary>
                {summaryMethod ? (
                    <div className="space-y-1.5">
                        {(() => {
                            const summaryWindowFormatted = formatDeliveryWindow(
                                summaryMethod.deliveryWindow,
                                i18n.language
                            );
                            return (
                                <div className="space-y-1.5">
                                    {(summaryWindowFormatted || summaryMethod.description) && (
                                        <p className="text-sm font-normal leading-5 text-muted-foreground">
                                            {summaryWindowFormatted
                                                ? t('shippingOptions.deliveryWindow', {
                                                      window: summaryWindowFormatted,
                                                  })
                                                : summaryMethod.description}
                                        </p>
                                    )}
                                    <p className="text-sm font-normal leading-5 text-foreground">
                                        {summaryMethod.shippingPromotions?.length &&
                                        summaryMethod.price > 0 &&
                                        getDiscountedPrice(summaryMethod.price) !== summaryMethod.price ? (
                                            <>
                                                <span className="text-foreground line-through">
                                                    {formatCurrency(summaryMethod.price, i18n.language, currency)}
                                                </span>{' '}
                                                {getDiscountedPrice(summaryMethod.price) === 0
                                                    ? t('shippingOptions.free')
                                                    : formatCurrency(
                                                          getDiscountedPrice(summaryMethod.price),
                                                          i18n.language,
                                                          currency
                                                      )}
                                                {' | '}
                                                {summaryMethod.name}
                                            </>
                                        ) : (
                                            t('shippingOptions.priceAndMethod', {
                                                price:
                                                    summaryMethod.price === 0
                                                        ? t('shippingOptions.free')
                                                        : formatCurrency(
                                                              summaryMethod.price ?? 0,
                                                              i18n.language,
                                                              currency
                                                          ),
                                                methodName: summaryMethod.name || '',
                                            })
                                        )}
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {isGuest ? t('shippingOptions.completePreviousSteps') : t('shippingOptions.enterAddressFirst')}
                    </p>
                )}
            </ToggleCardSummary>
        </ToggleCard>
    );
}
