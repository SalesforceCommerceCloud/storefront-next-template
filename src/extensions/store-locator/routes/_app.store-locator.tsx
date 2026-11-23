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
import { lazy, Suspense, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

// Keep the optional locator implementation out of the shared server route bundle.
const StoreLocator = lazy(() => import('@/extensions/store-locator/components/store-locator'));

/**
 * StoreLocatorPage
 *
 * Standalone route that renders the Store Locator experience.
 *
 * @returns ReactElement
 */
export default function StoreLocatorPage(): ReactElement {
    const { t } = useTranslation('common');
    return (
        <Suspense
            fallback={
                <p role="status" className="min-h-80 p-4">
                    {t('loading')}
                </p>
            }>
            <StoreLocator />
        </Suspense>
    );
}
