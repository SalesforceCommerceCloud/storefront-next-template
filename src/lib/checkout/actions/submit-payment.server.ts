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
import type { ActionFunctionArgs } from 'react-router';
import type { ShopperBasketsV2 } from '@/scapi';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createPaymentSchema, parsePaymentFromFormData } from '@/lib/checkout/schemas';
import { resolveCardPaymentFromApplicableMethods } from '@/lib/payment/payment-utils';
import {
    addPaymentInstrumentToBasket,
    getPaymentMethodsForBasket,
    removePaymentInstrumentFromBasket,
    updateBillingAddressForBasket,
} from '@/lib/api/basket.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getAuth } from '@/middlewares/auth.server';
import { getCustomerProfileForCheckout, saveBillingAddressToCustomer } from '@/lib/api/customer.server';
import { getAddressBookFromCustomer, getPaymentMethodsFromCustomer } from '@/lib/customer/profile-utils';
import { getLogger } from '@/lib/logger.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { ACTION_HOOK_IDS, runHookSafe } from '@/targets/action-hook.server';

const normalizeAddressField = (value: string | undefined) => (value ?? '').trim().toLowerCase();

const isSameAddress = (
    a:
        | {
              firstName?: string;
              lastName?: string;
              address1?: string;
              address2?: string;
              city?: string;
              stateCode?: string;
              postalCode?: string;
              countryCode?: string;
          }
        | undefined,
    b:
        | {
              firstName?: string;
              lastName?: string;
              address1?: string;
              address2?: string;
              city?: string;
              stateCode?: string;
              postalCode?: string;
              countryCode?: string;
          }
        | undefined
) => {
    if (!a || !b) return false;
    return (
        normalizeAddressField(a.firstName) === normalizeAddressField(b.firstName) &&
        normalizeAddressField(a.lastName) === normalizeAddressField(b.lastName) &&
        normalizeAddressField(a.address1) === normalizeAddressField(b.address1) &&
        normalizeAddressField(a.address2) === normalizeAddressField(b.address2) &&
        normalizeAddressField(a.city) === normalizeAddressField(b.city) &&
        normalizeAddressField(a.stateCode) === normalizeAddressField(b.stateCode) &&
        normalizeAddressField(a.postalCode) === normalizeAddressField(b.postalCode) &&
        normalizeAddressField(a.countryCode) === normalizeAddressField(b.countryCode)
    );
};

/**
 * Server action for submitting checkout payment information.
 */
