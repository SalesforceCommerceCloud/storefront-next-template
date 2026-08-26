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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import type { ShouldRevalidateFunction } from 'react-router';
import type { Route } from './+types/resource.shipping-estimate';
import { ApiError } from '@/scapi';
import { getLogger } from '@/lib/logger.server';
import { resolveRequestOrigin } from '@/lib/origin';
import {
    getFallbackDeliveryDescription,
    getEstimateCountryCode,
    getShippingEstimates,
} from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';
import { createDeliveryDestinationCookie } from '@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server';
import type { ShippingEstimateResult } from '@/lib/shipping-estimate/types';
import { normalizeCountryCode } from '@/lib/shipping-estimate/country-code';
import { normalizePostalCode } from '@/lib/shipping-estimate/postal-code';
import { getPostalCodeFormat } from '@/lib/shipping-estimate/postal-code-formats';

export type { ShippingEstimateResult };

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const MAX_PRODUCT_ID_LENGTH = 100;

function isSameOrigin(request: Request): boolean {
    let serverOrigin: string;
    try {
        serverOrigin = new URL(resolveRequestOrigin(request) ?? request.url).origin;
    } catch {
        return false;
    }

    const requestUrlOrigin = new URL(request.url).origin;
    const origin = request.headers.get('origin');
    if (origin) {
        return origin === serverOrigin || origin === requestUrlOrigin;
    }

    const referer = request.headers.get('referer');
    if (!referer) return false;

    try {
        const refererOrigin = new URL(referer).origin;
        return refererOrigin === serverOrigin || refererOrigin === requestUrlOrigin;
    } catch {
        return false;
    }
}

export async function loader({ request, context }: Route.LoaderArgs): Promise<Response> {
    const logger = getLogger(context);
    if (!isSameOrigin(request)) {
        logger.warn('ShippingEstimate: cross-origin GET rejected');
        return Response.json({ success: false } satisfies ShippingEstimateResult, {
            status: 403,
            headers: NO_STORE_HEADERS,
        });
    }

    const url = new URL(request.url);
    const productId = (url.searchParams.get('productId') ?? '').trim();
    const requestedCountryCode = url.searchParams.get('countryCode');
    const normalizedCountryCode = normalizeCountryCode(requestedCountryCode);
    const countryCode = normalizedCountryCode ?? getEstimateCountryCode(context);
    const zipcode = normalizePostalCode(url.searchParams.get('zipcode'));
    const postalCodeFormat = getPostalCodeFormat(countryCode);
    const persistDestination = url.searchParams.get('persistDestination') === 'true';

    if (
        !productId ||
        productId.length > MAX_PRODUCT_ID_LENGTH ||
        !zipcode ||
        !postalCodeFormat.regex.test(zipcode) ||
        (requestedCountryCode !== null && !normalizedCountryCode)
    ) {
        return Response.json({ success: false } satisfies ShippingEstimateResult, {
            status: 400,
            headers: NO_STORE_HEADERS,
        });
    }

    try {
        const estimate = await getShippingEstimates(context, productId, zipcode, countryCode);
        if (!estimate) {
            return Response.json(
                { success: false, empty: true, productId, zipcode, countryCode } satisfies ShippingEstimateResult,
                {
                    headers: NO_STORE_HEADERS,
                }
            );
        }
        return Response.json(
            { success: true, productId, zipcode, countryCode, estimate } satisfies ShippingEstimateResult,
            {
                headers: {
                    ...NO_STORE_HEADERS,
                    ...(persistDestination
                        ? {
                              // Only a shopper-entered lookup becomes shared browser state. Profile-derived
                              // and prior-cookie automatic lookups must not expose one account's address to another.
                              'Set-Cookie': await createDeliveryDestinationCookie(context).serialize({
                                  postalCode: zipcode,
                                  countryCode,
                              }),
                          }
                        : {}),
                },
            }
        );
    } catch (error) {
        const upstreamStatus = error instanceof ApiError ? error.status : undefined;
        logger.error('ShippingEstimate: lookup failed', {
            failureType: upstreamStatus ? 'upstream' : 'unknown',
            upstreamStatus,
        });
        const fallbackDeliveryDescription =
            upstreamStatus === 403 || upstreamStatus === 500
                ? await getFallbackDeliveryDescription(context, productId)
                : undefined;
        const headers =
            fallbackDeliveryDescription && persistDestination
                ? {
                      ...NO_STORE_HEADERS,
                      'Set-Cookie': await createDeliveryDestinationCookie(context).serialize({
                          postalCode: zipcode,
                          countryCode,
                      }),
                  }
                : NO_STORE_HEADERS;
        return Response.json(
            {
                success: false,
                productId,
                zipcode,
                countryCode,
                ...(fallbackDeliveryDescription ? { fallbackDeliveryDescription } : {}),
            } satisfies ShippingEstimateResult,
            {
                status: upstreamStatus ?? 500,
                headers,
            }
        );
    }
}

export function action() {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ formAction, defaultShouldRevalidate }) => {
    return formAction ? false : defaultShouldRevalidate;
};
