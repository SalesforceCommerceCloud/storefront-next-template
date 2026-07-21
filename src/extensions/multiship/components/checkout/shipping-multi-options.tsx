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

/**
 * @fileoverview Shipping Multi-Options Component
 *
 * This component provides a multi-shipment shipping method selection interface for the checkout flow.
 * It allows customers to select shipping methods for each shipment in a multi-ship order.
 * The component automatically applies default shipping methods for returning customers while
 * requiring guest users to manually select their preferred shipping options.
 *
 * Features:
 * - Supports multiple shipments with individual shipping method selection
 * - Auto-applies default shipping methods for authenticated customers
 * - Displays shipping address and method details for each shipment
 * - Provides both edit and summary views using ToggleCard component
 * - Handles form submission and validation
 */

import { type FormEvent, useEffect, useMemo, useRef } from 'react';
import { ToggleCard, ToggleCardEdit, ToggleCardSummary } from '@/components/toggle-card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Typography } from '@/components/typography';
import { getDefaultShippingMethod } from '@/lib/customer/profile-utils';
import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';
import type { CheckoutActionData } from '@/components/checkout/types';
import type { ShopperBasketsV2 } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { formatAddress } from '@/lib/address/address-utils';
import { getShippingArrivalLabel } from '@/lib/checkout/shipping-arrival-label';

/**
 * Represents a shipping method option available for selection.
 *
 * @interface ShippingMethod
 */
interface ShippingMethod {
    /** Unique identifier for the shipping method */
    id: string;
    /** Display name of the shipping method */
    name: string;
    /** Optional description of the shipping method */
    description?: string;
    /** Price of the shipping method in the order currency */
    price: number;
    /** Optional estimated arrival time or date string */
    estimatedArrivalTime?: string;
    /** Optional structured delivery window (RFC 3339 timestamps); preferred over estimatedArrivalTime */
    deliveryWindow?: ShopperBasketsV2.schemas['DeliveryWindow'];
}

/**
 * Props for the ShippingMultiOptions component.
 *
 * @interface ShippingMultiOptionsProps
 */
interface ShippingMultiOptionsProps {
    /** Callback function invoked when the form is submitted with selected shipping methods */
    onSubmit: (formData: FormData) => void;
    /** Indicates whether a form submission is currently in progress */
    isLoading: boolean;
    /** Action data containing form errors or validation results from the server */
    actionData?: CheckoutActionData;
    /** Array of shipments in the order, each requiring a shipping method selection */
    shipments?: ShopperBasketsV2.schemas['Shipment'][];
    /** Map of shipment IDs to their available shipping methods and results */
    shippingMethodsMap?: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>;
    /** Indicates whether this checkout step has been completed (step state managed by container) */
    isCompleted: boolean;
    /** Indicates whether the component is currently in edit mode */
    isEditing: boolean;
    /** Callback function invoked when the user clicks to edit this step */
    onEdit: () => void;
}

/**
 * ShippingMultiOptions Component
 *
 * A React component that renders a multi-shipment shipping method selection interface.
 * This component allows customers to select shipping methods for each shipment in their order.
 *
 * The component automatically applies default shipping methods for authenticated customers
 * when they enter the shipping options step, while guest users must manually select
 * their preferred shipping methods.
 *
 * @component
 * @param {ShippingMultiOptionsProps} props - The component props
 * @param {function} props.onSubmit - Callback function invoked when the form is submitted with selected shipping methods
 * @param {boolean} props.isLoading - Indicates whether a form submission is currently in progress
 * @param {CheckoutActionData} [props.actionData] - Action data containing form errors or validation results
 * @param {ShopperBasketsV2.schemas['Shipment'][]} [props.shipments=[]] - Array of shipments in the order
 * @param {Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>} [props.shippingMethodsMap={}] - Map of shipment IDs to their available shipping methods
 * @param {boolean} props.isCompleted - Indicates whether this checkout step has been completed
 * @param {boolean} props.isEditing - Indicates whether the component is currently in edit mode
 * @param {function} props.onEdit - Callback function invoked when the user clicks to edit this step
 *
 * @returns {JSX.Element} The rendered shipping multi-options component
 *
 * @example
 * ```tsx
 * <ShippingMultiOptions
 *   onSubmit={handleSubmit}
 *   isLoading={false}
 *   shipments={shipments}
 *   shippingMethodsMap={methodsMap}
 *   isCompleted={false}
 *   isEditing={true}
 *   onEdit={() => setEditing(true)}
 * />
 * ```
 */
