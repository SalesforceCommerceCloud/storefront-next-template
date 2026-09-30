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
import type { LoaderFunctionArgs } from 'react-router';
import { type ShopperCustomers, type ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getLogger } from '@/lib/logger.server';
import { getAuth } from '@/middlewares/auth.server';
import { hasUsableShopperSession } from '@/middlewares/auth.utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ActionError } from '@/lib/error-codes';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { setWishlistMergeCookie } from '@/lib/wishlist/merge-result-cookie.server';
import { TrackingConsent } from '@/types/tracking-consent';
import { getDefaultProductExpansions } from '@/lib/api/products.server';
import { getSeoSlugExpansion } from '@/lib/seo/scapi-slugs';

type CustomerProductList = ShopperCustomers.schemas['CustomerProductList'];
type CustomerProductListItem = ShopperCustomers.schemas['CustomerProductListItem'];
type Product = ShopperProducts.schemas['Product'];

/** Shared response shape returned by wishlist action routes and consumed by the useWishlist hook. */
export type WishlistActionResponse = {
    success: boolean;
    error?: ActionError;
    alreadyInWishlist?: boolean;
};

/** Time to wait for Commerce Cloud to index a newly created wishlist. */
const WISHLIST_CREATION_DELAY_MS = 1500;
/** Time to wait before retrying to fetch a wishlist's listId after a stale read. */
const WISHLIST_RETRY_DELAY_MS = 2000;

/**
 * Fetch product details for wishlist items
 * The API has a limit based on search config, so we batch requests if needed
 */
export async function fetchProductsForWishlist(
    context: LoaderFunctionArgs['context'],
    items: CustomerProductListItem[],
    allItems?: CustomerProductListItem[]
): Promise<Record<string, Product>> {
    const logger = getLogger(context);
    const productIds = items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id) && typeof id === 'string' && id.trim().length > 0);

    if (!productIds.length) {
        return {};
    }

    const clients = createApiClients(context);
    const config = getConfig(context);
    const maxIdsPerRequest = config.search.products.hits.limit;
    const productsByProductId: Record<string, Product> = {};

    const currency = (context.get(siteContext) as SiteContext).currency;

    // Initialize map with empty placeholder objects for ALL wishlist items if provided
    // This ensures the map has entries for all products, even unfetched ones
    // Empty objects have just the id field to track which products need fetching
    if (allItems) {
        allItems.forEach((item) => {
            if (item.productId) {
                productsByProductId[item.productId] = { id: item.productId } as Product;
            }
        });
    }

    // Batch requests if we have more than maxIdsPerRequest product IDs
    for (let i = 0; i < productIds.length; i += maxIdsPerRequest) {
        const batchIds = productIds.slice(i, i + maxIdsPerRequest);

        // Skip empty batches
        if (batchIds.length === 0) {
            continue;
        }

        try {
            const { data: productsResponse } = await clients.shopperProducts.getProducts({
                params: {
                    query: {
                        ids: batchIds,
                        allImages: true,
                        perPricebook: true,
                        expand: getDefaultProductExpansions(...getSeoSlugExpansion(config.url?.seoRoutes)),
                        ...(currency ? { currency } : {}),
                    },
                },
            });

            if (productsResponse.data) {
                productsResponse.data.forEach((product) => {
                    if (product.id) {
                        productsByProductId[product.id] = product;
                    }
                });
            }
        } catch (error) {
            logger.error('Error fetching products batch', { ids: batchIds.join(', '), error });
            // Continue processing other batches even if one fails
        }
    }

    return productsByProductId;
}

/**
 * Get the customer's wishlist with items. It's the first list with `wish_list` type.
 * Returns the wishlist metadata, items, and extracted ID.
 *
 * Wraps SCAPI's `shopperCustomers.getCustomerProductList(s)` with operation-context logging and
 * normalizes any thrown error into `NormalizedApiError` for consistent downstream handling.
 *
 * @param context - Loader function context
 * @param customerId - The customer ID
 * @param listId - Optional list ID for direct fetch. If provided, fetches the specific list directly.
 * @throws {NormalizedApiError} When the API request fails
 */
