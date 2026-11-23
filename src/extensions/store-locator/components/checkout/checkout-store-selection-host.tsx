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
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';

const StoreLocatorSheet = lazy(() => import('@/extensions/store-locator/components/header/store-locator-sheet'));

/** Bind the shared chooser to checkout without coupling its lazy import to the storefront header host. */
export default function CheckoutStoreSelectionHost() {
    const entry = useConfig().features?.storeEntry;
    return entry?.enabled ? <CheckoutStoreChooser /> : null;
}

function CheckoutStoreChooser() {
    const isOpen = useStoreLocator((state) => state.isOpen);
    const close = useStoreLocator((state) => state.close);
    const session = useStoreLocator((state) => state.session);
    if (!isOpen) return null;
    return (
        <Suspense fallback={null}>
            <StoreLocatorSheet key={session} open onOpenChange={(open) => !open && close(session)} />
        </Suspense>
    );
}
