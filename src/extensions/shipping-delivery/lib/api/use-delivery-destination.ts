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
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { DELIVERY_DESTINATION_COOKIE, parseDeliveryDestinationCookie } from './delivery-destination-cookie';
import type { ShippingDestination } from '@/lib/shipping-estimate/types';

const subscribeCookie = () => () => undefined;
const getServerSnapshot = (): ShippingDestination | null => null;

/**
 * Restores the public destination cookie after hydration. The registered-address fallback is loaded separately so
 * guest calculator renders do not require a data router and shopper data never enters the PDP response.
 */
export function useDeliveryDestination(): ShippingDestination | null {
    const { site } = useSite();
    const cookieName = `${DELIVERY_DESTINATION_COOKIE}_${site.id}`;
    const cookieCache = useRef<{ header?: string; cookieName?: string; destination: ShippingDestination | null }>({
        destination: null,
    });
    const getCookieSnapshot = useCallback(() => {
        const header = document.cookie;
        const cache = cookieCache.current;
        if (cache.header !== header || cache.cookieName !== cookieName) {
            cookieCache.current = {
                header,
                cookieName,
                destination: parseDeliveryDestinationCookie(header, cookieName),
            };
        }
        return cookieCache.current.destination;
    }, [cookieName]);
    const cookieDestination = useSyncExternalStore(subscribeCookie, getCookieSnapshot, getServerSnapshot);
    return cookieDestination;
}