export async function getWishlist(
    context: LoaderFunctionArgs['context'],
    customerId: string,
    listId?: string
): Promise<{
    wishlist: CustomerProductList | null;
    items: CustomerProductListItem[];
    id: string | null;
}> {
    const logger = getLogger(context);
    const clients = createApiClients(context);

    if (listId) {
        try {
            const { data: wishlist } = await clients.shopperCustomers.getCustomerProductList({
                params: {
                    path: { customerId, listId },
                },
            });

            return {
                wishlist,
                items: wishlist.customerProductListItems ?? [],
                id: wishlist.id || null,
            };
        } catch (error) {
            logger.error('shopperCustomers.getCustomerProductList failed', { customerId, listId });
            throw new NormalizedApiError(error);
        }
    }

    try {
        const { data: productLists } = await clients.shopperCustomers.getCustomerProductLists({
            params: {
                path: { customerId },
            },
        });

        // Find the wishlist
        const wishlist = productLists?.data?.find((list) => list.type === 'wish_list');

        if (!wishlist) {
            return { wishlist: null, items: [], id: null };
        }

        // It's possible that id does not exist yet, if Commerce Cloud is still indexing the newly created wishlist
        return {
            wishlist,
            items: wishlist.customerProductListItems ?? [],
            id: wishlist.id || null,
        };
    } catch (error) {
        logger.error('shopperCustomers.getCustomerProductLists failed', { customerId });
        throw new NormalizedApiError(error);
    }
}

/**
 * Get or create the default wishlist (product list) for a customer. Guarantees a
 * wishlist with a valid `listId` or throws.
 *
 * Used by both the add action and the merge path.
 */
export async function getOrCreateWishlist(
    context: LoaderFunctionArgs['context'],
    customerId: string
): Promise<CustomerProductList> {
    const { t } = getTranslation();
    const logger = getLogger(context);
    const clients = createApiClients(context);

    try {
        // Try to get the default wishlist using getWishlist
        const { wishlist, id: listId } = await getWishlist(context, customerId);

        if (wishlist) {
            // Commerce Cloud may take time to index wishlists. If the wishlist exists but
            // doesn't have a listId yet, wait and retry once to handle indexing delays.
            // This ensures the function contract: always return a wishlist with valid listId.
            if (listId) {
                return wishlist;
            }

            logger.warn('Wishlist: indexing delay, retrying getWishlist', { customerId });
            await new Promise((resolve) => setTimeout(resolve, WISHLIST_RETRY_DELAY_MS));

            const { wishlist: retryWishlist, id: retryListId } = await getWishlist(context, customerId);

            if (retryWishlist && retryListId) {
                return retryWishlist;
            }

            logger.error('Wishlist: listId still missing after retry', { customerId });
            throw new Error(t('account:wishlist.unableToRetrieveId'));
        }

        // Create a new wishlist if it doesn't exist. The POST response body comes from the
        // write path and is not subject to the index-propagation delay that affects the GET
        // endpoints (see the retry branch above and the comment in getWishlist). When the
        // response carries an id we can return it immediately. Only when it doesn't do we
        // wait for the index to catch up and re-read — the original behavior — because that
        // GET is what the indexing-delay sleep was protecting all along.
        const { data: created } = await clients.shopperCustomers.createCustomerProductList({
            params: {
                path: { customerId },
            },
            body: {
                type: 'wish_list',
                public: false,
                name: t('account:wishlist.wishlistName'),
            },
        });

        if (created?.id) {
            return created;
        }

        logger.warn('Wishlist: createCustomerProductList returned without an id, waiting for index propagation', {
            customerId,
        });
        await new Promise((resolve) => setTimeout(resolve, WISHLIST_CREATION_DELAY_MS));

        const { wishlist: createdWishlist, id: createdListId } = await getWishlist(context, customerId);

        if (!createdWishlist || !createdListId) {
            logger.error('Wishlist: createCustomerProductList returned without a usable list', { customerId });
            throw new Error(t('account:wishlist.failedToCreate'));
        }
        return createdWishlist;
    } catch (error) {
        logger.warn('Wishlist: getOrCreateWishlist primary path failed, falling back to first list', { customerId });
        // If creating fails, try to get the first available list
        try {
            const { data: productLists } = await clients.shopperCustomers.getCustomerProductLists({
                params: {
                    path: { customerId },
                },
            });
            const firstList = productLists?.data?.[0];
            if (firstList) {
                return firstList;
            }
        } catch (fallbackError) {
            logger.error('Wishlist: fallback getCustomerProductLists also failed', { customerId, fallbackError });
        }
        throw error;
    }
}

/**
 * Loader-side data shape for the wishlist page. Streamed via React Router's
 * Suspense pattern: `wishlist`/`items` are awaited; `productsByProductId` is a
 * Promise so the route can render its skeleton while products resolve.
 */
export type WishlistPageData = {
    wishlist: CustomerProductList | null;
    items: CustomerProductListItem[];
    productsByProductId: Promise<Record<string, Product>>;
};

/**
 * Snapshot of a guest's wishlist captured pre-swap, used as input to `mergeWishlist`.
 * The auth-success route must read this BEFORE the SLAS token swap because SCAPI
 * authorizes by `URL customerId === token UUID` and the guest token is gone after
 * the swap.
 */
export type GuestWishlistSnapshot = {
    guestCustomerId: string;
    guestListId: string;
    items: CustomerProductListItem[];
};