export default function ShippingMultiOptions({
    onSubmit,
    isLoading,
    actionData: _actionData,
    shipments = [],
    shippingMethodsMap = {},
    isCompleted: _isCompleted,
    isEditing,
    onEdit,
}: ShippingMultiOptionsProps) {
    const customerProfile = useCustomerProfile();
    const { t, i18n } = useTranslation('checkout');
    const { t: tMultiship } = useTranslation('extMultiship');
    // Track if we've already auto-submitted to prevent infinite loops
    const hasAutoSubmitted = useRef(false);

    // Process shipping methods for each shipment
    const shipmentsData = useMemo(() => {
        return shipments.map((shipment) => {
            const shippingMethods = shipment.shipmentId ? shippingMethodsMap[shipment.shipmentId] : undefined;

            const availableShippingMethods: ShippingMethod[] =
                shippingMethods?.applicableShippingMethods
                    ?.filter(
                        (method) => method.id && method.name && typeof method.price === 'number' && !isNaN(method.price)
                    )
                    .map((method) => ({
                        id: method.id ?? '',
                        name: method.name ?? '',
                        description: method.description,
                        price: method.price ?? 0,
                        estimatedArrivalTime: (method.estimatedArrivalTime ?? method.c_estimatedArrivalTime) as
                            | string
                            | undefined,
                        deliveryWindow: method.deliveryWindow,
                    })) || [];

            const selectedMethod = shipment.shippingMethod;
            const defaultShippingMethodId = getDefaultShippingMethod(
                availableShippingMethods,
                selectedMethod,
                shippingMethods?.defaultShippingMethodId
            );

            return {
                shipment,
                availableShippingMethods,
                selectedMethod,
                defaultShippingMethodId,
                shippingMethods,
            };
        });
    }, [shipments, shippingMethodsMap]);

    // Auto-apply default shipping methods for returning customers only
    // Guest users should always see and choose shipping options manually
    useEffect(() => {
        if (isEditing && customerProfile && shipmentsData.length > 0 && !hasAutoSubmitted.current && !isLoading) {
            // Check if any shipment is missing a shipping method
            const shipmentsNeedingMethod = shipmentsData.filter(
                (data) => !data.selectedMethod?.id && data.availableShippingMethods.length > 0
            );

            if (shipmentsNeedingMethod.length > 0) {
                hasAutoSubmitted.current = true;

                const formData = new FormData();

                // Add shipping method for each shipment
                shipmentsData.forEach((data) => {
                    const shipmentId = data.shipment.shipmentId;
                    if (!shipmentId) return;

                    // If already has a method, keep it
                    if (data.selectedMethod?.id) {
                        formData.append(`shippingMethod_${shipmentId}`, data.selectedMethod.id);
                        return;
                    }

                    // Otherwise, use default or first available
                    const isDefaultValid =
                        data.defaultShippingMethodId &&
                        data.availableShippingMethods.some((method) => method.id === data.defaultShippingMethodId);
                    const methodIdToSubmit = isDefaultValid
                        ? data.defaultShippingMethodId
                        : data.availableShippingMethods[0]?.id;

                    if (methodIdToSubmit) {
                        formData.append(`shippingMethod_${shipmentId}`, methodIdToSubmit);
                    }
                });

                onSubmit(formData);
            }
        }

        // Reset auto-submit flag when user moves away from this step
        if (!isEditing) {
            hasAutoSubmitted.current = false;
        }
    }, [isEditing, customerProfile, shipmentsData, onSubmit, isLoading]);

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        onSubmit(formData);
    };

    // Check if all shipments have methods available
    const hasNoMethods = shipmentsData.every((data) => data.availableShippingMethods.length === 0);
    const canSubmit = !isLoading && !hasNoMethods && shipmentsData.length > 0;

    // if shipment labels should be shown when there are many delivery shipments
    const showShipmentLabel = shipments.length > 1;

    const stepTitle = (
        <span className="text-2xl font-bold tracking-tight text-card-foreground">
            {tMultiship('checkout.shippingMultiOptionsTitle')}
        </span>
    );

    return (
        <ToggleCard
            id="shipping-multi-options"
            title={stepTitle}
            editing={isEditing}
            onEdit={onEdit}
            editLabel={t('common.edit')}
            showHeaderSeparator
            isLoading={isLoading}>
            <ToggleCardEdit>
                <form method="post" className="space-y-8" onSubmit={handleSubmit}>
                    {shipmentsData.length === 0 ? (
                        <div className="flex items-center justify-center p-8 border-2 border-dashed border-muted">
                            <div className="text-center space-y-2">
                                <Typography variant="p" className="text-muted-foreground">
                                    {tMultiship('checkout.noShipmentsAvailable')}
                                </Typography>
                            </div>
                        </div>
                    ) : (
                        shipmentsData.map((data, shipmentIndex) => {
                            const shipmentId = data.shipment.shipmentId;
                            const shipmentNumber = shipmentIndex + 1;

                            const { nameLine, addressLine } = formatAddress(
                                data.shipment.shippingAddress,
                                tMultiship('checkout.noAddress')
                            );

                            return (
                                <div
                                    key={shipmentId || `shipment-${shipmentIndex}`}
                                    className="border border-border p-4 space-y-4">
                                    {/* Shipment Header - Only show when there are multiple shipments */}
                                    {showShipmentLabel && (
                                        <div className="-m-4 mb-4">
                                            <div className="bg-muted px-4 py-3">
                                                <span className="text-base font-semibold text-foreground">
                                                    {nameLine
                                                        ? tMultiship('checkout.shipmentNumberWithRecipient', {
                                                              number: shipmentNumber,
                                                              name: nameLine,
                                                          })
                                                        : tMultiship('checkout.shipmentNumber', {
                                                              number: shipmentNumber,
                                                          })}
                                                </span>
                                            </div>
                                            <div className="px-4 py-3 border-b border-border">
                                                <Typography variant="small" className="text-muted-foreground">
                                                    {addressLine}
                                                </Typography>
                                            </div>
                                        </div>
                                    )}

                                    {/* Shipping Methods */}
                                    {data.availableShippingMethods.length > 0 ? (
                                        <RadioGroup
                                            name={`shippingMethod_${shipmentId}`}
                                            defaultValue={data.selectedMethod?.id || data.defaultShippingMethodId || ''}
                                            required
                                            aria-label={tMultiship('checkout.shippingMethodsForShipment', {
                                                number: shipmentNumber,
                                            })}>
                                            {data.availableShippingMethods.map((method) => {
                                                const arrivalLabel = getShippingArrivalLabel(method, t, i18n.language);
                                                return (
                                                    <div
                                                        key={method.id}
                                                        className="group flex items-center space-x-4 p-4 rounded-ui border-2 transition-all duration-200 hover:border-primary/50 hover:bg-accent/30 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:shadow-md">
                                                        <RadioGroupItem
                                                            value={method.id}
                                                            id={`${shipmentId}-${method.id}`}
                                                            className="w-5 h-5"
                                                            // eslint-disable-next-line jsx-a11y/no-autofocus -- focus first radio of first shipment on toggle card edit mode (WCAG 2.4.3 focus order); expanding section is the exception the rule warns about
                                                            autoFocus={
                                                                isEditing &&
                                                                shipmentIndex === 0 &&
                                                                data.availableShippingMethods.indexOf(method) === 0
                                                            }
                                                        />
                                                        <Label
                                                            htmlFor={`${shipmentId}-${method.id}`}
                                                            className="flex-1 cursor-pointer group-has-[:checked]:text-foreground">
                                                            <div className="space-y-1">
                                                                {arrivalLabel && (
                                                                    <Typography
                                                                        variant="small"
                                                                        className="text-muted-foreground group-has-[:checked]:text-foreground font-bold text-base">
                                                                        {arrivalLabel}
                                                                    </Typography>
                                                                )}
                                                                <Typography
                                                                    variant="small"
                                                                    className="text-muted-foreground group-has-[:checked]:text-foreground text-base">
                                                                    {method.name}
                                                                </Typography>
                                                            </div>
                                                        </Label>
                                                        <Typography
                                                            variant="small"
                                                            className="text-muted-foreground group-has-[:checked]:text-foreground font-bold text-base">
                                                            {method.price === 0
                                                                ? t('shippingOptions.free')
                                                                : `$${method.price.toFixed(2)}`}
                                                        </Typography>
                                                    </div>
                                                );
                                            })}
                                        </RadioGroup>
                                    ) : (
                                        <div className="flex items-center justify-center p-6 border-2 border-dashed border-muted">
                                            <div className="text-center space-y-1">
                                                <Typography variant="small" className="text-muted-foreground">
                                                    {t('shippingOptions.noMethodsAvailable')}
                                                </Typography>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    <div className="w-full pt-2">
                        <Button type="submit" disabled={!canSubmit} className="w-full">
                            {isLoading
                                ? t('shippingOptions.saving')
                                : hasNoMethods
                                  ? t('shippingOptions.noMethodsAvailable')
                                  : t('shippingOptions.continue')}
                        </Button>
                    </div>
                </form>
            </ToggleCardEdit>

            <ToggleCardSummary>
                <div className="space-y-4">
                    {shipmentsData.length === 0 ? (
                        <Typography variant="p" className="text-muted-foreground">
                            {t('shippingOptions.enterAddressFirst')}
                        </Typography>
                    ) : (
                        shipmentsData.map((data, shipmentIndex) => {
                            const selectedMethod = data.selectedMethod;
                            const selectedAvailableMethod = data.availableShippingMethods.find(
                                (method) => method.id === selectedMethod?.id
                            );
                            const summaryArrivalLabel = getShippingArrivalLabel(
                                {
                                    deliveryWindow:
                                        selectedAvailableMethod?.deliveryWindow ?? selectedMethod?.deliveryWindow,
                                    estimatedArrivalTime: (selectedAvailableMethod?.estimatedArrivalTime ??
                                        selectedMethod?.estimatedArrivalTime ??
                                        selectedMethod?.c_estimatedArrivalTime) as string | undefined,
                                },
                                t,
                                i18n.language
                            );
                            const shipmentNumber = shipmentIndex + 1;

                            return (
                                <div
                                    key={data.shipment.shipmentId || `shipment-${shipmentIndex}`}
                                    className="space-y-2">
                                    {showShipmentLabel && (
                                        <>
                                            <Typography variant="small" className="font-semibold text-foreground">
                                                {tMultiship('checkout.shipmentNumber', { number: shipmentNumber })}
                                            </Typography>
                                            <Typography variant="small" className="text-muted-foreground text-xs">
                                                {
                                                    formatAddress(
                                                        data.shipment.shippingAddress,
                                                        tMultiship('checkout.noAddress')
                                                    ).fullAddress
                                                }
                                            </Typography>
                                        </>
                                    )}
                                    {selectedMethod ? (
                                        <div className="space-y-1">
                                            {summaryArrivalLabel && (
                                                <Typography variant="small" className="text-muted-foreground">
                                                    {summaryArrivalLabel}
                                                </Typography>
                                            )}
                                            <Typography variant="small" className="text-muted-foreground">
                                                {t('shippingOptions.priceAndMethod', {
                                                    price:
                                                        selectedMethod.price === 0
                                                            ? t('shippingOptions.free')
                                                            : `$${(selectedMethod.price ?? 0).toFixed(2)}`,
                                                    methodName: selectedMethod.name || '',
                                                })}
                                            </Typography>
                                        </div>
                                    ) : (
                                        <Typography variant="small" className="text-muted-foreground">
                                            {tMultiship('checkout.noMethodSelected')}
                                        </Typography>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </ToggleCardSummary>
        </ToggleCard>
    );
}
