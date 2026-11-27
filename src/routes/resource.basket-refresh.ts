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
import { data, isRouteErrorResponse } from 'react-router';
import type { BasketRefreshResult } from '@/lib/basket/refresh';
import type { Route } from './+types/resource.basket-refresh';
import { refreshBasket } from '@/middlewares/basket.server';

// Only the root hybrid coordinator decides when another background read is needed.
export const shouldRevalidate = () => false;

/** Refresh basket state without product enrichment or response snapshot-cookie side effects. */
export async function loader({ context }: Route.LoaderArgs) {
    return data(await refreshBasket(context), { headers: { 'Cache-Control': 'private, no-store' } });
}

/** Contain recoverable background transport failures before the router handles loader errors. */
// oxlint-disable-next-line eslint/no-restricted-exports -- Delegate data to serverLoader; contain optional refresh transport errors before router error bubbling.
export async function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs): Promise<BasketRefreshResult> {
    try {
        return await serverLoader();
    } catch (error) {
        const status = error instanceof Response || isRouteErrorResponse(error) ? error.status : undefined;
        // React Router 7 wraps response-body stream failures in this plain Error.
        const decodingFailed = error instanceof Error && error.message === 'Unable to decode turbo-stream response';
        if (
            !request.signal.aborted &&
            (error instanceof TypeError || decodingFailed || (status !== undefined && status >= 500))
        ) {
            return { success: false };
        }
        // Preserve redirects, authentication/context failures, cancellations, and unexpected errors.
        throw error;
    }
}
