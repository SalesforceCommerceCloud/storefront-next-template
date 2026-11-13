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
import { createContext, type RouterContextProvider } from 'react-router';
import { createShopperContextHelpers, type ShopperContext as ShopperContextNamespace } from '@/scapi';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { createApiClients } from '@/lib/api-clients.server';

/**
 * ShopperContext request body type — uses the API schema directly.
 * Which qualifiers are sent is controlled by SHOPPER_CONTEXT_SEARCH_PARAMS in shopper-context-constants.
 * @see https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-context?meta=createShopperContext
 */
export type ShopperContext = ShopperContextNamespace.schemas['ShopperContext'];

/**
 * Create or replace shopper context using PUT API
 *
 * This function wraps the PUT ShopperContext API call to create or replace
 * a shopper's context. PUT replaces the entire context.
 *
 * @param context - React Router context
 * @param usid - Shopper's unique identifier
 * @param body - ShopperContext body to send
 * @returns Promise that resolves when context is created/replaced (void)
 * @throws Error if context, usid, or body are invalid, or if the API call fails
 */
export async function createShopperContext(
    context: Readonly<RouterContextProvider>,
    usid: string,
    body: Partial<ShopperContext>
): Promise<void> {
    // Validate context
    if (!context) {
        throw new Error('Context is required');
    }

    // Validate usid
    if (!usid || typeof usid !== 'string' || usid.trim().length === 0) {
        throw new Error('USID is required and must be a non-empty string');
    }

    // Validate body
    if (!body) {
        throw new Error('Body is required and must be a plain object');
    }

    // Validate body is not empty (at least one field should be set)
    if (Object.keys(body).length === 0) {
        throw new Error('Body must contain at least one field');
    }

    try {
        const config = getConfig(context);
        const clients = createApiClients(context);
        const { site } = context.get(siteContext) as SiteContext;

        await clients.shopperContext.createShopperContext({
            params: {
                path: {
                    organizationId: config.commerce.api.organizationId,
                    usid,
                },
                query: {
                    siteId: site.id,
                },
            },
            body,
        });
    } catch (error) {
        const wrappedError = new Error(
            `An unexpected error occurred in createShopperContext: ${error instanceof Error ? error.message : String(error)}`
        );
        wrappedError.cause = error; // Preserve original error
        throw wrappedError;
    }
}

const shopperContextHelpersContext = createContext<{
    usid: string;
    helpers: ReturnType<typeof createShopperContextHelpers>;
} | null>(null);

/** Share native state within a request, discarding the snapshot when its shopper session changes. */
export function getShopperContextHelpers(context: Readonly<RouterContextProvider>, usid: string) {
    let cached = context.get(shopperContextHelpersContext);
    if (!cached || cached.usid !== usid) {
        cached = {
            usid,
            helpers: createShopperContextHelpers({ client: createApiClients(context).shopperContext, usid }),
        };
        context.set(shopperContextHelpersContext, cached);
    }
    return cached.helpers;
}
