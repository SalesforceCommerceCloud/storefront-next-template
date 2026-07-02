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
import type { ShopperCustomers, ShopperOrders, ShopperProducts } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { resolveOrderStatus } from '@/lib/order/status';
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
                // Request OMS shipment-tracking enrichment. On a non-SOM org the
                // expand tokens are silently disregarded (OAS degrade contract),
                // so the ECOM path is unaffected when omsData is absent.
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
                    // Enrich each order with OMS status so the history badge reflects
                    // fresh SOM status. getCustomerOrders's expand is the scalar enum
                    // `'oms'` (NOT an array, and no `oms_shipments`), so this is
                    // status-only — per-shipment tracking can't appear on the list.
                    // On a non-SOM org the token is silently disregarded (OAS degrade).
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
