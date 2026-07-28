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
import { type MiddlewareFunction, redirect } from 'react-router';
import { createMaintenance, maintenanceContext } from '@/lib/maintenance';
import { getLogger } from '@/lib/logger.server';
import { routes } from '@/route-paths';

/**
 * Middleware that initializes the API ready signal in the context.
 * This signal will be resolved by the maintenanceMiddleware when the first
 * successful API call completes.
 */
export const maintenanceMiddleware: MiddlewareFunction<Response> = async ({ context, request, pattern }, next) => {
    const logger = getLogger(context);
    logger.debug('Maintenance: middleware starting');
    const maintenance = createMaintenance();
    context.set(maintenanceContext, maintenance);
    const response = await next();
    let redirectHome = false;

    try {
        const handledCriticalData = await maintenance.promise;
        redirectHome = handledCriticalData && pattern === 'maintenance';
    } catch (e) {
        // 503 Error -> Redirect to maintenance page
        if (e instanceof Response && e.status === 503 && pattern !== 'maintenance') {
            logger.info('Maintenance: redirecting to maintenance page');
            // Preserve the `returnPath` and filter out the internal `_routes` parameter
            const url = new URL(request.url);
            url.searchParams.delete('_routes');
            const returnPath = `${url.pathname}${url.search}`;
            // oxlint-disable-next-line @typescript-eslint/only-throw-error
            throw redirect(`${routes.maintenance}?returnTo=${encodeURIComponent(returnPath)}`);
        }
    }

    // Redirect to the initial page, or home, when the maintenance page is refreshed
    // and maintenance mode is not active
    // Only do that when returnTo is set, and not when the page is accessed directly
    if (redirectHome) {
        const url = new URL(request.url);
        const returnTo = url.searchParams.get('returnTo');
        if (returnTo) {
            logger.info('Maintenance: redirecting back from maintenance page', { returnTo });
            // oxlint-disable-next-line @typescript-eslint/only-throw-error
            throw redirect(returnTo);
        }
    }

    return response;
};
