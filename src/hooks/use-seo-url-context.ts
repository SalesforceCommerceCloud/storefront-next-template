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
import { useMemo } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import type { SeoUrlContext } from '@/route-paths';

/** Bind URL generation to the active site's build-time SEO route settings. */
export function useSeoUrlContext(): SeoUrlContext {
    const config = useConfig();
    const { site } = useSite();

    return useMemo(
        () => ({ siteId: site.id, urlPrefix: config.url?.prefix, seoRoutes: config.url?.seoRoutes }),
        [config.url?.prefix, config.url?.seoRoutes, site.id]
    );
}
