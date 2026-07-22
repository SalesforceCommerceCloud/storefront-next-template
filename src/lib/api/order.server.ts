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
import { ApiError, type ShopperCustomers, type ShopperOrders, type ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { getLogger } from '@/lib/logger.server';
import { getOrderReturnStatus, resolveOrderStatus } from '@/lib/order/status';
import { isOrderCancelled } from '@/lib/order-management/cancel';
import type { Order } from '@/components/account/order-list';

export type OrderProductDataById = Record<string, ShopperProducts.schemas['Product'] | undefined>;

export type OrderWithProducts = {
    order: ShopperOrders.schemas['Order'];
    productsById: OrderProductDataById;
};

/**
 * Result of fetchOrderWithProducts: orderDataPromise (order + products) and orderPromise (order only).
 * Exposing orderPromise allows callers (e.g. order-confirmation) to start dependent work (e.g. BOPIS stores)
 * as soon as the order is available, in parallel with the products fetch.
 */
export type FetchOrderWithProductsResult = {
    orderDataPromise: Promise<OrderWithProducts>;
    orderPromise: Promise<ShopperOrders.schemas['Order']>;
};

/**
 * OMS reason-code metadata needed to render the cancel and return experiences,
 * normalized into a tri-state the order-detail page can consume without error
 * handling of its own.
 *
 * - `omsActive: false` means OMS is not enabled for this org (the API returned
 *   409). Callers hide the cancel/return entry points entirely.
 * - `omsActive: true` with populated arrays is the happy path.
 * - `omsActive: true` with empty arrays is a transient metadata failure (5xx /
 *   network / parse). Eligibility still comes from per-item `omsData`, so the
 *   entry points stay visible; the dialog degrades to a reason-load retry state.
 *
 * A single `GET /orders/oms-meta-data` response carries both `cancelReasonCodes`
 * and `returnReasonCodes`, so this one fetch serves both the cancel and return
 * features — do not add a second fetch.
 */
export type OmsMetaDataResult = {
    omsActive: boolean;
    cancelReasonCodes: ShopperOrders.schemas['OmsReasonCode'][];
    returnReasonCodes: ShopperOrders.schemas['OmsReasonCode'][];
};

/**
 * Fetches OMS cancel/return reason codes via `GET /orders/oms-meta-data`.
 *
 * Never throws — a failed metadata fetch must not break the order-detail page.
 * A 409 (OMS not active) is distinguished from a transient failure so callers
 * can hide vs. degrade (see {@link OmsMetaDataResult}). `siteId`/`organizationId`
 * are injected by `createApiClients`.
 *
 * @param context - React Router loader context (for API clients + logging)
 * @returns Tri-state metadata result; resolves even when the fetch fails.
 */
export async function fetchOmsMetaData(context: LoaderFunctionArgs['context']): Promise<OmsMetaDataResult> {
    const clients = createApiClients(context);
    try {
        // The `shopperOrders` client auto-injects `locale` into every operation's query
        // (it's needed by `getOrder`), but `GET /orders/oms-meta-data` only accepts `siteId`
        // and rejects an unexpected `locale` with 400. Override it back to `undefined` so the
        // query serializer drops it. Caller-provided query values take precedence over the
        // client's global defaults. The cast is required because the SDK query type
        // intentionally omits `locale` (the endpoint doesn't support it).
        // TODO: this per-call `locale: undefined` override is a call-site bandaid — every
        // future locale-incompatible SCAPI operation needs the same. The SDK client factory should
        // support per-operation locale opt-out so callers don't hand-roll (and cast) this each time.
        const { data } = await clients.shopperOrders.getOmsMetaData({
            params: { query: { locale: undefined } as { siteId?: string; locale?: string } },
        });
        return {
            omsActive: true,
            cancelReasonCodes: data.cancelReasonCodes ?? [],
            returnReasonCodes: data.returnReasonCodes ?? [],
        };
    } catch (error) {
        // 409 = OMS not active for this org → hide cancel/return entirely.
        if (error instanceof ApiError && error.status === 409) {
            return { omsActive: false, cancelReasonCodes: [], returnReasonCodes: [] };
        }
        // 5xx / network / parse: OMS is on but metadata is transiently unavailable.
        // Keep the entry points (eligibility comes from item omsData); the dialog
        // degrades to a reason-load retry state.
        getLogger(context).warn('fetchOmsMetaData: metadata fetch failed, degrading to empty reason codes', {
            error: error instanceof Error ? error.message : String(error),
        });
        return { omsActive: true, cancelReasonCodes: [], returnReasonCodes: [] };
    }
}

/**
 * Fetches an order by number and its product details (images, variations).
 * Uses the same promise chain as the original order-confirmation loader: order first,
 * then products and any dependent work (e.g. BOPIS stores) can run in parallel.
 *
 * @param context - React Router loader context (for API clients and currency)
 * @param orderNo - Order number from route params
 * @returns { orderDataPromise, orderPromise }. Both promises reject if the order is not found (e.g. 404).
 */
export function fetchOrderWithProducts(
    context: LoaderFunctionArgs['context'],
    orderNo: string
): FetchOrderWithProductsResult {
    const clients = createApiClients(context);
    const currency = (context.get(siteContext) as SiteContext).currency;

    const orderPromise = clients.shopperOrders
        .getOrder({
            params: {
                path: { orderNo },
                // `expand=oms,oms_shipments` loads Order Management enrichment (per-item
                // `omsData.quantityAvailableToReturn`, fulfillment/shipment data) onto the
                // order. Without it SCAPI omits `omsData` entirely and the return/cancel
                // entry points never render. On a non-SOM org the tokens are silently
                // disregarded (OAS degrade contract), so the ECOM path is unaffected.
                query: { expand: ['oms', 'oms_shipments'] },
            },
        })
        .then(({ data }) => data);

    const productsByIdPromise: Promise<OrderProductDataById> = orderPromise.then(async (order) => {
        const productIds = Array.from(
            new Set(
                (order.productItems ?? [])
                    .map((item) => item.productId)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)
            )
        );

        if (!productIds.length) {
            return {};
        }

        try {
            const { data } = await clients.shopperProducts.getProducts({
                params: {
                    query: {
                        ids: productIds,
                        expand: ['images', 'variations'],
                        currency,
                    },
                },
            });

            const productsById: OrderProductDataById = {};
            (data?.data ?? []).forEach((product) => {
                productsById[product.id] = product;
            });
            return productsById;
        } catch {
            // Return empty object on error - allows the page to render without product details
            return {};
        }
    });

    const orderDataPromise = Promise.all([orderPromise, productsByIdPromise]).then(([order, productsById]) => ({
        order,
        productsById,
    }));

    return { orderDataPromise, orderPromise };
}