export async function action(formData: FormData, context: ActionFunctionArgs['context']) {
    const logger = getLogger(context);
    const { t } = getTranslation();
    logger.debug('SubmitPayment: starting');

    // Parse and validate using shared schema
    // This ensures server-side validation matches client-side validation exactly
    const paymentData = parsePaymentFromFormData(formData);

    const paymentSchema = createPaymentSchema(t);
    const result = paymentSchema.safeParse(paymentData);

    if (!result.success) {
        logger.warn('SubmitPayment: validation failed', {
            fieldErrors: result.error.flatten().fieldErrors,
        });
        return Response.json(
            {
                success: false,
                fieldErrors: result.error.flatten().fieldErrors,
                step: 'payment',
            },
            { status: 400 }
        );
    }

    // Use validated data
    const {
        cardNumber,
        expiryDate,
        cardholderName,
        useDifferentBilling,
        selectedSavedPaymentMethod,
        useSavedPaymentMethod,
    } = result.data;
    // Note: CVV is not stored for security reasons

    // Get current basket first (needed for payment amount)
    const basketResource = await getBasket(context);
    const basket = basketResource.current;
    const basketId = basket?.basketId ?? basketResource.snapshot?.basketId;

    let paymentInfo;

    if (useSavedPaymentMethod && selectedSavedPaymentMethod) {
        // Look up card details from customer profile and send them directly.
        // The v2 basket API does not support customerPaymentInstrumentId; when sent, SFCC
        // resolves the stored customer instrument which may have paymentMethodId
        // "CREDIT_CARD (visa)" causing a 400 "Invalid Payment Method Id".
        const auth = getAuth(context);
        const customerId = auth?.customerId;
        if (customerId) {
            try {
                const customerProfile = await getCustomerProfileForCheckout(context, customerId);
                const savedMethods = getPaymentMethodsFromCustomer(customerProfile ?? undefined);
                const savedMethod = savedMethods.find((m) => m.id === selectedSavedPaymentMethod) || savedMethods[0];
                if (savedMethod) {
                    // Pass Commerce cardType through unchanged. BM ids are site-configured
                    // (e.g. MasterCard); remapping breaks real processors.
                    const cardType = savedMethod.cardType;
                    paymentInfo = {
                        paymentMethodId: 'CREDIT_CARD',
                        amount: basket?.orderTotal ?? 0,
                        ...(cardType && cardType !== 'unknown'
                            ? {
                                  paymentCard: {
                                      cardType,
                                      holder: savedMethod.cardholderName || '',
                                      maskedNumber: savedMethod.maskedNumber || '',
                                      expirationMonth: savedMethod.expirationMonth,
                                      expirationYear: savedMethod.expirationYear,
                                  },
                              }
                            : {}),
                    };
                }
            } catch (error) {
                logger.error('SubmitPayment: failed to fetch saved payment method', { error });
                // Fall through to error below if paymentInfo is still unset
            }
        }
        if (!paymentInfo) {
            logger.warn('SubmitPayment: saved payment method not found', {
                selectedSavedPaymentMethod,
                customerId: auth?.customerId,
            });
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.NOT_FOUND,
                        message: 'Saved payment method not found',
                    }),
                    step: 'payment',
                },
                { status: 400 }
            );
        }
    } else {
        // Process new payment data

        // Clean card number (remove spaces and formatting)
        const cleanCardNumber = cardNumber ? cardNumber.replace(/\D/g, '') : '';

        // Parse expiry date (MM/YY format)
        const [expiryMonth, expiryYear] =
            expiryDate && expiryDate.includes('/') ? expiryDate.split('/').map((s) => s.trim()) : ['', ''];

        // Validate that we have actual payment data (not just empty/default values)
        if (!cleanCardNumber || cleanCardNumber.length < 13 || !expiryMonth || !expiryYear || !cardholderName?.trim()) {
            logger.warn('SubmitPayment: incomplete card data', {
                hasCardNumber: Boolean(cleanCardNumber),
                cardLength: cleanCardNumber?.length,
                hasExpiry: Boolean(expiryMonth && expiryYear),
                hasCardholder: Boolean(cardholderName?.trim()),
            });
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'Incomplete card data',
                    }),
                    step: 'payment',
                },
                { status: 400 }
            );
        }

        // Resolve paymentMethodId + cardType from the site BM catalog (exact ids).
        // Fail closed if we cannot — do not invent BM values (old MasterCard → "Master Card" bug).
        let resolvedPayment: { paymentMethodId: string; cardType: string } | undefined;
        if (basketId) {
            try {
                const paymentMethods = await getPaymentMethodsForBasket(context, basketId);
                resolvedPayment = resolveCardPaymentFromApplicableMethods(
                    cleanCardNumber,
                    paymentMethods.applicablePaymentMethods
                );
            } catch (error) {
                logger.warn('SubmitPayment: failed to load payment methods for cardType resolution', { error });
            }
        }
        if (!resolvedPayment) {
            logger.warn('SubmitPayment: could not resolve cardType from site payment-methods catalog', {
                basketId: Boolean(basketId),
            });
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'Unable to determine card type for this payment method',
                    }),
                    step: 'payment',
                },
                { status: 400 }
            );
        }
        paymentInfo = {
            paymentMethodId: resolvedPayment.paymentMethodId,
            amount: basket?.orderTotal ?? 0,
            paymentCard: {
                cardType: resolvedPayment.cardType,
                holder: cardholderName,
                maskedNumber: cleanCardNumber.slice(0, -4).replace(/\d/g, '*') + cleanCardNumber.slice(-4),
                expirationMonth: parseInt(expiryMonth),
                expirationYear: parseInt(`20${expiryYear}`),
            },
        };
    }

    if (!basketId || !basket) {
        logger.error('SubmitPayment: basket not found', {
            hasBasketId: Boolean(basketId),
            hasBasket: Boolean(basket),
        });
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'Basket not found after payment prep' }),
                step: 'payment',
            },
            { status: 400 }
        );
    }

    // Prepare billing address (basket is non-null)
    const contactPhone = basket.billingAddress?.phone;
    const shippingAddress = basket.shipments?.[0]?.shippingAddress;
    const billingAddress =
        !useDifferentBilling && shippingAddress
            ? { ...shippingAddress, phone: contactPhone || shippingAddress.phone }
            : {
                  firstName: result.data.billingFirstName || '',
                  lastName: result.data.billingLastName || '',
                  address1: result.data.billingAddress1 || '',
                  address2: result.data.billingAddress2 || '',
                  city: result.data.billingCity || '',
                  stateCode: result.data.billingStateCode || '',
                  postalCode: result.data.billingPostalCode || '',
                  phone: result.data.billingPhone || contactPhone || '',
                  countryCode: result.data.billingCountryCode || 'US',
              };

    // Remove existing payment instrument (if any) so the basket has exactly the chosen one.
    // If remove fails, we cannot safely add a new card (could charge both); fail the step.
    const existingPaymentId = basket.paymentInstruments?.[0]?.paymentInstrumentId;
    if (existingPaymentId) {
        try {
            await removePaymentInstrumentFromBasket(context, basketId, existingPaymentId);
        } catch (error) {
            logger.error('SubmitPayment: failed to remove existing payment instrument', {
                basketId,
                existingPaymentId,
                error,
            });
            return Response.json(
                {
                    success: false,
                    error: createActionError({ error }),
                    step: 'payment',
                },
                { status: 400 }
            );
        }
    }

    // Add payment instrument to basket via Commerce API
    let updatedBasket: ShopperBasketsV2.schemas['Basket'];
    try {
        updatedBasket = await addPaymentInstrumentToBasket(context, basketId, paymentInfo);
    } catch (error) {
        logger.error('SubmitPayment: failed to add payment instrument', {
            basketId,
            error,
        });
        return Response.json(
            {
                success: false,
                error: createActionError({ error }),
                step: 'payment',
            },
            { status: 400 }
        );
    }

    let finalUpdatedBasket;
    try {
        // Then update the billing address (this should also trigger calculations)
        const finalBasket = await updateBillingAddressForBasket(context, basketId, billingAddress);

        // Update basket with the final state from billing address API call
        // This should include payment instruments, billing address, and calculated totals
        const currentBasket = basket;

        // Check if payment instruments are preserved in the final response
        if (!finalBasket.paymentInstruments?.[0]) {
            logger.warn(
                'SubmitPayment: payment instruments missing from billing address response, merging from previous response',
                {
                    basketId,
                }
            );
            // Payment instruments missing from API response, using updatedBasket data
            // Use the payment instrument from the earlier addPaymentInstrument call
            finalUpdatedBasket = {
                ...currentBasket,
                // Update with calculated totals from finalBasket
                orderTotal: finalBasket.orderTotal,
                productTotal: finalBasket.productTotal,
                shippingTotal: finalBasket.shippingTotal,
                merchandizeTotalTax: finalBasket.merchandizeTotalTax,
                taxTotal: finalBasket.taxTotal,
                // Use payment instruments from the earlier successful add operation
                paymentInstruments: updatedBasket.paymentInstruments,
                billingAddress: finalBasket.billingAddress,
            };
            updateBasketResource(context, finalUpdatedBasket);
        } else {
            // Payment instruments are preserved, use the complete final basket
            finalUpdatedBasket = {
                ...currentBasket,
                // Update all relevant fields from the API response
                orderTotal: finalBasket.orderTotal,
                productTotal: finalBasket.productTotal,
                shippingTotal: finalBasket.shippingTotal,
                merchandizeTotalTax: finalBasket.merchandizeTotalTax,
                taxTotal: finalBasket.taxTotal,
                paymentInstruments: finalBasket.paymentInstruments,
                billingAddress: finalBasket.billingAddress,
            };
            updateBasketResource(context, finalUpdatedBasket);
        }
    } catch (error) {
        logger.error('SubmitPayment: failed', { error });
        return Response.json(
            {
                success: false,
                error: createActionError({ error }),
                step: 'payment',
            },
            { status: 500 }
        );
    }

    // Existing registered customers: if they explicitly choose a different billing
    // address and enter a new one, persist it to their address book.
    const auth = getAuth(context);
    if (auth.customerId && useDifferentBilling) {
        try {
            const customerProfile = await getCustomerProfileForCheckout(context, auth.customerId);
            const savedAddresses = getAddressBookFromCustomer(customerProfile ?? undefined);
            const alreadySaved = savedAddresses.some((address) => isSameAddress(address, billingAddress));
            if (!alreadySaved) {
                await saveBillingAddressToCustomer(context, auth.customerId, billingAddress);
                logger.info('SubmitPayment: saved new billing address to customer profile', {
                    customerId: auth.customerId,
                });
            }
        } catch (error) {
            logger.error('SubmitPayment: failed to save billing address to customer profile', {
                customerId: auth.customerId,
                error,
            });
        }
    }

    // Extension hook: post-processing after payment submission (e.g. tokenization, 3DS)
    const hookResult = await runHookSafe({
        hookId: ACTION_HOOK_IDS.CHECKOUT_PAYMENTS_AFTER_SUBMIT_PAYMENT,
        context: { data: { basket: finalUpdatedBasket, paymentInfo }, actionContext: context },
        logger,
        fallbackStep: 'payment',
    });
    if (hookResult.errorResponse) return hookResult.errorResponse;

    logger.info('SubmitPayment: succeeded', { basketId });

    // Return success data as JSON with updated basket for direct context updates
    return Response.json({
        success: true,
        step: 'payment',
        data: { paymentInfo },
        basket: finalUpdatedBasket,
    });
}
