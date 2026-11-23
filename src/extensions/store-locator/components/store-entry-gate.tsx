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
import { lazy, Suspense, type PropsWithChildren } from 'react';
import { useMatches } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { isStoreEntryRoute } from '@/extensions/store-locator/lib/store-entry-policy';
import type { StoreEntryConfig } from '@/extensions/store-locator/lib/store-entry';

const RequiredStoreEntry = lazy(() => import('@/extensions/store-locator/components/required-store-entry'));

/** Keep optional required-entry UI out of initial bundles when the merchant has not enabled it. */
export default function StoreEntryGate({ children }: PropsWithChildren) {
    const entry = useConfig().features?.storeEntry;
    if (!entry?.enabled || entry.policy !== 'required') return children;
    return <RequiredEntryRoute entry={entry}>{children}</RequiredEntryRoute>;
}

function RequiredEntryRoute({ children, entry }: PropsWithChildren<{ entry: StoreEntryConfig }>) {
    const matches = useMatches();
    const { t } = useTranslation('extStoreLocator');
    if (!isStoreEntryRoute(matches)) return children;
    const fallback = (
        <p role="status" className="min-h-80 px-4 py-12">
            {t('storeLocator.entry.loadingSelection')}
        </p>
    );
    return (
        <Suspense fallback={fallback}>
            <RequiredStoreEntry entry={entry} fallback={fallback}>
                {children}
            </RequiredStoreEntry>
        </Suspense>
    );
}
