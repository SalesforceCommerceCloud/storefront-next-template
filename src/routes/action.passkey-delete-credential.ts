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
import { data, type ActionFunctionArgs } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { deletePasskeyCredential, getAuth } from '@/middlewares/auth.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';
import type { ActionResponse } from '@/routes/types/action-responses';

/**
 * Server action for removing a single WebAuthn passkey credential from the
 * currently authenticated shopper's account.
 */
export async function action({
    request,
    context,
}: ActionFunctionArgs): Promise<ReturnType<typeof data<ActionResponse>>> {
    const logger = getLogger(context);

    if (!getConfig(context).features?.passkey?.enabled) {
        throw new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'POST') {
        logger.warn('PasskeyDeleteCredential: method not allowed', { method: request.method });
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Method not allowed' }),
            },
            { status: 405 }
        );
    }

    const auth = getAuth(context);
    if (auth.userType !== 'registered' || !auth.customerId) {
        logger.warn('PasskeyDeleteCredential: not authenticated');
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_AUTHENTICATED, message: 'Not authenticated' }),
            },
            { status: 401 }
        );
    }

    try {
        const formData = await request.formData();
        const credentialId = formData.get('credentialId')?.toString();

        if (!credentialId) {
            logger.warn('PasskeyDeleteCredential: missing credential ID');
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'Credential ID is required' }),
                },
                { status: 400 }
            );
        }

        await deletePasskeyCredential(context, credentialId);

        logger.info('PasskeyDeleteCredential: succeeded', { credentialId });
        return data({ success: true });
    } catch (error) {
        logger.error('PasskeyDeleteCredential: failed', { error });
        return data({ success: false, error: createActionError({ error }) }, { status: 500 });
    }
}
