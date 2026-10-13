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
import { data, type ActionFunctionArgs } from 'react-router';
import { ApiError, type ShopperBasketsV2 } from '@/scapi';
import type { AppClients } from '@/scapi/custom-clients';
import type { Logger } from '@/lib/logger';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';
import type { BasketActionResponse } from '@/routes/types/action-responses';

type Basket = ShopperBasketsV2.schemas['Basket'];

/** Enum of all registered basket action operations. */
export enum BasketAction {
    CartItemRemove = 'CartItemRemove',
    CartItemUpdate = 'CartItemUpdate',
    CartItemAdd = 'CartItemAdd',
    CartSetAdd = 'CartSetAdd',
    CartBundleAdd = 'CartBundleAdd',
    CartBundleUpdate = 'CartBundleUpdate',
    PromoCodeAdd = 'PromoCodeAdd',
    PromoCodeRemove = 'PromoCodeRemove',
    BonusProductAdd = 'BonusProductAdd',
    SwatchOrder = 'SwatchOrder',
}

/** Shared params available to every basket action handler. */
interface BaseHandlerParams {
    /** The current basket ID (guaranteed non-null). */
    basketId: string;
    /** The full hydrated basket object (guaranteed non-null). */
    basket: Basket;
    /** React Router context for accessing middleware state. */
    context: ActionFunctionArgs['context'];
    /** Pre-configured Commerce API clients. */
    clients: AppClients;
    /** Request-scoped logger. */
    logger: Logger;
}

/**
 * Handler params for a registered {@link BasketAction}.
 * The factory parses FormData automatically and passes the typed result as `input`.
 */
export interface TypedBasketActionHandlerParams<TInput> extends BaseHandlerParams {
    /** Typed input data extracted from FormData by the action's registered parser. */
    input: TInput;
}

/** Return value from `data()` carrying a {@link BasketActionResponse} payload. */
type BasketActionData = ReturnType<typeof data<BasketActionResponse>>;

/**
 * A handler function return type.
 *
 * - `Basket` — The factory calls `updateBasketResource` and wraps it as
 *   `{ success: true, basket }` with status 200.
 * - `BasketActionData` — A `data()`-wrapped {@link BasketActionResponse} for
 *   validation errors or other custom responses mid-handler.
 * - Throwing — The factory catches the error and returns
 *   `{ success: false, error }`. A thrown SCAPI 4xx (e.g. an unknown coupon
 *   code → 400) passes its status through; 5xx and non-API errors become 500.
 */
type HandlerResult = Basket | BasketActionData;

/**
 * Create a React Router action function with standard basket boilerplate.
 *
 * Handles: logging, method validation, basket hydration, API client creation,
 * basket resource update on success, and error wrapping on failure.
 *
 * The `parse` callback extracts typed input from FormData. TypeScript infers
 * the handler's `input` type from the return type of `parse` — no manual type
 * annotations needed.
 *
 * **Response-shape enforcement.** The factory's return type is the canonical
 * contract for every basket action: each call site (e.g. `cart-item-add`,
 * `cart-item-remove`) inherits `Promise<BasketActionData>` from this factory,
 * and the handler signature here forces every code path to either return a
 * `Basket` (success-wrapped by the factory) or a `data()`-wrapped
 * {@link BasketActionResponse}. This is intentionally chosen over per-action
 * `Promise<BasketActionData>` annotations on every call site: the factory is
 * a single source of truth, strictly stronger than annotations because it
 * also constrains the handler body.
 *
 * @example
 * ```ts
 * export const action = createBasketAction(
 *     {
 *         method: 'POST',
 *         action: BasketAction.CartItemRemove,
 *         parse: (fd) => ({ itemId: fd.get('itemId') as string }),
 *     },
 *     async ({ input, basketId, clients }) => {
 *         // input.itemId is string — inferred from parse
 *         const { data: updatedBasket } = await clients.shopperBasketsV2.removeItemFromBasket({
 *             params: { path: { basketId, itemId: input.itemId } },
 *         });
 *         return updatedBasket;
 *     }
 * );
 * ```
 */
export function createBasketAction<TInput>(
    options: { method: 'POST' | 'PATCH'; action: BasketAction; parse: (formData: FormData) => TInput },
    handler: (params: TypedBasketActionHandlerParams<TInput>) => Promise<HandlerResult>
): (args: ActionFunctionArgs) => Promise<BasketActionData> {
    const { method, action, parse } = options;

    return async ({ request, context }: ActionFunctionArgs): Promise<BasketActionData> => {
        const logger = getLogger(context);
        logger.debug(`${action}: action starting`);

        if (request.method !== method) {
            return data(
                {
                    success: false,
                    error: createActionError({
                        code: ErrorCode.METHOD_NOT_ALLOWED,
                        message: `Expected ${method}, got ${request.method}`,
                    }),
                },
                { status: 405 }
            );
        }

        const basketResource = await getBasket(context);
        const basket = basketResource.current;

        if (!basket?.basketId) {
            logger.warn(`${action}: no basket found`);
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.NOT_FOUND, message: 'No basket found' }),
                },
                { status: 404 }
            );
        }

        const clients = createApiClients(context);
        const formData = await request.formData();

        let parsedData: TInput;
        try {
            parsedData = parse(formData);
        } catch (error) {
            logger.warn(`${action}: failed to parse form data`, { error });
            return data(
                {
                    success: false,
                    error: createActionError({ code: ErrorCode.INVALID_INPUT, message: 'Invalid form data' }),
                },
                { status: 400 }
            );
        }

        try {
            const result = await handler({
                basketId: basket.basketId,
                basket,
                context,
                clients,
                logger,
                input: parsedData,
            });

            // Pass through `data()`-wrapped payloads from the handler unchanged.
            if (
                result &&
                typeof result === 'object' &&
                'type' in result &&
                (result as { type: unknown }).type === 'DataWithResponseInit'
            ) {
                return result as BasketActionData;
            }

            const basketResult = result as Basket;
            updateBasketResource(context, basketResult);
            logger.info(`${action}: succeeded`);
            return data({ success: true, basket: basketResult });
        } catch (error) {
            logger.error(`${action}: failed`, { error });
            // A thrown SCAPI 4xx is a client/business outcome (e.g. an unknown
            // coupon code → 400), not a server fault — pass its status through so
            // it isn't misreported as a 500 in error-rate monitoring. Server-side
            // (5xx) and non-API errors still surface as 500.
            const status = error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.status : 500;
            return data({ success: false, error: createActionError({ error }) }, { status });
        }
    };
}
