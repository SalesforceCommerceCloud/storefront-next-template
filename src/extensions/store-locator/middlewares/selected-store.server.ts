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
import { type MiddlewareFunction, createContext as createRouterContext } from 'react-router';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

const COOKIE_SELECTED_STORE = 'selectedStoreInfo';

/**
 * Router context holding the resolved selected store info (or null).
 */
export const selectedStoreContext = createRouterContext<SelectedStoreInfo | null>(null);

/**
 * Storage context for tracking updates during the request lifecycle.
 */
export const selectedStoreStorageContext = createRouterContext<Map<string, string | boolean> | null>(null);

/**
 * Create a cookie instance for the selected store.
 * Uses server-side cookie utilities with proper siteId namespacing.
 */
export const createSelectedStoreCookie = (context: Parameters<MiddlewareFunction>[0]['context']) => {
    return createCookie<string>(
        COOKIE_SELECTED_STORE,
        getCookieConfig(
            {
                path: '/',
                maxAge: 60 * 60 * 24 * 365, // 1 year
                sameSite: 'lax',
                // `secure` inherited from the getCookieConfig default (isRemote()): set on
                // deployed HTTPS, omitted on local dev/preview so Safari persists it.
                httpOnly: false, // Client needs to read for hydration
            },
            context
        ),
        context
    );
};

/**
 * Update selected store in storage (called by action to trigger cookie write in middleware).
 * Pass null to clear the cookie.
 */
export const updateSelectedStore = (
    context: Parameters<MiddlewareFunction>[0]['context'],
    info: SelectedStoreInfo | null
) => {
    const storage = context.get(selectedStoreStorageContext);
    if (!storage) {
        throw new Error('updateSelectedStore must be used within selected store middleware');
    }

    storage.set('storeInfo', info ? JSON.stringify(info) : '');
    storage.set('isUpdated', true);
};

/**
 * Middleware to resolve selected store info from cookie and persist updates via Set-Cookie.
 * Follows the same before/after pattern as authMiddleware.
 */
export const selectedStoreMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const storeCookie = createSelectedStoreCookie(context);

    // Create storage for tracking updates
    const storage = new Map<string, string | boolean>();
    context.set(selectedStoreStorageContext, storage);

    // Parse selected store info from cookie
    const requestCookieHeader = request.headers.get('Cookie');
    const rawValue = requestCookieHeader ? await storeCookie.parse(requestCookieHeader) : null;

    let storeInfo: SelectedStoreInfo | null = null;
    if (rawValue) {
        try {
            const decoded = decodeURIComponent(rawValue);
            const parsed = JSON.parse(decoded);
            if (
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed) &&
                typeof parsed.id === 'string' &&
                parsed.id.trim() &&
                parsed.id.length <= 256 &&
                !/[,\r\n]/.test(parsed.id)
            ) {
                storeInfo = {
                    id: parsed.id,
                    ...(typeof parsed.inventoryId === 'string' ? { inventoryId: parsed.inventoryId } : {}),
                };
            }
        } catch {
            // Invalid JSON in cookie, ignore
        }
    }

    if (rawValue && !storeInfo) {
        storage.set('storeInfo', '');
        storage.set('isUpdated', true);
    }
    context.set(selectedStoreContext, storeInfo);

    const response = await next();

    // After handler: check if store was updated and set cookie
    if (storage.has('isUpdated')) {
        storage.delete('isUpdated');

        const updatedValue = storage.get('storeInfo') as string;
        // Passive reconciliation repairs differences without sliding the one-year
        // expiry on every request. Explicit choices refresh both replicas.
        const refreshCookies = storage.get('refreshCookies') === true;
        if (updatedValue) {
            // Setting a store — serialize the JSON string as the cookie value
            const encoded = encodeURIComponent(updatedValue);
            if (refreshCookies || rawValue !== encoded) {
                response.headers.append('Set-Cookie', await storeCookie.serialize(encoded));
            }
            // Update context for current request
            try {
                context.set(selectedStoreContext, JSON.parse(updatedValue));
            } catch {
                // ignore
            }
        } else {
            // Clearing the store — set empty value with maxAge=0 to delete
            if (refreshCookies || rawValue) {
                response.headers.append('Set-Cookie', await storeCookie.serialize('', { maxAge: 0 }));
            }
            context.set(selectedStoreContext, null);
        }
    }

    const record = storage.get('selectionRecord');
    if (typeof record === 'string') {
        const recordCookie = createCookie<string>(
            'storeChoiceRecord',
            getCookieConfig({ httpOnly: true, maxAge: 60 * 60 * 24 * 365 }, context),
            context
        );
        const encoded = encodeURIComponent(record);
        const incoming = await recordCookie.parse(requestCookieHeader);
        if (storage.get('refreshCookies') === true || incoming !== encoded) {
            response.headers.append('Set-Cookie', await recordCookie.serialize(encoded));
        }
    }
    return response;
};
