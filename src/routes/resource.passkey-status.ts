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
import type { Route } from './+types/resource.passkey-status';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { getLoginEmailFromToken } from '@/middlewares/auth.utils';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import { ApiError, AuthTokenInvalidError } from '@/scapi';

export type PasskeyStatusData = {
    hasPasskey: boolean;
    error?: boolean;
};

/**
 * Returns whether the currently authenticated user has any registered passkey credentials.
 * Returns { hasPasskey: false } for guests. On API errors, returns { hasPasskey: false, error: true }
 * so callers can distinguish "confirmed no passkey" from "status unknown" and avoid upselling a
 * user who may already have one.
 */
export async function loader({ context }: Route.LoaderArgs): Promise<PasskeyStatusData> {
    const logger = getLogger(context);

    if (!getConfig(context).features?.passkey?.enabled) {
        throw new Response('Not Found', { status: 404 });
    }

    const session = getAuth(context);

    const loginEmail = getLoginEmailFromToken(session.accessToken);
    if (session.userType !== 'registered' || !session.accessToken || !loginEmail) {
        return { hasPasskey: false };
    }

    try {
        const clients = createApiClients(context);
        const result = await clients.auth.webAuthn.getPasskeyUser({
            accessToken: session.accessToken,
            loginId: loginEmail,
        });
        const credentials = result.data?.credentials ?? [];
        return { hasPasskey: credentials.length > 0 };
    } catch (error) {
        // SLAS returns 404 for any shopper who has never registered a passkey — this is
        // the expected state for most users, not a failure. Only non-404 errors are
        // "status unknown" and should block the upsell.
        if (error instanceof ApiError && error.status === 404) {
            return { hasPasskey: false };
        }
        // getPasskeyUser is Bearer-authenticated, so a 401 here already fired
        // onAuthTokenInvalid and flagged the auth middleware's recovery sentinel before this
        // throw. Swallowing it into { error: true } would let the loader return normally while
        // the sentinel still triggers a recovery redirect behind its back — re-throw instead so
        // the normal recovery path owns the outcome consistently with every other endpoint.
        if (error instanceof AuthTokenInvalidError) {
            throw error;
        }
        logger.debug('PasskeyStatus: could not retrieve passkey user status', { error });
        return { hasPasskey: false, error: true };
    }
}
