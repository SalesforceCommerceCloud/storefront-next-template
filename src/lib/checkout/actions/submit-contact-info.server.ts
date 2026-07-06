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
import { ensureBasketId, updateBasketResource } from '@/middlewares/basket.server';
import { authorizePasswordless } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { createContactInfoSchema, parseContactInfoFromFormData } from '@/lib/checkout/schemas';
import { updateBillingAddressForBasket } from '@/lib/api/basket.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';
import { getLoginPreferences } from '@/lib/login-preferences.server';
import { ACTION_HOOK_IDS, runHookSafe } from '@/targets/action-hook.server';

/**
 * Server action for submitting checkout contact information.
 */
export async function action(formData: FormData, context: ActionFunctionArgs['context']) {
    const logger = getLogger(context);
    const { t } = getTranslation();
    logger.debug('SubmitContactInfo: starting');

    // Parse and validate using shared schema
    // This ensures server-side validation matches client-side validation exactly
    const contactData = parseContactInfoFromFormData(formData);
    const contactInfoSchema = createContactInfoSchema(t);
    const result = contactInfoSchema.safeParse(contactData);

    if (!result.success) {
        return Response.json(
            {
                success: false,
                fieldErrors: result.error.flatten().fieldErrors,
                step: 'contactInfo',
            },
            { status: 400 }
        );
    }

    // Use validated data
    const { email, countryCode, phone } = result.data;

    // Combine country code and phone number with space separator
    const fullPhone = countryCode && phone ? `${countryCode} ${phone}` : phone;

    const basketId = await ensureBasketId(context);
    if (!basketId) {
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No active basket found' }),
                step: 'contactInfo',
            },
            { status: 400 }
        );
    }

    // Always update basket with customer email (required for order placement)
    let updatedBasket;
    try {
        const clients = createApiClients(context);
        const { data: basketData } = await clients.shopperBasketsV2.updateCustomerForBasket({
            params: {
                path: {
                    basketId,
                },
            },
            body: {
                email,
            },
        });

        updatedBasket = basketData;

        // Update local basket state with API response
        updateBasketResource(context, updatedBasket);
    } catch (error) {
        logger.error('SubmitContactInfo: failed to update customer email', { error });
        return Response.json(
            {
                success: false,
                error: createActionError({ error }),
                step: 'contactInfo',
            },
            { status: 500 }
        );
    }

    // Save phone to billing address so it persists for order placement
    if (fullPhone && updatedBasket) {
        try {
            const existingBilling = updatedBasket.billingAddress ?? {};
            const billingWithPhone = { ...existingBilling, phone: fullPhone };
            const billingBasket = await updateBillingAddressForBasket(context, basketId, billingWithPhone);
            updatedBasket = { ...updatedBasket, billingAddress: billingBasket.billingAddress };
            updateBasketResource(context, updatedBasket);
        } catch (error) {
            logger.error('SubmitContactInfo: failed to save phone to billing address', { error });
        }
    }

    // Send OTP for passwordless login when shopper enters email (mode=email). Non-blocking.
    // To enable passwordless login, the "Enable Email Verification" site preference under "Storefront Login Preferences" must be enabled.
    //
    // strictVerify=true asks SLAS to reject the authorize call (HTTP 400) for shoppers
    // whose email is registered but unverified. The error is swallowed here because this
    // submission is non-blocking; the dedicated /action/authorize-passwordless-email path
    // (called from contact-info.tsx) is where the requiresLogin response is consumed and
    // the standard login modal is opened.
    const { emailVerificationEnabled } = await getLoginPreferences(context);
    if (emailVerificationEnabled && email?.trim()) {
        try {
            await authorizePasswordless(context, { userid: email.trim(), strictVerify: true });
        } catch (error) {
            logger.error('SubmitContactInfo: failed to send passwordless OTP', { error });
        }
    }
    // Extension hook: fraud/identity checks after contact info is saved
    const hookResult = await runHookSafe({
        hookId: ACTION_HOOK_IDS.CHECKOUT_FRAUD_AFTER_SUBMIT_CONTACT_INFO,
        context: { data: { basket: updatedBasket, email, phone: fullPhone }, actionContext: context },
        logger,
        fallbackStep: 'contactInfo',
    });
    if (hookResult.errorResponse) return hookResult.errorResponse;

    logger.info('SubmitContactInfo: succeeded', { basketId });

    return Response.json({
        success: true,
        step: 'contactInfo',
        data: {
            email,
            phone: fullPhone,
        },
        basket: updatedBasket,
    });
}
