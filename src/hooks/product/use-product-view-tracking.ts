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
import { useEffect, useRef } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useAnalytics } from '@/hooks/use-analytics';
import type { ShopperProducts } from '@/scapi';

/** Recover the current product impression after consent, without replaying tracked views. */
export function useProductViewTracking(product: ShopperProducts.schemas['Product']) {
    const analytics = useAnalytics();
    const location = useLocation();
    const navigation = useNavigation();
    const { site, locale } = useSite();
    const identity = JSON.stringify([location.pathname, site.id, locale.id, product.id]);
    const impression = useRef({ identity, tracked: false });
    const latest = useRef({ product, trackViewProduct: analytics.trackViewProduct });
    useEffect(() => {
        latest.current = { product, trackViewProduct: analytics.trackViewProduct };
    });

    useEffect(() => {
        if (impression.current.identity !== identity) impression.current = { identity, tracked: false };
        if (impression.current.tracked || navigation.state !== 'idle') return;
        const current = impression.current;
        const { product: currentProduct, trackViewProduct } = latest.current;
        const controller = new AbortController();
        // Defer handoff so Strict Mode's effect probe can cancel before dispatch.
        void Promise.resolve()
            .then(async () => {
                if (controller.signal.aborted) return;
                const handedOff = await trackViewProduct({ product: currentProduct }, controller.signal);
                if (handedOff) current.tracked = true;
            })
            // Analytics is best-effort; failures must not break the product page or schedule retries.
            .catch(() => undefined);
        return () => controller.abort();
    }, [identity, analytics.consentKey, location.key, location.search, location.hash, navigation.state]);
}
