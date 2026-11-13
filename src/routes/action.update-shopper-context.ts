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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { Route } from './+types/action.update-shopper-context';
import { data } from 'react-router';
import { extractQualifiersFromInput, updateShopperContext } from '@/lib/shopper-context/server-utils.server';
import { parseJsonToStringRecord } from '@/lib/utils';
import { getAuth } from '@/middlewares/auth.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode, type ActionError } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';

/** Response shape returned by the update-shopper-context action. */
export type UpdateShopperContextResponse = {
    success: boolean;
    message?: string;
    error?: ActionError;
};

/**
 * Server action to update all qualifiers in shopper context.
 * Supports customQualifiers, assignmentQualifiers, couponCodes, sourceCode, and other root-level qualifiers.
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<UpdateShopperContextResponse>>> {
    const logger = getLogger(context);
    if (!getConfig(context).features.shopperContext.enabled) {
        logger.warn('UpdateShopperContext: update denied', {
            actor: getAuth(context).customerId ?? 'anonymous',
            action: 'update_shopper_context',
            target: 'shopper_context',
            timestamp: new Date().toISOString(),
            outcome: 'denied',
            reason: 'feature_disabled',
            method: request.method,
        });
        return data({ success: false, message: 'Shopper context is disabled.' }, { status: 403 });
    }

    logger.debug('UpdateShopperContext: starting', { method: request.method });

    const session = getAuth(context);
    if (!session.usid) {
        logger.warn('UpdateShopperContext: usid not available');
        return data(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.NOT_AUTHENTICATED,
                    message: "Usid isn't available for updating shopper context.",
                }),
            },
            { status: 401 }
        );
    }

    if (request.method !== 'PUT') {
        logger.warn('UpdateShopperContext: method not allowed', { method: request.method });
        return data(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.METHOD_NOT_ALLOWED,
                    message: 'This method is not allowed to update shopper context.',
                }),
            },
            { status: 405 }
        );
    }

    try {
        const formData = await request.formData();
        const qualifiersJson = formData.get('qualifiers');

        // Parse new qualifiers
        const allNewQualifiers =
            qualifiersJson && typeof qualifiersJson === 'string' ? parseJsonToStringRecord(qualifiersJson) : {};

        const { qualifiers: newShopperContext, sourceCodeQualifiers: newSourceCodeContext } =
            extractQualifiersFromInput(allNewQualifiers);

        logger.debug('UpdateShopperContext: extracted qualifiers', {
            shopperContextCount: Object.keys(newShopperContext).length,
            sourceCodeContextCount: Object.keys(newSourceCodeContext).length,
        });

        // Validate that at least one qualifier is provided
        if (Object.keys(newShopperContext).length === 0 && Object.keys(newSourceCodeContext).length === 0) {
            logger.warn('UpdateShopperContext: no qualifiers provided');
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.REQUIRED_FIELD,
                        message: 'At least one qualifier must be provided to update shopper context.',
                    }),
                },
                { status: 400 }
            );
        }

        // Use shared function to update shopper context
        const { setCookieHeaders } = await updateShopperContext({
            context,
            usid: session.usid,
            newShopperContext,
            newSourceCodeContext,
            cookieHeader: request.headers.get('Cookie'),
        });

        logger.info('UpdateShopperContext: succeeded', {
            qualifierCount: Object.keys(newShopperContext).length + Object.keys(newSourceCodeContext).length,
        });

        const headers = new Headers();
        for (const header of setCookieHeaders) {
            headers.append('Set-Cookie', header);
        }

        return data(
            {
                success: true,
                message: 'Shopper context has been updated.',
            },
            { headers }
        );
    } catch (error) {
        logger.error('UpdateShopperContext: failed', { error });
        return data(
            {
                success: false,
                error: createActionError({ error }),
            },
            { status: 500 }
        );
    }
}