/** Outcome of `mergeWishlist`. `failed` includes per-item create errors and a non-204 delete. */
export type WishlistMergeResult = {
    merged: number;
    skipped: number;
    failed: number;
    mergedProductIds: string[];
    skippedProductIds: string[];
    failedProductIds: string[];
};

/**
 * Read the guest wishlist items so they can be merged into the registered customer's
 * wishlist after sign-in. Must be called BEFORE the SLAS token swap — once the
 * session holds the registered token, SCAPI will reject reads against the guest
 * customerId.
 *
 * Returns `null` if the session has no usable shopper token, the customer is already
 * registered, the guest has no wishlist, or the read fails. Failures are logged and
 * swallowed: a missing snapshot must not block sign-in.
 */
export async function captureGuestWishlistSnapshot(
    context: LoaderFunctionArgs['context']
): Promise<GuestWishlistSnapshot | null> {
    const logger = getLogger(context);
    const session = getAuth(context);

    if (!hasUsableShopperSession(session) || session.userType !== 'guest') {
        return null;
    }

    const guestCustomerId = session.customerId;

    try {
        const { items, id: guestListId } = await getWishlist(context, guestCustomerId);
        if (!guestListId || items.length === 0) {
            return null;
        }
        return { guestCustomerId, guestListId, items };
    } catch (error) {
        logger.warn('Wishlist: captureGuestWishlistSnapshot failed, skipping merge', { error });
        return null;
    }
}

/**
 * Merge a captured guest wishlist into the now-registered customer's wishlist.
 * Must be called AFTER the SLAS token swap so the registered token authorizes
 * the writes against `registeredCustomerId`.
 *
 * Mirrors `mergeBasket`: failure does not throw. Partial counts come back in
 * the result and the caller decides whether to surface a toast. Per-item
 * 4xx/5xx are logged and counted as `failed` without aborting the rest.
 * Duplicates (same `productId` already on the registered list, or repeated
 * within the snapshot itself) are counted as `skipped`.
 *
 * Items are created in parallel chunks of CHUNK_SIZE so the redirect doesn't
 * scale linearly with wishlist size. The guest list is intentionally not
 * deleted: SCAPI rejects `deleteCustomerProductList` against the guest
 * customerId once the registered token is active (token UUID mismatch), so the
 * call only ever succeeded in non-production contexts. Orphan-list cleanup, if
 * needed, belongs on the SCAPI side.
 */
const MERGE_CHUNK_SIZE = 5;

