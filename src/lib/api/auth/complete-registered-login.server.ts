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
import type { AuthResponse } from '@/scapi';
import type { RouterContextProvider } from 'react-router';
import { updateAuth } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import {
    assertStoreSelectionLoginSession,
    prepareStoreSelectionForLogin,
    reconcileStoreAfterAuthentication,
} from '@/extensions/store-locator/lib/store-selection.server';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

/** Complete every explicit login before basket transfer. Refresh continues using updateAuth. */
export async function completeRegisteredLogin(
    context: Readonly<RouterContextProvider>,
    authenticate: () => Promise<AuthResponse>
): Promise<AuthResponse> {
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    const sourceHasItems = await prepareStoreSelectionForLogin(context);
    const response = await authenticate();
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    assertStoreSelectionLoginSession(context, response, sourceHasItems);
    updateAuth(context, response);
    // Authentication has succeeded even if a later commerce operation fails.
    getLogger(context).info('Authentication completed', {
        actor: response.customer_id,
        action: 'login',
        target: response.customer_id,
        timestamp: new Date().toISOString(),
        outcome: 'success',
    });
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    try {
        await reconcileStoreAfterAuthentication(context, sourceHasItems);
    } catch (cause) {
        getLogger(context).warn('Authentication commerce reconciliation failed', {
            actor: response.customer_id,
            action: 'reconcile_login_context',
            target: 'shopping_context',
            timestamp: new Date().toISOString(),
            outcome: 'incomplete',
            code: cause instanceof CommerceContextError ? cause.code : 'STORE_CONTEXT_UNAVAILABLE',
        });
        if (cause instanceof CommerceContextError) throw cause;
        throw new CommerceContextError('STORE_CONTEXT_UNAVAILABLE', 502, { cause });
    }
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    return response;
}
