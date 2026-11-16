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
import type { Route } from './+types/action.post-order-register';
import { registerCustomer } from '@/lib/api/auth/register.server';
import { CommerceContextError, commerceContextErrorResponse } from '@/lib/auth/commerce-context.server';
import { isPasswordValid } from '@/lib/utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import {
    saveShippingAddressToCustomer,
    saveBillingAddressToCustomer,
    updateCustomerContactInfo,
} from '@/lib/api/customer.server';

export type PostOrderRegisterResponse = {
    success: boolean;
    error?: string;
};

/**
 * Server action for post-order password-based registration.
 * Used on the order confirmation page when email verification is disabled.
 * Registers the guest shopper with their order email and chosen password,
 * then auto-logs them in and saves order data (addresses, payment) to the new profile.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<PostOrderRegisterResponse | Response> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);

    logger.debug('PostOrderRegister: starting');

    const formData = await request.formData();
    const email = formData.get('email')?.toString();
    const firstName = formData.get('firstName')?.toString();
    const lastName = formData.get('lastName')?.toString();
    const password = formData.get('password')?.toString();
    const confirmPassword = formData.get('confirmPassword')?.toString();
    const orderNo = formData.get('orderNo')?.toString();

    if (!email || !password || !confirmPassword) {
        logger.warn('PostOrderRegister: missing required fields');
        return { success: false, error: t('signup:allFieldsRequired') };
    }

    if (password !== confirmPassword) {
        logger.warn('PostOrderRegister: passwords do not match');
        return { success: false, error: t('signup:passwordsDoNotMatch') };
    }

    if (!isPasswordValid(password)) {
        logger.warn('PostOrderRegister: password not secure');
        return { success: false, error: t('signup:passwordNotSecure') };
    }

    const result = await registerCustomer(context, {
        customer: {
            firstName: firstName || '',
            lastName: lastName || '',
            login: email,
            email,
        },
        password,
    }).catch((error: unknown) => {
        if (error instanceof CommerceContextError) return commerceContextErrorResponse(error);
        throw error;
    });

    if (result instanceof Response) return result;
    if (!result.success) {
        logger.warn('PostOrderRegister: registration failed');
        return { success: false, error: result.error || t('errors:genericTryAgain') };
    }

    logger.info('PostOrderRegister: registration succeeded', { email });

    // After registration + auto-login, save order data to the new customer profile
    if (orderNo) {
        try {
            const auth = getAuth(context);
            const customerId = auth.customerId;

            if (customerId) {
                const clients = createApiClients(context);
                const { data: order } = await clients.shopperOrders.getOrder({
                    params: { path: { orderNo } },
                });

                if (order) {
                    const savePromises: Promise<unknown>[] = [];

                    // Save shipping address
                    const shippingAddress = order.shipments?.[0]?.shippingAddress;
                    if (shippingAddress) {
                        savePromises.push(
                            saveShippingAddressToCustomer(context, customerId, shippingAddress, true).catch((error) => {
                                logger.error('PostOrderRegister: failed to save shipping address', { error });
                            })
                        );
                    }

                    // Save billing address (only if different from shipping)
                    const billingAddress = order.billingAddress;
                    if (billingAddress && billingAddress.address1 !== shippingAddress?.address1) {
                        savePromises.push(
                            saveBillingAddressToCustomer(context, customerId, billingAddress).catch((error) => {
                                logger.error('PostOrderRegister: failed to save billing address', { error });
                            })
                        );
                    }

                    // Note: Payment instruments are intentionally NOT saved to the profile here.
                    // This flow runs when email verification is disabled, so account ownership
                    // is not fully verified — saving payment data would be a security risk.

                    // Save phone number
                    const phone = shippingAddress?.phone || billingAddress?.phone;
                    if (phone) {
                        savePromises.push(
                            updateCustomerContactInfo(context, customerId, { phone }).catch((error) => {
                                logger.error('PostOrderRegister: failed to save phone', { error });
                            })
                        );
                    }

                    await Promise.all(savePromises);
                    logger.info('PostOrderRegister: saved order data to profile', { orderNo });
                }
            }
        } catch (error) {
            // Profile saves are best-effort — don't fail the registration
            logger.error('PostOrderRegister: failed to save order data to profile', { error });
        }
    }

    return { success: true };
}