/**
 * Transform SCAPI order to Order format for display in order list.
 * Maps the ShopperCustomers Order schema to the simplified format used by OrderList component.
 *
 * @param scapiOrder - Order from shopperCustomers.getCustomerOrders response
 * @param productsById - Optional product data keyed by productId (for image lookup)
 * @returns Order object for OrderList component
 */
export function transformOrderForList(
    scapiOrder: ShopperCustomers.schemas['Order'],
    productsById?: OrderProductDataById
): Order {
    const itemCount = scapiOrder.productItems?.length ?? 0;

    const productItems = scapiOrder.productItems?.map((item) => {
        const productId = item.productId ?? '';
        const product = productsById?.[productId];
        const group = findImageGroupBy(product?.imageGroups, { viewType: 'small' });
        const image = group?.images?.[0]; // Extract the first "small" image from a product's imageGroups.
        const imageAlt = image?.alt ?? product?.name ?? 'Product Image';

        const scapiLineName =
            'productName' in item && typeof (item as { productName?: unknown }).productName === 'string'
                ? (item as { productName: string }).productName
                : undefined;
        const productName = (product?.name ?? scapiLineName)?.trim() || undefined;

        return {
            productId,
            quantity: item.quantity ?? 1,
            imageUrl: image?.link,
            imageAlt,
            productName,
        };
    });

    // Prefer the ECOM status, falling back to the OMS status (shared resolver, so the
    // list and the Order Details badge can't disagree for the same order). Default to
    // `created` when neither is set.
    const status = resolveOrderStatus(scapiOrder) ?? 'created';

    return {
        orderNo: scapiOrder.orderNo ?? '',
        orderDate: scapiOrder.creationDate ?? '',
        status,
        // Derived order-level cancel/return status from item-level omsData.status
        // (present only when the list request expands 'oms'). undefined when not applicable.
        cancelStatus: isOrderCancelled(scapiOrder) ? ('cancelled' as const) : undefined,
        returnStatus: getOrderReturnStatus(scapiOrder),
        total: scapiOrder.orderTotal ?? 0,
        currency: scapiOrder.currency,
        itemCount,
        productItems,
        pickupLocation: undefined,
    };
}

