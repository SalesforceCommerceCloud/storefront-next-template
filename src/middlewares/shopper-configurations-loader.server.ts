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
import {
    createShopperConfigurationsLoaderMiddleware,
    type ShopperConfigurationsPreferences,
} from '@salesforce/storefront-next-runtime/data-store';
import { createApiClients } from '@/lib/api-clients.server';

/**
 * Custom fields the `app_storefrontnext_base` cartridge adds to the Shopper Configurations response. If you rename
 * them in the cartridge, rename them here too.
 */
type CartridgePreferenceFields = {
    c_customSitePreferences?: ShopperConfigurationsPreferences['sitePreferences'];
    c_customGlobalPreferences?: ShopperConfigurationsPreferences['globalPreferences'];
};

/**
 * Registers the Shopper Configurations loader that `getSitePreferencesLazy` and `getCustomGlobalPreferencesLazy`
 * use when the data store is unavailable, such as when the storefront is not hosted on Managed Runtime. The
 * `app_storefrontnext_base` cartridge adds the custom preferences to the response.
 *
 * Nothing is fetched unless a preference getter needs the fallback, and then at most once per request.
 *
 * Must run after `siteContextMiddleware`. Preference reads must happen after `authMiddlewareServer`, which supplies
 * the shopper token; route loaders and actions always do.
 */
export const shopperConfigurationsLoaderMiddleware = createShopperConfigurationsLoaderMiddleware(async (context) => {
    const { data } = await createApiClients(context).shopperConfigurations.getConfigurations();
    const fields = data as CartridgePreferenceFields | undefined;
    return {
        sitePreferences: fields?.c_customSitePreferences,
        globalPreferences: fields?.c_customGlobalPreferences,
    };
});
