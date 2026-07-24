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
import { type LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';

export type PageDesignerComponentParams = {
    componentId: string;
    mode?: string;
    pdToken?: string;
};

/**
 * Fetches a Page Designer component from SCAPI's Shopper Experience API.
 *
 * When the `mrtBasedPageDesignerResolution` feature flag is enabled, the SCAPI
 * request is transparently intercepted by the content-resolution middleware and
 * resolved from the MRT Data Store manifest instead. On a manifest miss, unpack
 * error, or if the flag is off, the request falls through to SCAPI unchanged.
 * Design/preview mode requests (containing `mode` or `pdToken`) always reach
 * SCAPI for live content.
 *
 * @param context - The loader function context from React Router.
 * @param parameters - Page Designer component parameters including the component ID,
 *   and optional preview mode/token for design-time support.
 * @returns The resolved Page Designer component data.
 */
export const fetchComponent = async (
    context: LoaderFunctionArgs['context'],
    parameters: PageDesignerComponentParams
): Promise<ShopperExperience.schemas['Component']> => {
    const { componentId = '', pdToken, mode } = parameters || {};
    const clients = createApiClients(context);

    const result = await clients.shopperExperience.getComponent({
        params: {
            path: { componentId },
            // SCAPI's generated `getComponent` query doesn't include `mode`/`pdToken`,
            // but the runtime accepts them for design/preview mode. Cast to the SCAPI
            // shape so TS doesn't reject the additional query keys.
            query: {
                ...(mode && { mode }),
                ...(pdToken && { pdToken }),
            } as Record<string, string>,
        },
    });

    return result.data;
};
