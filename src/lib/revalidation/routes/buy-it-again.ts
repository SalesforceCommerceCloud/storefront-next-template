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
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { getActionPath, isAmbientMutation } from './shared';

/**
 * `shouldRevalidate` policy for the Past Purchases page. The loader fetches the shopper's order
 * history and resolves currency-scoped product prices, so it opts out of blanket post-action
 * revalidation (e.g. add-to-cart while the page is active) but must re-run for the ambient
 * mutations that change its data:
 *
 * - **Currency / shopper-context** — prices are currency-scoped; a switch invalidates all
 *   displayed prices. Without revalidation, the first 24 tiles show stale prices while
 *   load-more pages come back in the new currency.
 * - **Auth identity** (login / logout) — the loader is scoped to the current shopper. A logout
 *   without leaving the page would leave the previous shopper's order history on screen; any
 *   subsequent load-more call would return 401.
 *
 * @see https://reactrouter.com/start/framework/route-module#shouldrevalidate
 */
export function shouldRevalidate({ currentUrl, formMethod, formAction }: ShouldRevalidateFunctionArgs): boolean {
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        if (actionPath && isAmbientMutation(actionPath)) {
            return true;
        }
    }

    return false;
}
