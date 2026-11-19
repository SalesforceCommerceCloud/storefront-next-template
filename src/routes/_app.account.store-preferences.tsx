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
import { type ReactElement } from 'react';
import type { Route } from './+types/_app.account.store-preferences';
import StorePreferences from '@/components/store-preferences';
import { SeoMeta } from '@/components/seo-meta';
import { useTranslation } from 'react-i18next';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import {
    resolveDefaultStore,
    resolveSelectedStore,
} from '@/extensions/store-locator/lib/resolve-selected-store.server';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

/**
 * Returns the active store (shared root/PDP resolution) and the saved account default separately.
 */
export function loader(args: Route.LoaderArgs) {
    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    const { context } = args;
    const { t } = getTranslation(context);
    // The saved default (profile) and the active store (reconciled selection) are independent.
    return Promise.all([resolveSelectedStore(context), resolveDefaultStore(context)]).then(([active, saved]) => ({
        activeStore: active.store,
        defaultStore: saved.store,
        defaultStoreId: saved.preferredStoreId,
        activeError: active.error ? t('storePreferences.preferredStore.error') : null,
        defaultError: saved.error ? t('storePreferences.preferredStore.error') : null,
    }));
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

    void args;
    return { activeStore: null, defaultStore: null, defaultStoreId: null, activeError: null, defaultError: null };
}

/**
 * Store Preferences route – renders at /account/store-preferences.
 */
export default function AccountStorePreferencesRoute(): ReactElement {
    const { t } = useTranslation('account');
    return (
        <>
            <SeoMeta title={t('meta.storePreferencesTitle', { defaultValue: 'Store Preferences' })} noIndex />
            <StorePreferences />
        </>
    );
}
