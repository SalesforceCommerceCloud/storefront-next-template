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
import type { Route } from './+types/resource.shipping-destination';
import { getLogger } from '@/lib/logger.server';
import { resolveRequestOrigin } from '@/lib/origin';
import { getInitialDeliveryDestination } from '@/extensions/shipping-delivery/lib/api/delivery-destination-cookie.server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isSameOrigin(request: Request): boolean {
    let serverOrigin: string;
    try {
        serverOrigin = new URL(resolveRequestOrigin(request) ?? request.url).origin;
    } catch {
        return false;
    }

    const requestUrlOrigin = new URL(request.url).origin;
    const origin = request.headers.get('origin');
    if (origin) return origin === serverOrigin || origin === requestUrlOrigin;

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
        logger.warn('ShippingDestination: cross-origin GET rejected');
        return Response.json({ success: false }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const destination = await getInitialDeliveryDestination(context, request);
    return Response.json({ success: true, destination }, { headers: NO_STORE_HEADERS });
}

export function action(): Response {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...NO_STORE_HEADERS } });
}
