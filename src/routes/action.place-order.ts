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
import { redirect } from 'react-router';
import type { Route } from './+types/action.place-order';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { addPaymentInstrumentToBasket, updateBillingAddressForBasket } from '@/lib/api/basket.server';
import { getCustomerProfileForCheckout } from '@/lib/api/customer.server';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';
import { getPaymentMethodsFromCustomer } from '@/lib/customer/profile-utils';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { ApiError } from '@/scapi';
// @sfdc-extension-line SFDC_EXT_MULTISHIP
import { resolveEmptyShipments } from '@/extensions/multiship/lib/api/basket.server';
import { getLogger } from '@/lib/logger.server';
import { ACTION_HOOK_IDS, runHookSafe } from '@/targets/action-hook.server';
import {
    validatePlaceOrderPreconditions,
    calculateBasketForOrder,
    syncPaymentInstrumentAmount,
    saveCheckoutDataToProfile,
    finalizeOrderSuccess,
} from '@/lib/checkout/place-order-orchestration.server';

/**
 * Detects whether a caught error is an SCAPI inventory/stock rejection. createOrder fails with a
 * 4xx fault (RFC 7807) when a basket line exceeds available stock — e.g. after a quantity was raised
 * past inventory. We match keywords against the machine-readable `type` slug only, not the free-text
 * `title`/`detail`: the slug is kebab-case (e.g. `product-item-not-available`), so a rename on the
 * backend still degrades to the specific out-of-stock message, while a human sentence such as "the
 * selected shipping method is not available" can never collide and be misread as out-of-stock.
 * Non-inventory errors return false and fall through to the existing generic handling.
 */
function isInventoryError(error: unknown): error is ApiError {
    if (!(error instanceof ApiError)) return false;
    const type = (error.body?.type ?? '').toLowerCase();
    return ['inventory', 'stock', 'not-available', 'availability', 'out-of-stock'].some((keyword) =>
        type.includes(keyword)
    );
}

/**
 * Server action for placing an order.
 */
