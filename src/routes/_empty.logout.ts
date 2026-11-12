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
import { redirect } from 'react-router';
import type { Route } from './+types/_empty.logout';
import { destroyAuth as destroyAuthServer, getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import { destroyBasket } from '@/middlewares/basket.server';
import { getLogger } from '@/lib/logger.server';
import { clearPasswordlessEmailCookie, clearPasswordResetEmailCookie } from '@/lib/auth/remembered-email-cookie.server';
import { routes } from '@/route-paths';

/**
 * This server action is required for authentication, because logout must be handled server-side to properly invalidate
 * server-side sessions and integrate with Salesforce Commerce Cloud's authentication system.
 */
export async function action({ context }: Route.ActionArgs) {
    const logger = getLogger(context);
    const session = getAuth(context);
    const { accessToken, refreshToken } = session;
    if (accessToken && refreshToken) {
        try {
            const clients = createApiClients(context);
            await clients.auth.logout({
                accessToken,
                refreshToken,
            });
        } catch (error) {
            logger.warn('Logout: SLAS logout failed, continuing with session cleanup', { error });
        }
    }
    destroyAuthServer(context);
    destroyBasket(context);
    logger.info('Logout: session destroyed');
    // Drop emails remembered for unused magic links so they don't outlive the session
    // (e.g. on a shared computer).
    const headers = new Headers();
    headers.append('Set-Cookie', await clearPasswordlessEmailCookie(context));
    headers.append('Set-Cookie', await clearPasswordResetEmailCookie(context));
    return redirect(routes.home, { headers });
}