export const DEFAULT_ORDERS_OFFSET = 0; // Used to retrieve the results based on a particular resource offset.
export const DEFAULT_ORDERS_LIMIT = 10; // Maximum records to retrieve per request, not to exceed 50. Defaults to 10.

/**
 * Paginated result from fetchCustomerOrders.
 */
export type CustomerOrdersResult = {
    orders: Order[];
    total: number;
    offset: number;
    limit: number;
};

/**
 * Fetches the customer's order history from SCAPI, then enriches each order
 * with product thumbnail images via shopperProducts.getProducts.
 *
 * Reference: https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-customers?meta=getCustomerOrders
 *
 * @param context - React Router loader context (for API clients and currency)
 * @param customerId - Customer ID from auth session
 * @param options - Optional query parameters (offset, limit)
 * @returns Promise resolving to { orders, total, offset, limit } for pagination
 */
export async function fetchCustomerOrders(
    context: LoaderFunctionArgs['context'],
    customerId: string,
    options?: {
        offset?: number;
        limit?: number;
    }
): Promise<CustomerOrdersResult> {
    const clients = createApiClients(context);
    const currency = (context.get(siteContext) as SiteContext).currency;
    const offset = options?.offset ?? DEFAULT_ORDERS_OFFSET;
    const limit = options?.limit ?? DEFAULT_ORDERS_LIMIT;

    try {
        const { data } = await clients.shopperCustomers.getCustomerOrders({
            params: {
                path: { customerId },
                query: {
                    offset,
                    limit,
                    // Loads item-level Order Management enrichment (productItems[*].omsData.status)
                    // so the list can derive an order-level return badge. getCustomerOrders's
                    // expand is the scalar enum `'oms'` (NOT an array, and no `oms_shipments`),
                    // so this is status-only — per-shipment tracking can't appear on the list.
                    // Non-OMS/non-SOM orgs silently ignore this (OAS degrade) — ECOM unaffected.
                    expand: 'oms',
                },
            },
        });

        const rawOrders = data?.data ?? [];
        const total = typeof data?.total === 'number' ? data.total : rawOrders.length;

        // Collect unique product IDs across all orders for a single batch fetch
        const productIds = Array.from(
            new Set(
                rawOrders
                    .flatMap((order) => order.productItems ?? [])
                    .map((item) => item.productId)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)
            )
        );

        const productsById: OrderProductDataById = {};

        if (productIds.length > 0) {
            try {
                const { data: productsData } = await clients.shopperProducts.getProducts({
                    params: {
                        query: {
                            ids: productIds,
                            expand: ['images'],
                            currency,
                        },
                    },
                });
                (productsData?.data ?? []).forEach((product) => {
                    productsById[product.id] = product;
                });
            } catch {
                // Non-fatal: render orders without images
            }
        }

        const orders = rawOrders.map((order) => transformOrderForList(order, productsById));

        return { orders, total, offset, limit };
    } catch {
        // Return empty result on error - allows the page to render without orders
        return { orders: [], total: 0, offset, limit };
    }
}