export async function action({ request, context }: Route.ActionArgs) {
    const logger = getLogger(context);
    try {
        // Parse form data to get create account preference and save-payment option
        const formData = await request.formData();
        const shouldCreateAccount = formData.get('shouldCreateAccount') === 'true';
        /** Set only when checkout registration OTP flow is active (session registeredViaCheckout). */
        const checkoutRegistrationIntent = formData.get('checkoutRegistrationIntent') === 'true';
        const savePaymentToProfile = formData.get('savePaymentToProfile') === 'true';
        const useDifferentBilling = formData.get('useDifferentBilling') === 'true';

        // Get current basket
        const basketResource = await getBasket(context);
        const initialBasket = basketResource.current;
        logger.debug('[Checkout] place-order: starting', { basketId: initialBasket?.basketId });

        // Validate basket / customerInfo / shipments. Returns a discriminated
        // union: ok=true narrows the basket to a non-null shape; ok=false
        // hands back a ready-to-return 400 Response.
        const precheck = validatePlaceOrderPreconditions(initialBasket);
        if (!precheck.ok) return precheck.response;
        const basket = precheck.basket;

        if (!basket.paymentInstruments?.[0]) {
            // Check if this is a returning customer with saved payment methods
            const auth = getAuth(context);
            const customerId = auth.customerId;

            if (customerId) {
                try {
                    const customerProfile = await getCustomerProfileForCheckout(context, customerId);
                    if (!customerProfile) {
                        return Response.json(
                            {
                                success: false,
                                error: createActionError({
                                    code: ErrorCode.NOT_FOUND,
                                    message: 'Unable to load customer profile',
                                }),
                                step: 'placeOrder',
                            },
                            { status: 400 }
                        );
                    }
                    const savedPaymentMethods = getPaymentMethodsFromCustomer(customerProfile);

                    if (savedPaymentMethods.length > 0) {
                        const preferredMethod =
                            savedPaymentMethods.find((method) => method.preferred) || savedPaymentMethods[0];

                        // SFCC requires customerPaymentInstrumentId to charge a saved payment instrument.
                        // paymentCard (cardType, maskedNumber, etc.) is display metadata only and cannot
                        // be used to charge a saved card.
                        const paymentInfo = {
                            paymentMethodId: 'CREDIT_CARD',
                            customerPaymentInstrumentId: preferredMethod.id,
                            amount: basket.orderTotal ?? 0,
                        };

                        // Get billing address (use shipping address or customer's billing address)
                        const billingAddress =
                            basket.shipments?.[0]?.shippingAddress || customerProfile.preferredBillingAddress;

                        if (billingAddress) {
                            // Apply saved payment method + billing address via SCAPI, then refresh the
                            // local basket resource so the downstream billingAddress check sees the mutation.
                            // updateBillingAddressForBasket returns the latest full basket including the
                            // payment instrument added by the previous call.
                            await addPaymentInstrumentToBasket(context, basket.basketId, paymentInfo);
                            const withBilling = await updateBillingAddressForBasket(
                                context,
                                basket.basketId,
                                billingAddress
                            );
                            updateBasketResource(context, withBilling);
                        } else {
                            return Response.json(
                                {
                                    success: false,
                                    error: createActionError({
                                        code: ErrorCode.REQUIRED_FIELD,
                                        message: 'Billing address is required',
                                    }),
                                    step: 'placeOrder',
                                },
                                { status: 400 }
                            );
                        }
                    } else {
                        return Response.json(
                            {
                                success: false,
                                error: createActionError({
                                    code: ErrorCode.REQUIRED_FIELD,
                                    message: 'Payment information is required',
                                }),
                                step: 'placeOrder',
                            },
                            { status: 400 }
                        );
                    }
                } catch (error) {
                    logger.error('[Checkout] place-order: failed to apply saved payment method', { error });
                    return Response.json(
                        {
                            success: false,
                            error: createActionError({
                                code: ErrorCode.OPERATION_FAILED,
                                message: 'Failed to apply saved payment method',
                            }),
                            step: 'placeOrder',
                        },
                        { status: 400 }
                    );
                }
            } else {
                return Response.json(
                    {
                        success: false,
                        error: createActionError({
                            code: ErrorCode.REQUIRED_FIELD,
                            message: 'Payment information is required',
                        }),
                        step: 'placeOrder',
                    },
                    { status: 400 }
                );
            }
        }

        const updatedBasket = (await getBasket(context)).current;

        if (!updatedBasket?.billingAddress) {
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'Billing address is required',
                    }),
                    step: 'placeOrder',
                },
                { status: 400 }
            );
        }

        // @sfdc-extension-line SFDC_EXT_MULTISHIP
        await resolveEmptyShipments(context, updatedBasket);

        if (!updatedBasket?.basketId) {
            return Response.json(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'Basket not found' }),
                    step: 'placeOrder',
                },
                { status: 400 }
            );
        }

        const calculatedBasket = await calculateBasketForOrder(context, updatedBasket);

        // Bring the payment instrument's amount in lockstep with orderTotal before
        // createOrder.
        const syncedBasket = await syncPaymentInstrumentAmount(context, calculatedBasket);

        // Extension hook: fraud check before placing the order (blocking — unexpected errors fail the action)
        const fraudHookResult = await runHookSafe({
            hookId: ACTION_HOOK_IDS.CHECKOUT_FRAUD_BEFORE_PLACE,
            context: { data: { basket: syncedBasket }, actionContext: context },
            logger,
            fallbackStep: 'placeOrder',
            blocking: true,
        });
        if (fraudHookResult.errorResponse) return fraudHookResult.errorResponse;

        // Extension hook: payment processing before order creation (blocking — e.g. authorization)
        const paymentHookResult = await runHookSafe({
            hookId: ACTION_HOOK_IDS.CHECKOUT_PAYMENTS_BEFORE_PLACE_ORDER,
            context: { data: { basket: syncedBasket }, actionContext: context },
            logger,
            fallbackStep: 'placeOrder',
            blocking: true,
        });
        if (paymentHookResult.errorResponse) return paymentHookResult.errorResponse;

        const clients = createApiClients(context);

        const { data: order } = await clients.shopperOrders.createOrder({
            params: {},
            body: { basketId: calculatedBasket.basketId },
        });

        if (!order || !order.orderNo) {
            logger.error('[Checkout] place-order: empty order response', { basketId: calculatedBasket.basketId });
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.OPERATION_FAILED,
                        message: 'Order creation returned empty result',
                    }),
                    step: 'placeOrder',
                },
                { status: 500 }
            );
        }

        logger.info('[Checkout] place-order: order created', {
            orderNo: order.orderNo,
            basketId: calculatedBasket.basketId,
        });

        // Extension hook: post-processing after order creation (e.g. capture, fulfillment triggers).
        // Order is already placed — never abort the action. Log at warn level with order
        // details so post-order failures (e.g. failed capture) are surfaced in monitoring.
        const afterPlaceResult = await runHookSafe({
            hookId: ACTION_HOOK_IDS.CHECKOUT_PAYMENTS_AFTER_PLACE_ORDER,
            context: { data: { order, basket: syncedBasket }, actionContext: context },
            logger,
            fallbackStep: 'placeOrder',
        });
        if (afterPlaceResult.errorResponse) {
            logger.warn(
                '[Checkout] place-order: afterPlaceOrder hook failed - order already placed, requires manual review',
                {
                    hookId: ACTION_HOOK_IDS.CHECKOUT_PAYMENTS_AFTER_PLACE_ORDER,
                    orderNo: order.orderNo,
                    basketId: calculatedBasket.basketId,
                }
            );
        }

        // Registration-at-checkout: requires both create-account intent AND active registration session (client flag).
        // Stale sessionStorage.shouldCreateAccount alone must not trigger duplicate profile saves for returning shoppers.
        const auth = getAuth(context);
        const registeredViaCheckout =
            auth.userType === 'registered' &&
            Boolean(auth.customerId) &&
            shouldCreateAccount &&
            checkoutRegistrationIntent;

        // The contact-info phone is passed from the client as a form field because basket
        // transfers during OTP registration can strip phone from the billing address.
        // Fall back to the basket/order/shipment fields if the form field is absent.
        const contactPhone =
            formData.get('contactPhone')?.toString() ||
            updatedBasket.billingAddress?.phone ||
            order.billingAddress?.phone ||
            order.shipments?.[0]?.shippingAddress?.phone ||
            updatedBasket.shipments?.[0]?.shippingAddress?.phone ||
            (updatedBasket.customerInfo as { phone?: string } | undefined)?.phone ||
            (order.customerInfo as { phone?: string } | undefined)?.phone;

        // Save checkout information to customer profile
        if (auth.customerId) {
            const customerId = auth.customerId;

            let profileSnapshot: CustomerProfile | null = null;
            try {
                const loaded = await getCustomerProfileForCheckout(context, customerId);
                if (loaded?.customer) {
                    profileSnapshot = {
                        customer: loaded.customer,
                        addresses: loaded.addresses ?? [],
                        paymentInstruments: loaded.paymentInstruments ?? [],
                        preferredShippingAddress: loaded.preferredShippingAddress,
                        preferredBillingAddress: loaded.preferredBillingAddress,
                    };
                }
            } catch (error) {
                logger.error('[Checkout] place-order: failed to load customer profile for post-order saves', {
                    error,
                });
            }

            // Detect newly registered shoppers whose profile is still empty (in case they exit checkout without saving)
            let isNewlyRegisteredWithEmptyProfile = false;
            if (auth.userType === 'registered' && !registeredViaCheckout && profileSnapshot?.customer) {
                const c = profileSnapshot.customer;
                isNewlyRegisteredWithEmptyProfile =
                    (!profileSnapshot.addresses || profileSnapshot.addresses.length === 0) && !c.phoneHome;
            }

            // Profile saves are best-effort: the order is already created and paid, so a
            // SCAPI hiccup here must not strand the shopper on a 500. The helpers inside
            // saveCheckoutDataToProfile already swallow per-call failures; this catch is
            // defense-in-depth against an unexpected throw bubbling out of Promise.all.
            try {
                await saveCheckoutDataToProfile(context, {
                    customerId,
                    order,
                    registeredViaCheckout,
                    isNewlyRegisteredWithEmptyProfile,
                    savePaymentToProfile,
                    useDifferentBilling,
                    contactPhone,
                    profileSnapshot,
                });
            } catch (error) {
                logger.error('[Checkout] place-order: profile save failed after order create', {
                    orderNo: order.orderNo,
                    error,
                });
            }
        }

        const orderConfirmationUrl = finalizeOrderSuccess(context, {
            orderNo: order.orderNo,
            registration:
                registeredViaCheckout && order.customerInfo?.email ? { email: order.customerInfo.email } : undefined,
        });
        return redirect(orderConfirmationUrl);
    } catch (error) {
        logger.error('[Checkout] place-order: unexpected error', { error });
        // Surface an inventory rejection specifically. The client stepper now blocks over-quantity
        // increases, but a basket can still go out of stock between edit and checkout (concurrent
        // orders, backend adjustments), so this stays as the last-line backstop that turns a generic
        // "try again" into an actionable stock message. The display layer maps OUT_OF_STOCK to
        // errors:checkout.stockNotAvailable.
        if (isInventoryError(error)) {
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.OUT_OF_STOCK,
                        // Static fallback only. The display layer resolves OUT_OF_STOCK by code to a translated
                        // string; this message is a last resort for a consumer that renders it directly, so it must
                        // not forward the raw untranslated SCAPI detail.
                        message: 'One or more items are no longer available in the requested quantity',
                    }),
                    step: 'placeOrder',
                },
                { status: 422 }
            );
        }
        return Response.json(
            {
                success: false,
                error: createActionError({ error }),
                step: 'placeOrder',
            },
            { status: 500 }
        );
    }
}
