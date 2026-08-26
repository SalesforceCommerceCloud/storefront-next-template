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
import { ensureBasketId, getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { createShippingAddressSchema, parseShippingAddressFromFormData } from '@/lib/checkout/schemas';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { applyDefaultShippingMethod, fetchShippingMethodsMapForBasket } from '@/lib/checkout/loaders.server';
import { saveShippingAddressToCustomer, getCurrentCustomer } from '@/lib/api/customer.server';
import {
    getAddressKey,
    isAddressEmpty,
    isAddressEqual,
    isOrderBillingAddressIncomplete,
} from '@/lib/address/address-utils';
// @sfdc-extension-block-start SFDC_EXT_MULTISHIP
import { handleMultiShipShippingAddress } from '@/extensions/multiship/lib/actions/checkout-submit-multi-address.server';
import { assignProductsToDefaultShipment } from '@/extensions/multiship/lib/api/basket.server';
// @sfdc-extension-block-end SFDC_EXT_MULTISHIP
import { getLogger } from '@/lib/logger.server';
import { ACTION_HOOK_IDS, runHookSafe } from '@/targets/action-hook.server';

/**
 * Server action for submitting checkout shipping address information.
 */
export async function action(formData: FormData, context: ActionFunctionArgs['context']) {
    const logger = getLogger(context);
    const { t } = getTranslation();
    logger.debug('SubmitShippingAddress: starting');
    // Update shipping address in Commerce Cloud (like PWA Kit)
    const basketId = await ensureBasketId(context);

    if (!basketId) {
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No active basket found' }),
                step: 'shippingAddress',
            },
            { status: 400 }
        );
    }

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    // Check if this is a multi-shipment submission and handle it
    const basketResource = await getBasket(context);
    const basket = basketResource.current;
    if (basket) {
        const multiShipResponse = await handleMultiShipShippingAddress(formData, basket, context);
        if (multiShipResponse) {
            return multiShipResponse;
        }
    }
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    // Parse and validate using shared schema
    // This ensures server-side validation matches client-side validation exactly
    const addressData = parseShippingAddressFromFormData(formData);
    const shippingAddressSchema = createShippingAddressSchema(t);
    const result = shippingAddressSchema.safeParse(addressData);

    if (!result.success) {
        return Response.json(
            {
                success: false,
                fieldErrors: result.error.flatten().fieldErrors,
                step: 'shippingAddress',
            },
            { status: 400 }
        );
    }

    const validatedAddress = result.data;
    const addressDataWithExtras = {
        ...validatedAddress,
        countryCode: validatedAddress.countryCode || 'US',
    };

    const basketBeforeShippingUpdate = (await getBasket(context)).current;
    const existingBilling = basketBeforeShippingUpdate?.billingAddress;
    const previousShipmentShipping = basketBeforeShippingUpdate?.shipments?.[0]?.shippingAddress;

    const billingComplete = Boolean(existingBilling && !isOrderBillingAddressIncomplete(existingBilling));
    // If billing already differs from shipment shipping, the shopper set a separate billing address — do not replace it when they edit shipping.
    const shopperHasDistinctBillingVersusShipmentShipping =
        billingComplete &&
        Boolean(
            previousShipmentShipping &&
                !isAddressEmpty(previousShipmentShipping) &&
                !isAddressEqual(existingBilling, previousShipmentShipping)
        );
    const useAsBilling = !shopperHasDistinctBillingVersusShipmentShipping;

    let updatedBasket;
    try {
        const clients = createApiClients(context);
        const { data } = await clients.shopperBasketsV2.updateShippingAddressForShipment({
            params: {
                path: {
                    basketId,
                    shipmentId: 'me',
                },
                query: {
                    // Copy shipping to billing when billing is missing, incomplete, or still aligned with shipment shipping.
                    useAsBilling,
                },
            },
            body: {
                address1: addressDataWithExtras.address1,
                address2: addressDataWithExtras.address2,
                city: addressDataWithExtras.city,
                countryCode: addressDataWithExtras.countryCode,
                firstName: addressDataWithExtras.firstName,
                lastName: addressDataWithExtras.lastName,
                phone: addressDataWithExtras.phone,
                postalCode: addressDataWithExtras.postalCode,
                stateCode: addressDataWithExtras.stateCode,
            },
        });
        updatedBasket = data;
    } catch (error) {
        logger.error('SubmitShippingAddress: failed', { error });
        return Response.json(
            {
                success: false,
                error: createActionError({ error }),
                step: 'shippingAddress',
            },
            { status: 500 }
        );
    }

    // sfdc-extension-line SFDC_EXT_MULTISHIP
    try {
        updatedBasket = await assignProductsToDefaultShipment(updatedBasket, context);
    } catch (error) {
        logger.error('SubmitShippingAddress: failed to assign products to default shipment', { error });
    }

    // Extension hook: address verification after shipping address is saved
    const addressHookResult = await runHookSafe({
        hookId: ACTION_HOOK_IDS.CHECKOUT_ADDRESS_VERIFICATION_AFTER_SUBMIT_SHIPPING_ADDRESS,
        context: { data: { basket: updatedBasket, address: addressDataWithExtras }, actionContext: context },
        logger,
        fallbackStep: 'shippingAddress',
    });
    if (addressHookResult.errorResponse) return addressHookResult.errorResponse;

    // Update local basket state with API response
    updateBasketResource(context, updatedBasket);

    // Preserve the contact-info phone that was stored on the billing address
    const contactPhone = existingBilling?.phone;
    const shippingAddr = updatedBasket.shipments?.[0]?.shippingAddress;
    const billingPhoneOverwritten =
        useAsBilling && contactPhone && contactPhone !== updatedBasket.billingAddress?.phone;

    if (
        (isOrderBillingAddressIncomplete(updatedBasket.billingAddress) || billingPhoneOverwritten) &&
        shippingAddr &&
        !isAddressEmpty(shippingAddr)
    ) {
        try {
            const syncClients = createApiClients(context);
            const { data: billingSyncedBasket } = await syncClients.shopperBasketsV2.updateBillingAddressForBasket({
                params: {
                    path: {
                        basketId,
                    },
                },
                body: {
                    firstName: shippingAddr.firstName,
                    lastName: shippingAddr.lastName,
                    address1: shippingAddr.address1,
                    address2: shippingAddr.address2,
                    city: shippingAddr.city,
                    stateCode: shippingAddr.stateCode,
                    postalCode: shippingAddr.postalCode,
                    countryCode: shippingAddr.countryCode,
                    phone: contactPhone || shippingAddr.phone,
                },
            });
            updatedBasket = billingSyncedBasket;
            updateBasketResource(context, updatedBasket);
        } catch (error) {
            logger.error('SubmitShippingAddress: failed to sync billing address from shipping', { error });
        }
    }

    // Save address to customer profile for registered users (if address is new) — best-effort
    try {
        const auth = getAuth(context);
        if (auth?.customerId) {
            const customer = await getCurrentCustomer(context);
            const existingAddresses = customer?.addresses ?? [];
            const existingKeys = new Set(existingAddresses.map((addr) => getAddressKey(addr)));
            if (!existingKeys.has(getAddressKey(addressDataWithExtras))) {
                await saveShippingAddressToCustomer(context, auth.customerId, addressDataWithExtras);
            }
        }
    } catch (error) {
        logger.error('SubmitShippingAddress: failed to save address to customer profile', { error });
    }

    // Fetch shipping methods for the updated basket (now that we have an address). This prevents a
    // "flash" of no shipping options when advancing to the shipping step. Wrapped in try/catch so
    // that a failure here (e.g. SCAPI error) does not fail the whole action: we still return 200
    // with the updated basket and an empty map; the client can then get options from loader
    // revalidation, and the user is not stuck on a 500.
    let shippingMethodsMap: Awaited<ReturnType<typeof fetchShippingMethodsMapForBasket>> = {};
    try {
        shippingMethodsMap = await fetchShippingMethodsMapForBasket(context, updatedBasket);
    } catch (error) {
        logger.error('SubmitShippingAddress: failed to prefetch shipping methods', { error });
    }

    // For every shopper, swap an applied method that is not offerable for the entered address to the
    // first valid one (leaving the basket untouched when none are offerable).
    {
        const shipmentId = updatedBasket.shipments?.[0]?.shipmentId ?? 'me';
        const applicableMethods = shippingMethodsMap[shipmentId]?.applicableShippingMethods;
        updatedBasket = await applyDefaultShippingMethod(context, updatedBasket, applicableMethods);
    }

    // Extension hook: enrich or filter shipping methods after fetch
    const methodsHookResult = await runHookSafe({
        hookId: ACTION_HOOK_IDS.CHECKOUT_SHIPPING_AFTER_METHODS_FETCH,
        context: { data: { basket: updatedBasket, shippingMethodsMap }, actionContext: context },
        logger,
        fallbackStep: 'shippingAddress',
    });
    if (methodsHookResult.errorResponse) return methodsHookResult.errorResponse;
    if (methodsHookResult.result) {
        shippingMethodsMap = (methodsHookResult.result.data as { shippingMethodsMap: typeof shippingMethodsMap })
            .shippingMethodsMap;
    }

    logger.info('SubmitShippingAddress: succeeded', { basketId });

    // Return success data with updated basket and shipping methods for client-side state update
    return Response.json({
        success: true,
        step: 'shippingAddress',
        data: {
            address: addressDataWithExtras,
            shippingMethodsMap,
        },
        basket: updatedBasket,
    });
}
