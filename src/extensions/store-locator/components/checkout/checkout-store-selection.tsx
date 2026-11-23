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
import { lazy, Suspense } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { SelectedStoreBoundary } from '@/extensions/store-locator/providers/store-locator';

const CheckoutStoreSelectionContent = lazy(
    () => import('@/extensions/store-locator/components/checkout/checkout-store-selection-content')
);

/** Load the optional checkout entry UI only when enabled; all writes stay in the shared chooser. */
export default function CheckoutStoreSelection() {
    const entry = useConfig().features?.storeEntry;
    const { t } = useTranslation('extStoreLocator');
    if (!entry?.enabled) return null;
    const fallback = (
        <div className="min-h-24 border border-border p-4 text-sm" role="status">
            {t('storeLocator.entry.loadingSelection')}
        </div>
    );
    return (
        <SelectedStoreBoundary fallback={fallback}>
            {(selection) => (
                <Suspense fallback={fallback}>
                    <CheckoutStoreSelectionContent selection={selection} entry={entry} />
                </Suspense>
            )}
        </SelectedStoreBoundary>
    );
}
