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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { RouterContextProvider } from 'react-router';
import { getAuth } from '@/middlewares/auth.server';
import { createApiClients } from '@/lib/api-clients.server';
import type { ShopperCustomers } from '@/scapi';

/** Distinguish malformed profile data from transport failures (which may also be TypeErrors). */
export class InvalidPreferredStoreIdError extends TypeError {
    constructor() {
        super('Preferred store ID must be a nonblank string of at most 256 characters');
    }
}

function validateStoreId(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value.trim() || value.length > 256) {
        throw new InvalidPreferredStoreIdError();
    }
}

/**
 * Read the registered shopper's native, site-specific profile preference. Requires auth middleware.
 * Returns null for nonregistered shoppers or an unset attribute; does not resolve or clear stale store IDs.
 * Throws a 401 Response for a registered session without a customer ID, TypeError for malformed IDs,
 * and propagates API failures.
 */
export async function getPreferredStoreId(context: Readonly<RouterContextProvider>): Promise<string | null> {
    const session = getAuth(context);
    if (session.userType !== 'registered') {
        return null;
    }
    const customerId = session.customerId;
    if (typeof customerId !== 'string' || !customerId.trim()) {
        // oxlint-disable-next-line typescript/only-throw-error -- React Router handles thrown HTTP Responses.
        throw new Response('Unauthorized', { status: 401 });
    }

    const clients = createApiClients(context);
    const { data: customer } = await clients.shopperCustomers.getCustomer({
        params: { path: { customerId }, query: { expand: ['none'] } },
    });
    const storeId = (customer as typeof customer & { preferredStoreId?: unknown }).preferredStoreId;
    if (storeId === undefined || storeId === null || storeId === '') {
        return null;
    }
    validateStoreId(storeId);
    return storeId;
}

/**
 * Set only the registered shopper's native preferred store for the current site, or clear it with null.
 * Requires auth middleware; the caller must validate the store's existence and suitability.
 * Throws a 401 Response for nonregistered shoppers or a missing customer ID, TypeError for invalid IDs,
 * and propagates API failures. Nonblank IDs are sent unchanged.
 */
export async function updatePreferredStoreId(
    context: Readonly<RouterContextProvider>,
    storeId: string | null
): Promise<void> {
    const session = getAuth(context);
    const customerId = session.customerId;
    if (session.userType !== 'registered' || typeof customerId !== 'string' || !customerId.trim()) {
        // oxlint-disable-next-line typescript/only-throw-error -- React Router handles thrown HTTP Responses.
        throw new Response('Unauthorized', { status: 401 });
    }
    if (storeId !== null) {
        validateStoreId(storeId);
    }

    const clients = createApiClients(context);
    // The generated Customer schema does not yet declare the native field.
    const body: ShopperCustomers.schemas['Customer'] & { preferredStoreId: string | null } = {
        preferredStoreId: storeId,
    };
    await clients.shopperCustomers.updateCustomer({
        params: { path: { customerId } },
        body,
    });
}
