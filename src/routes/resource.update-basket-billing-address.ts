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

import { z } from 'zod';
import type { ActionFunctionArgs } from 'react-router';
import { getBasket } from '@/middlewares/basket.server';
import { updateBillingAddressForBasket } from '@/lib/api/basket.server';
import { getLogger } from '@/lib/logger.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';

const orderAddressSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    stateCode: z.string().min(1),
    postalCode: z.string().min(1),
    phone: z.string().optional(),
    countryCode: z.string().min(1),
});

/**
 * Persists a billing address to the current basket.
 * Used by payment extensions that replace the payment UI target and register
 * `onPlaceOrder` - they do not drive `submit-payment`, so this route provides
 * a dedicated path to write `basket.billingAddress` before the extension's
 * `onPlaceOrder` runs.
 *
 * POST -> 200 { success: true } | 400/500 { success: false, error, step }.
 */
export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const logger = getLogger(context);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.INVALID_INPUT, message: 'Invalid JSON body' }),
                step: 'billingAddress',
            },
            { status: 400 }
        );
    }

    const parsed = orderAddressSchema.safeParse(body);
    if (!parsed.success) {
        return Response.json(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.INVALID_INPUT,
                    message: parsed.error.issues.map((i) => i.message).join(', '),
                }),
                step: 'billingAddress',
            },
            { status: 400 }
        );
    }

    const basketResource = await getBasket(context, { ensureBasket: false });
    const basketId = basketResource.current?.basketId ?? basketResource.snapshot?.basketId ?? null;
    if (!basketId) {
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No active basket' }),
                step: 'billingAddress',
            },
            { status: 400 }
        );
    }

    try {
        await updateBillingAddressForBasket(context, basketId, parsed.data);
        return Response.json({ success: true });
    } catch (error) {
        logger.error('[Checkout] update-basket-billing-address: failed', { basketId, error });
        return Response.json(
            {
                success: false,
                error: createActionError({ error, code: ErrorCode.OPERATION_FAILED }),
                step: 'billingAddress',
            },
            { status: 500 }
        );
    }
}
