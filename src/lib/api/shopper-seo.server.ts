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
import type { RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { ApiError, BUILT_IN_CLIENT_DEFAULTS, defaultQuerySerializer, type ShopperSeo } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getScapiBaseUrl } from '@/lib/utils';
import { performanceTimerContext, PERFORMANCE_MARKS } from '@/middlewares/performance-metrics';

const MAX_ENDPOINT_URL_LENGTH = 2047;
const OPERATION_PATH = '/organizations/{organizationId}/url-mapping';

/**
 * Fetch a Shopper SEO URL mapping for the active site and locale.
 *
 * @env {string} [SCAPI_PROXY_HOST] - Optional. Overrides the Commerce API host used to validate the exact request URL.
 */
export async function getUrlMapping(
    context: RouterContextProvider | Readonly<RouterContextProvider>,
    urlSegment: string
): Promise<ShopperSeo.schemas['UrlMapping'] | null> {
    const activeSite = context.get(siteContext);
    const siteId = activeSite?.site?.id;
    const locale = activeSite?.locale?.id;
    if (!siteId || !locale) {
        throw new Error('Site and locale context not initialized. Ensure site context middleware is configured.');
    }

    const { shortCode, organizationId } = getConfig(context).commerce.api;
    const query = {
        urlSegment,
        siteId,
        locale,
        personalized: 'none' as const,
    };
    const serializedQuery = defaultQuerySerializer({ siteId, locale, urlSegment, personalized: 'none' });
    const operationPath = OPERATION_PATH.replace('{organizationId}', organizationId);
    const endpointUrl = `${getScapiBaseUrl(shortCode)}${BUILT_IN_CLIENT_DEFAULTS.shopperSeo.basePath}${operationPath}?${serializedQuery}`;
    if (endpointUrl.length > MAX_ENDPOINT_URL_LENGTH) {
        return null;
    }

    const performanceTimer = context.get(performanceTimerContext);
    const performanceMark = PERFORMANCE_MARKS.apiCall.create({
        className: 'ShopperSeo',
        methodName: 'getUrlMapping',
    });
    const clients = createApiClients(context);
    performanceTimer?.mark(performanceMark, 'start');

    try {
        const { data } = await clients.shopperSeo.getUrlMapping({ params: { query } });
        return data;
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
            return null;
        }
        throw error;
    } finally {
        performanceTimer?.mark(performanceMark, 'end');
    }
}
