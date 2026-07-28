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
import { authorizePasskeyRegistration, getAuth } from '@/middlewares/auth.server';

/**
 * Server action to authorize a user for WebAuthn passkey registration.
 * Triggers SLAS to send an OTP (delivery mode from `features.passkey.mode`).
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
        await authorizePasskeyRegistration(context);

        return Response.json({ success: true });
    } catch (error) {
        logger.error('PasskeyAuthorizeRegistration: failed', { error });
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
