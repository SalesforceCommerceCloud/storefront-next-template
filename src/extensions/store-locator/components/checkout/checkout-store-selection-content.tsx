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
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useStoreLocator, useStoreLocatorApi } from '@/extensions/store-locator/providers/store-locator';
import type { StoreEntryConfig } from '@/extensions/store-locator/lib/store-entry';
import { hasStoreEntrySelection } from '@/extensions/store-locator/lib/store-entry-selection';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

export default function CheckoutStoreSelectionContent({
    selection,
    entry,
}: {
    selection?: SelectedStoreInfo | null;
    entry: StoreEntryConfig;
}) {
    const { t } = useTranslation('extStoreLocator');
    const api = useStoreLocatorApi();
    const current = useStoreLocator((state) => state.selectedStoreInfo);
    const pending = useStoreLocator((state) => state.selectionPending);
    const isOpen = useStoreLocator((state) => state.isOpen);
    const committed = selection === undefined ? current : selection;
    const complete = hasStoreEntrySelection(committed, entry);
    const mode = complete && committed?.fulfillmentMode ? t(`storeLocator.entry.${committed.fulfillmentMode}`) : null;
    const name = committed?.name || committed?.id;
    return (
        <section
            aria-label={t('storeLocator.entry.checkout.label')}
            className="my-3 flex min-w-0 items-center justify-between gap-3 border border-border p-4"
            data-slot="checkout-store-selection">
            <div className="min-w-0 break-words">
                <p className="text-xs text-muted-foreground">
                    {t('storeLocator.entry.checkout.label')}
                    {mode && <> · {mode}</>}
                </p>
                <p className="text-sm font-semibold">{complete ? name : t('storeLocator.entry.chooseStore')}</p>
            </div>
            <Button
                type="button"
                variant="link"
                className="h-auto shrink-0 whitespace-normal px-0 text-end"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-disabled={pending || undefined}
                aria-label={
                    complete
                        ? t('storeLocator.entry.checkout.changeAriaLabel', { store: name, mode })
                        : t('storeLocator.entry.chooseStore')
                }
                onClick={(event) => {
                    if (api.getState().selectionPending) return;
                    api.setState({ returnFocusTarget: event.currentTarget });
                    if (complete) api.getState().openSelectedStore();
                    else api.getState().open();
                }}>
                {complete ? t('storeLocator.entry.checkout.change') : t('storeLocator.entry.chooseStore')}
            </Button>
        </section>
    );
}
