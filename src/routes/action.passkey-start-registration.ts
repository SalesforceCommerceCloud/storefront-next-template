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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { extractErrorMessage } from '@/lib/auth/error-handler';
import { getLogger } from '@/lib/logger.server';
import { getAuth, startPasskeyRegistration } from '@/middlewares/auth.server';

/**
 * Server action to start WebAuthn passkey registration.
 * Returns publicKey options for navigator.credentials.create() on the client.
 */
export async function action({ request, context }: ActionFunctionArgs) {
    const logger = getLogger(context);

    if (!getConfig(context).features?.passkey?.enabled) {
        throw new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'POST') {
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Method not allowed' }),
            },
            { status: 405 }
        );
    }

    if (getAuth(context).userType !== 'registered') {
        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.NOT_AUTHENTICATED, message: 'Not authenticated' }),
            },
            { status: 401 }
        );
    }

    try {
        const formData = await request.formData();
        const pwdActionToken = formData.get('pwdActionToken')?.toString()?.trim();
        const nickName = formData.get('nickName')?.toString()?.trim() ?? undefined;

        if (!pwdActionToken) {
            return Response.json(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'pwdActionToken is required' }),
                },
                { status: 400 }
            );
        }

        // SCAPI's RegistrationStartRequest.nick_name schema caps the nickname at 128 chars.
        // The modal enforces this before OTP, but validate here too so a direct POST can't slip
        // an over-length value through to SLAS and fail with a generic error.
        if (nickName && nickName.length > 128) {
            return Response.json(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.INVALID_INPUT,
                        message: 'nickName must be 128 characters or fewer',
                    }),
                },
                { status: 400 }
            );
        }

        const result = await startPasskeyRegistration(context, { pwdActionToken, nickName });

        return Response.json({ success: true, publicKey: result.publicKey });
    } catch (error) {
        logger.error('PasskeyStartRegistration: failed', { error });
        const errorMessage = extractErrorMessage(error);

        return Response.json(
            {
                success: false,
                error: createActionError({ code: ErrorCode.OPERATION_FAILED, message: errorMessage }),
            },
            { status: 500 }
        );
    }
}
