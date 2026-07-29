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
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';
import type { Route } from './+types/_app.account.orders';
import { fetchOmsMetaData, type OmsMetaDataResult } from '@/lib/api/order.server';

type OrdersLayoutLoaderData = {
    // Deferred OMS cancel/return reason codes (non-critical). OMS metadata is
    // org-level, not order-level, so it lives on this section-layout loader:
    // React Router skips a parent loader when only child params change, so the
    // fetch runs once on entry to /account/orders and is reused across
    // order-to-order navigation instead of re-firing per $orderNo. Consumers
    // read it via `useRouteLoaderData('routes/_app.account.orders')`.
    omsMetaData: Promise<OmsMetaDataResult>;
};

/** Section loader: fetches org-level OMS reason codes once, shared by all order routes. */
export function loader({ context }: Route.LoaderArgs): OrdersLayoutLoaderData {
    return {
        // Deferred: never awaited here. fetchOmsMetaData never rejects, so this
        // promise always resolves — a metadata failure can't break the section.
        omsMetaData: fetchOmsMetaData(context),
    };
}

/**
 * Layout for /account/orders. Renders child routes:
 * - _index: order list at /account/orders
 * - $orderNo: order details at /account/orders/:orderNo
 */
export default function AccountOrdersLayout(): ReactElement {
    return <Outlet />;
}
