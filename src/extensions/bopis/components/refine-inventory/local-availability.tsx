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
import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectedStoreBoundary, useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { normalizeLocalInventorySearch } from '@/lib/product/local-inventory-search';

/** Normalize only after the existing identity-scoped selection read settles. */
function InventorySearchNormalization({ selection }: { selection?: SelectedStoreInfo | null }) {
    const current = useStoreLocator((state) => state.selectedStoreInfo);
    const store = selection === undefined ? current : selection;
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const next = normalizeLocalInventorySearch(params, store?.inventoryId, store?.id);
        if (next.toString() !== params.toString()) {
            void navigate(
                { pathname: location.pathname, search: next.toString() },
                { replace: true, preventScrollReset: true }
            );
        }
    }, [location.pathname, location.search, store?.id, store?.inventoryId, navigate]);
    return null;
}

export default function LocalAvailability() {
    const { t } = useTranslation('extBopis');
    const config = useConfig();
    const store = useStoreLocator((state) => state.selectedStoreInfo);
    const open = useStoreLocator((state) => state.open);
    const location = useLocation();
    const navigation = useNavigation();
    const navigate = useNavigate();
    const id = useId();
    const [error, setError] = useState(false);
    const search = navigation.location?.search ?? location.search;
    const showUnavailable = !new URLSearchParams(search).getAll('refine').includes('orderable_only=true');

    useEffect(() => {
        setError(false);
    }, [store?.id, store?.inventoryId]);

    const toggle = () => {
        if (showUnavailable && !config.features.localInventory?.nativeSearchVerified) {
            setError(true);
            return;
        }
        setError(false);
        const params = new URLSearchParams(search);
        const refines = params.getAll('refine').filter((value) => !value.startsWith('orderable_only='));
        params.delete('refine');
        refines.forEach((value) => params.append('refine', value));
        if (showUnavailable) params.append('refine', 'orderable_only=true');
        const next = normalizeLocalInventorySearch(params, store?.inventoryId, store?.id);
        next.delete('offset');
        next.delete('page');
        void navigate({ pathname: location.pathname, search: next.toString() }, { preventScrollReset: true });
    };

    return (
        <>
            {/* Only normalization waits for selection; keep the focusable control mounted. */}
            <SelectedStoreBoundary fallback={null} errorFallback={<></>}>
                {(selection) => <InventorySearchNormalization selection={selection} />}
            </SelectedStoreBoundary>
            <fieldset className="border border-border mb-4 p-4 rounded-ui" aria-busy={navigation.state !== 'idle'}>
                <legend className="text-sm font-medium">{t('localAvailability.heading')}</legend>
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={id}
                        checked={showUnavailable}
                        disabled={!store}
                        onCheckedChange={toggle}
                        aria-describedby={error ? `${id}-error` : undefined}
                    />
                    <label htmlFor={id} className="text-sm">
                        {t('localAvailability.showUnavailable')}
                    </label>
                </div>
                <button type="button" onClick={() => open()} className="mt-2 underline text-sm">
                    {store?.name || t('localAvailability.selectStore')}
                </button>
                {error && (
                    <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-foreground">
                        {t('localAvailability.filterUnavailable')}
                    </p>
                )}
            </fieldset>
        </>
    );
}
