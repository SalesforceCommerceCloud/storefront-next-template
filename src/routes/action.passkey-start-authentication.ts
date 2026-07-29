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
import { ApiError } from '@/scapi';
import { startPasskeyAuthentication } from '@/middlewares/auth.server';

/**
 * Server action to start WebAuthn passkey authentication (login).
 * Anonymous/guest endpoint — no auth gate. Returns publicKey options for
 * navigator.credentials.get() on the client. An optional `userId` requests a
 * non-discoverable challenge; omitted, the browser/autofill picks the credential.
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

    try {
        // The discoverable-credential case (conditional mediation on mount/blur) sends no
        // body at all, so request.formData() can't be called unconditionally — it throws on
        // a bodyless/wrong-content-type request. Only parse when a form body is actually sent.
        let userId: string | undefined;
        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            userId = formData.get('userId')?.toString()?.trim() || undefined;
        }

        const result = await startPasskeyAuthentication(context, { userId });

        return Response.json({ success: true, publicKey: result.publicKey });
    } catch (error) {
        // SLAS returns 412 (carrying X-RateLimit-1M headers) when a shopper re-attempts
        // authentication within ~1 minute of a previous attempt. This is a benign short-window
        // throttle, not a real failure — and start runs pre-gesture during conditional mediation,
        // which the shopper may not have consciously initiated. Mirror PWA Kit: bail quietly so
        // the client's `!success` guard stops the ceremony with nothing surfaced. Logged at info
        // (not error) because it is expected, self-clearing behaviour.
        if (error instanceof ApiError && error.status === 412) {
            logger.info('PasskeyStartAuthentication: throttled (412), returning silently');
            return Response.json({ success: false });
        }

        logger.error('PasskeyStartAuthentication: failed', { error });

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
