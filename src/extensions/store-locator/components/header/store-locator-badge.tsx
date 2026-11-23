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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MapPin, Store } from 'lucide-react';
import { SelectedStoreBoundary, useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

const MAX_STORE_NAME_LENGTH = 24;

function truncateStoreName(storeName: string): string {
    return storeName.length > MAX_STORE_NAME_LENGTH
        ? `${storeName.slice(0, MAX_STORE_NAME_LENGTH).trimEnd()}...`
        : storeName;
}

export default function StoreLocatorBadge(): ReactElement {
    return (
        <SelectedStoreBoundary
            fallback={<span data-header-control className="inline-block h-9 w-32" aria-hidden="true" />}>
            {(selection) => <StoreLocatorBadgeContent selection={selection} />}
        </SelectedStoreBoundary>
    );
}

function StoreLocatorBadgeContent({ selection }: { selection?: SelectedStoreInfo | null }): ReactElement {
    const { t } = useTranslation('extStoreLocator');
    const entry = useConfig().features?.storeEntry;
    const currentSelection = useStoreLocator((state) => state.selectedStoreInfo);
    const selectedStoreInfo = selection === undefined ? currentSelection : selection;
    const isOpen = useStoreLocator((state) => state.isOpen);
    const openStoreLocator = useStoreLocator((state) => state.open);
    const openSelectedStore = useStoreLocator((state) => state.openSelectedStore);
    const distanceUnit = useStoreLocator((state) => state.config.radiusUnit);
    const selectedStoreName = selectedStoreInfo?.name ?? '';
    const selectedStoreDistance =
        selectedStoreInfo && typeof selectedStoreInfo.distance === 'number'
            ? `${selectedStoreInfo.distance.toFixed(2)} ${distanceUnit}`
            : undefined;
    const selectedStoreLabel = selectedStoreDistance
        ? `${selectedStoreName} · ${selectedStoreDistance}`
        : selectedStoreName || undefined;
    const visibleStoreLabel =
        selectedStoreInfo && selectedStoreName
            ? selectedStoreDistance
                ? `${truncateStoreName(selectedStoreName)} · ${selectedStoreDistance}`
                : truncateStoreName(selectedStoreName)
            : selectedStoreLabel;
    const modeLabel =
        entry?.enabled && selectedStoreInfo?.fulfillmentMode
            ? t(`storeLocator.entry.${selectedStoreInfo.fulfillmentMode}`)
            : undefined;
    const entryAriaLabel =
        modeLabel && selectedStoreInfo
            ? t('storeLocator.entry.current', { store: selectedStoreLabel ?? selectedStoreInfo.id, mode: modeLabel })
            : undefined;
    const storeAriaLabel = selectedStoreInfo
        ? selectedStoreInfo.postalCode
            ? t('storeLocator.trigger.selectedAriaLabel', {
                  storeName: visibleStoreLabel,
                  postalCode: selectedStoreInfo.postalCode,
              })
            : t('storeLocator.trigger.selectedWithoutPostalAriaLabel', { storeName: visibleStoreLabel })
        : t('storeLocator.trigger.chooseAriaLabel');
    const triggerClassName =
        'hover:bg-transparent hover:text-inherit! hover:opacity-50 transition-opacity max-lg:w-9 max-lg:px-0! lg:w-auto! lg:max-w-64 lg:px-3!';
    const openSelectedStoreLocator = selectedStoreInfo ? openSelectedStore : openStoreLocator;

    return (
        <Button
            variant="ghost"
            className={triggerClassName}
            onClick={() => openSelectedStoreLocator()}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-label={entryAriaLabel ?? storeAriaLabel}
            data-slot={selectedStoreInfo?.postalCode ? 'store-locator-selected-store' : 'button'}>
            <Store className="size-6" aria-hidden="true" />
            {modeLabel && (
                <span
                    className="shrink-0 whitespace-normal break-words text-start text-xs"
                    data-slot="store-locator-fulfillment">
                    {modeLabel}
                </span>
            )}
            <span data-header-label className="hidden max-w-40 truncate lg:inline">
                {selectedStoreInfo ? visibleStoreLabel : storeAriaLabel}
            </span>
            {selectedStoreInfo?.postalCode && (
                <>
                    <span
                        data-header-detail
                        className="mx-0.5 hidden h-4 w-px bg-current/30 lg:block"
                        aria-hidden="true"
                    />
                    <MapPin data-header-detail className="size-5" aria-hidden="true" />
                    <span data-header-label className="hidden max-w-40 shrink-0 truncate lg:inline">
                        {selectedStoreInfo.postalCode}
                    </span>
                </>
            )}
        </Button>
    );
}
