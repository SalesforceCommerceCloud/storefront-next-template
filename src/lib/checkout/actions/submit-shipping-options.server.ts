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
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createShippingOptionsSchema, parseShippingOptionsFromFormData } from '@/lib/checkout/schemas';
import { createApiClients } from '@/lib/api-clients.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
// @sfdc-extension-line SFDC_EXT_MULTISHIP
import { handleMultiShipShippingOptions } from '@/extensions/multiship/lib/actions/checkout-submit-multi-options.server';
import { getLogger } from '@/lib/logger.server';
import { ACTION_HOOK_IDS, runHookSafe } from '@/targets/action-hook.server';
import type { ShopperBasketsV2 } from '@/scapi';

/**
 * Preserves customer information omitted by the shipping-method response while applying its basket changes.
 *
 * @internal
 */
export function mergeShippingOptionsBasketPreservingCustomerInfo(
    currentBasket: ShopperBasketsV2.schemas['Basket'],
    updatedBasket: ShopperBasketsV2.schemas['Basket']
): ShopperBasketsV2.schemas['Basket'] {
    const currentCustomerInfo = currentBasket.customerInfo;
    if (!currentCustomerInfo) return updatedBasket;

    return {
        ...updatedBasket,
        customerInfo: {
            ...currentCustomerInfo,
            ...updatedBasket.customerInfo,
            ...(currentCustomerInfo.customerId === undefined ? {} : { customerId: currentCustomerInfo.customerId }),
            email: currentCustomerInfo.email,
        },
    };
}

/**
 * Server action for submitting checkout shipping options.
 */
export async function action(formData: FormData, context: ActionFunctionArgs['context']) {
    const logger = getLogger(context);
    const { t } = getTranslation();
    logger.debug('SubmitShippingOptions: starting');

    // Update shipping method in Commerce Cloud (like PWA Kit)
    const basketResource = await getBasket(context);
    const basket = basketResource.current;

    if (!basket || !basket.basketId) {
        logger.error('SubmitShippingOptions: no active basket', {
            hasBasket: Boolean(basket),
            hasBasketId: Boolean(basket?.basketId),
        });
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No active basket found' }),
                step: 'shippingOptions',
            },
            { status: 400 }
        );
    }

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    // Check if this is a multi-shipment submission and handle it
    const multiShipResponse = await handleMultiShipShippingOptions(formData, basket, context);
    if (multiShipResponse) {
        return multiShipResponse;
    }
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    // Single-shipment mode: use traditional validation and update
    // Parse and validate using shared schema
    // This ensures server-side validation matches client-side validation exactly
    const shippingData = parseShippingOptionsFromFormData(formData);
    const shippingOptionsSchema = createShippingOptionsSchema(t);
    const result = shippingOptionsSchema.safeParse(shippingData);

    if (!result.success) {
        logger.warn('SubmitShippingOptions: validation failed', {
            fieldErrors: result.error.flatten().fieldErrors,
        });
        return Response.json(
            {
                success: false,
                fieldErrors: result.error.flatten().fieldErrors,
                step: 'shippingOptions',
            },
            { status: 400 }
        );
    }

    // Use validated data
    const { shippingMethodId } = result.data;

    let finalBasket;
    try {
        const clients = createApiClients(context);
        const { data: updatedBasket } = await clients.shopperBasketsV2.updateShippingMethodForShipment({
            params: {
                path: {
                    basketId: basket?.basketId ?? '',
                    shipmentId: 'me',
                },
            },
            body: {
                id: shippingMethodId,
            },
        });

        // Update local basket state with API response
        // Check if critical data is preserved in the Commerce API response
        const currentBasket = basket;

        if (currentBasket && !updatedBasket.customerInfo?.email && currentBasket.customerInfo?.email) {
            logger.warn('SubmitShippingOptions: customer info missing from API response, merging with current basket', {
                basketId: basket.basketId,
            });
            // Restore only the customer identity omitted from the authoritative response.
            finalBasket = mergeShippingOptionsBasketPreservingCustomerInfo(currentBasket, updatedBasket);
            updateBasketResource(context, finalBasket);
        } else {
            // API response includes all necessary data, use it directly
            finalBasket = updatedBasket;
            updateBasketResource(context, updatedBasket);
        }
    } catch (error) {
        logger.error('SubmitShippingOptions: failed', { error });
        return Response.json(
            {
                success: false,
                error: createActionError({ error }),
                step: 'shippingOptions',
            },
            { status: 500 }
        );
    }

    // Extension hook: post-processing after shipping method selection
    const hookResult = await runHookSafe({
        hookId: ACTION_HOOK_IDS.CHECKOUT_SHIPPING_AFTER_METHOD_SELECT,
        context: { data: { basket: finalBasket, shippingMethodId }, actionContext: context },
        logger,
        fallbackStep: 'shippingOptions',
    });
    if (hookResult.errorResponse) return hookResult.errorResponse;

    logger.info('SubmitShippingOptions: succeeded', { basketId: basket.basketId, shippingMethodId });

    // Return success data with updated basket for client-side state update
    return Response.json({
        success: true,
        step: 'shippingOptions',
        data: { shippingMethodId },
        basket: finalBasket,
    });
}