export async function mergeWishlist(
    context: LoaderFunctionArgs['context'],
    snapshot: GuestWishlistSnapshot
): Promise<WishlistMergeResult> {
    const logger = getLogger(context);
    const session = getAuth(context);
    const result: WishlistMergeResult = {
        merged: 0,
        skipped: 0,
        failed: 0,
        mergedProductIds: [],
        skippedProductIds: [],
        failedProductIds: [],
    };

    if (!hasUsableShopperSession(session) || session.userType !== 'registered') {
        logger.warn('Wishlist: mergeWishlist called without a registered session, skipping', {
            userType: session?.userType,
        });
        return result;
    }

    const registeredCustomerId = session.customerId;
    if (!registeredCustomerId || registeredCustomerId === snapshot.guestCustomerId) {
        return result;
    }

    if (snapshot.items.length === 0) {
        return result;
    }

    const clients = createApiClients(context);

    let registeredList: CustomerProductList;
    try {
        registeredList = await getOrCreateWishlist(context, registeredCustomerId);
    } catch (error) {
        logger.error('Wishlist: mergeWishlist could not get or create registered list', { error });
        result.failed = snapshot.items.length;
        result.failedProductIds = snapshot.items.map((item) => item.productId).filter(Boolean) as string[];
        return result;
    }

    const registeredListId = registeredList.id;
    if (!registeredListId) {
        logger.error('Wishlist: mergeWishlist registered list has no listId');
        result.failed = snapshot.items.length;
        result.failedProductIds = snapshot.items.map((item) => item.productId).filter(Boolean) as string[];
        return result;
    }

    const existingProductIds = new Set(
        (registeredList.customerProductListItems ?? [])
            .map((item) => item.productId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    // Pre-filter once so the parallel chunks below only contain items we still need
    // to create. Within-snapshot duplicates are tallied here too (the previous
    // sequential loop relied on existingProductIds.add to dedup as it went).
    const seen = new Set<string>();
    const toMerge: GuestWishlistSnapshot['items'] = [];
    for (const item of snapshot.items) {
        const productId = item.productId;
        if (!productId) {
            result.failed += 1;
            // Don't add empty string to array - no productId to track
            continue;
        }
        if (existingProductIds.has(productId) || seen.has(productId)) {
            result.skipped += 1;
            result.skippedProductIds.push(productId);
            continue;
        }
        seen.add(productId);
        toMerge.push(item);
    }

    for (let i = 0; i < toMerge.length; i += MERGE_CHUNK_SIZE) {
        const chunk = toMerge.slice(i, i + MERGE_CHUNK_SIZE);
        const settled = await Promise.allSettled(
            chunk.map((item) =>
                clients.shopperCustomers.createCustomerProductListItem({
                    params: { path: { customerId: registeredCustomerId, listId: registeredListId } },
                    body: {
                        productId: item.productId as string,
                        quantity: item.quantity ?? 1,
                        type: 'product',
                        public: false,
                        priority: 1,
                    },
                })
            )
        );
        for (let j = 0; j < settled.length; j += 1) {
            const outcome = settled[j];
            const productId = chunk[j].productId as string;
            if (outcome.status === 'fulfilled') {
                result.merged += 1;
                result.mergedProductIds.push(productId);
            } else {
                logger.warn('Wishlist: mergeWishlist failed to create item, skipping', {
                    productId,
                    error: outcome.reason,
                });
                result.failed += 1;
                result.failedProductIds.push(productId);
            }
        }
    }

    logger.info('Wishlist: mergeWishlist completed', {
        merged: result.merged,
        skipped: result.skipped,
        failed: result.failed,
    });

    return result;
}

/**
 * Prepare redirect with wishlist merge result. Sets a short-lived cookie containing
 * the merge result for client-side analytics and toast display.
 *
 * Returns URL with flag for backward compatibility (toast component checks URL),
 * and Set-Cookie header containing the full merge result (counts + product ID arrays).
 *
 * The cookie is only set if tracking consent has been granted (checked via getAuth).
 * If consent is not granted, only the URL flag is returned (for toast display).
 *
 * @param context - Router context for cookie generation
 * @param redirectTarget - Target URL for redirect
 * @param result - Wishlist merge result
 * @returns Object with url (with flag) and setCookie header
 */
export function appendWishlistMergeFlag(
    context: LoaderFunctionArgs['context'],
    redirectTarget: string,
    result: WishlistMergeResult
): { url: string; setCookie: string } {
    if (result.merged === 0 && result.failed === 0) {
        return { url: redirectTarget, setCookie: '' };
    }

    // Add flag to URL for toast component detection
    const flag = result.failed > 0 ? 'partial' : 'success';
    const separator = redirectTarget.includes('?') ? '&' : '?';
    const url = `${redirectTarget}${separator}wishlistMerge=${flag}`;

    // Store full result (with productIds) in cookie for analytics, but only if tracking consent granted
    // The cookie contains productIds which should respect consent boundaries even though
    // the analytics emission itself is also gated client-side by useAnalytics
    let setCookie = '';
    try {
        const auth = getAuth(context);
        // Only set cookie if tracking consent has been granted (Accepted = '0')
        if (auth.trackingConsent === TrackingConsent.Accepted) {
            setCookie = setWishlistMergeCookie(context, result);
        }
    } catch {
        // If getAuth fails (e.g., middleware not initialized), don't set cookie
    }

    return { url, setCookie };
}

/**
 * Shared loader-side helper that powers both the registered (`/account/wishlist`)
 * and guest (`/wishlist`) routes. Reads `customerId` from the session and pulls
 * the wishlist + product details. Returns an empty payload when the session has
 * no usable token, when SCAPI says the wishlist is empty, or when the call fails
 * with 401/403 (treated as "session no longer authorized for this customer").
 * Other errors propagate so the route's error boundary can surface them.
 */
export async function loadWishlistPageData(context: LoaderFunctionArgs['context']): Promise<WishlistPageData> {
    const logger = getLogger(context);
    const session = getAuth(context);

    if (!hasUsableShopperSession(session)) {
        return {
            wishlist: null,
            items: [],
            productsByProductId: Promise.resolve({}),
        };
    }

    const { customerId } = session;

    try {
        const { wishlist, items, id: listId } = await getWishlist(context, customerId);

        if (!wishlist || !listId) {
            return {
                wishlist: null,
                items: [],
                productsByProductId: Promise.resolve({}),
            };
        }

        return {
            wishlist,
            items,
            productsByProductId: fetchProductsForWishlist(context, items),
        };
    } catch (error) {
        if (error instanceof NormalizedApiError && (error.status === 401 || error.status === 403)) {
            logger.warn('Wishlist: auth error, returning empty wishlist', { status: error.status });
            return {
                wishlist: null,
                items: [],
                productsByProductId: Promise.resolve({}),
            };
        }

        logger.error('Wishlist: failed to load wishlist', { error });
        throw error;
    }
}
