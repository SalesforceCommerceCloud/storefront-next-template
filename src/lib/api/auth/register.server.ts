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
import type { ShopperCustomers } from '@/scapi';
import type { CustomQueryParameters } from '@/lib/api/types';
import { createApiClients } from '@/lib/api-clients.server';
import { loginRegisteredUser } from './standard-login.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { getLogger } from '@/lib/logger.server';

// Helper to extract custom parameters (keys starting with c_ with allowed value types)
const extractCustomParameters = (parameters: {
    [key: string]: string | number | boolean | string[] | number[];
}): CustomQueryParameters => {
    // oxlint-disable-next-line @typescript-eslint/no-unused-vars
    const { customer, password, ...customParams } = parameters;
    return customParams;
};

export const registerCustomer = async (
    context: ActionFunctionArgs['context'],
    registrationData: ShopperCustomers.schemas['CustomerRegistration']
): Promise<{
    success: boolean;
    error?: string;
}> => {
    const { t } = getTranslation(context);

    try {
        const { customer, password, ...parameters } = registrationData;
        const { login, firstName, lastName } = customer;
        const customParameters = extractCustomParameters(parameters);

        if (!login || !firstName || !lastName) {
            throw new Error(t('errors:missingRegistrationField'));
        }

        // The registerCustomer endpoint currently does not support custom parameters
        // so we make sure not to send any custom params here
        const clients = createApiClients(context);
        const { data: createdCustomer } = await clients.shopperCustomers.registerCustomer({
            params: {},
            body: {
                customer,
                password,
            },
        });
        getLogger(context).info('Account created', {
            actor: createdCustomer.customerId,
            action: 'register_customer',
            target: createdCustomer.customerId,
            timestamp: new Date().toISOString(),
            outcome: 'success',
        });

        // After registration, log the user in automatically
        const loginResult = await loginRegisteredUser(
            context,
            {
                email: login,
                password,
            },
            { customParameters }
        );

        if (loginResult.success) {
            return {
                success: true,
            };
        } else {
            // Login after registration failed
            throw new Error(t('errors:autoLoginAfterRegistrationFailed'));
        }
    } catch (error) {
        // Registration and authentication may already have succeeded. Preserve
        // the reconciliation status and consent handoff for the route boundary.
        if (error instanceof CommerceContextError) throw error;
        const errorMessage = t('errors:genericTryAgain');

        return {
            success: false,
            error: errorMessage,
        };
    }
};
