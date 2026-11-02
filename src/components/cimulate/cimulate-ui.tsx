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

import { useEffect, useMemo } from 'react';
import { buildUrl, useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { useNavigate } from '@/hooks/use-navigate';
import { createProductUrl, resourceRoutes, type SeoUrlContext } from '@/route-paths';
import { validateCimulateConfig, type CimulateConfig } from './cimulate.utils';
import { CimulateWindow } from './cimulate-window';
import { attachAgentProductLinkRouting } from './cimulate-product-links';
import type { CimulateIdentitySnapshot } from './cimulate-conversation';
import type { ProductUrlMappingData } from '@/routes/resource.product-url-mapping';

interface CimulateUIProps {
    cimulateConfiguration?: CimulateConfig;
    identity?: CimulateIdentitySnapshot;
}

/**
 * Points the agent's product links at the Storefront Next product page: rewrites their address, and opens the
 * page through the router on a plain click. When the product id is not certain from the backend URL, Shopper SEO
 * resolves it with the site's own URL rules.
 * It lives here, inside the provider tree, because `CimulateWindow` is rendered without providers in its tests.
 */
function useAgentProductLinkRouting(): void {
    const appConfig = useConfig();
    const navigate = useNavigate();
    const { site } = useSite();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();

    const seoUrlContext = useMemo<SeoUrlContext>(
        () => ({ siteId: site.id, urlPrefix: appConfig.url?.prefix, seoRoutes: appConfig.url?.seoRoutes }),
        [site.id, appConfig.url?.prefix, appConfig.url?.seoRoutes]
    );

    useEffect(
        () =>
            attachAgentProductLinkRouting({
                navigateToProduct: (productId) => {
                    // `navigate` adds the site/locale prefix and returns a promise; this is fire-and-forget.
                    void navigate(createProductUrl({ productId }, seoUrlContext));
                },
                // The address `Link` would render, so hover, copy-link and new-tab links open the right page.
                getProductHref: (productId) =>
                    buildUrl({
                        to: createProductUrl({ productId }, seoUrlContext),
                        urlConfig: appConfig.url,
                        params: { siteId: siteRef, localeId: localeRef },
                    }),
                lookupProductId: async (urlSegment) => {
                    const response = await fetch(
                        `${resourceRoutes.productUrlMapping}?urlSegment=${encodeURIComponent(urlSegment)}`,
                        { headers: { Accept: 'application/json' } }
                    );
                    // A failed lookup rejects, so the link is looked up again the next time the widget draws it
                    if (!response.ok) throw new Error(`Product URL mapping failed: ${response.status}`);
                    const { productId } = (await response.json()) as ProductUrlMappingData;
                    return productId ?? undefined;
                },
            }),
        [navigate, seoUrlContext, appConfig.url, siteRef, localeRef]
    );
}

/**
 * Cimulate UI chunk – validates config and mounts the Commerce Client widget.
 * Loaded after first paint via requestIdleCallback so it stays off the critical path.
 */
export default function CimulateUI({ cimulateConfiguration, identity }: CimulateUIProps) {
    useAgentProductLinkRouting();

    if (!validateCimulateConfig(cimulateConfiguration)) {
        return null;
    }

    return (
        <div data-testid="cimulate-agent">
            <CimulateWindow config={cimulateConfiguration} identity={identity} />
        </div>
    );
}
