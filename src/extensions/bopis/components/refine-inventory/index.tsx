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
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import LocalAvailability from '@/extensions/bopis/components/refine-inventory/local-availability';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Typography } from '@/components/typography';
import { Plus, Minus } from 'lucide-react';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';

interface RefineInventoryProps {
    isFilterSelected: (attributeId: string, value: string) => boolean;
    hasActiveFilter: (attributeId: string) => boolean;
    toggleFilter: (attributeId: string, value: string) => void;
}

/**
 * RefineInventory Component
 *
 * Displays a "Shop by Availability" filter that allows users to filter products
 * by availability at a selected store. Integrates with the store locator feature.
 *
 * When an `ilids` refine is already active, its value stays in sync with the globally
 * selected store no matter where the store locator was opened. Opening the locator from
 * this row (checkbox with no store, or store name) turns the refine on after the next
 * store selection; if the refine was already off and the locator was opened elsewhere,
 * changing the store does not enable the refine.
 *
 * @param isFilterSelected - Function to check if a filter is currently selected
 * @param hasActiveFilter - Whether any refine is active for an attribute (from parent `effectiveRefines`)
 * @param toggleFilter - Function to toggle a filter on/off
 * @returns ReactElement
 */
function LegacyRefineInventory({ isFilterSelected, hasActiveFilter, toggleFilter }: RefineInventoryProps) {
    const { t } = useTranslation('extBopis');

    // Get selected store info to display name and use inventoryId for filtering
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const openStoreLocator = useStoreLocator((state) => state.open);
    const isStoreLocatorOpen = useStoreLocator((state) => state.isOpen);
    const enableInventoryFilterOnNextStorePickRef = useRef(false);

    const inventoryId = selectedStoreInfo?.inventoryId || '';
    const inventoryIdRef = useRef<string>(inventoryId);
    // Use inventoryId directly for checked state, not the ref (ref is for tracking changes)
    const isChecked = isFilterSelected('ilids', inventoryId);
    const hadIlidsRefine = hasActiveFilter('ilids');

    useEffect(() => {
        if (!isStoreLocatorOpen) {
            enableInventoryFilterOnNextStorePickRef.current = false;
        }
    }, [isStoreLocatorOpen]);

    // Keep ilids= aligned with the globally selected store whenever the filter is already on (any locator entry).
    // If the locator was opened from this component's checkbox (no store) or store link, the next store pick
    // also turns the filter on even when it was off.
    useEffect(() => {
        const prevInv = inventoryIdRef.current;
        const storeChanged = prevInv !== inventoryId;

        if (!inventoryId) {
            inventoryIdRef.current = inventoryId;
            return;
        }

        if (enableInventoryFilterOnNextStorePickRef.current && storeChanged) {
            enableInventoryFilterOnNextStorePickRef.current = false;
            if (!isChecked) {
                toggleFilter('ilids', inventoryId);
            }
            inventoryIdRef.current = inventoryId;
            return;
        }

        if (storeChanged && hadIlidsRefine && !isChecked) {
            toggleFilter('ilids', inventoryId);
        }

        inventoryIdRef.current = inventoryId;
    }, [inventoryId, toggleFilter, hadIlidsRefine, isChecked]);

    const handleCheckboxChange = () => {
        if (inventoryId) {
            // Store is selected, toggle the filter
            toggleFilter('ilids', inventoryId);
        } else {
            // No store selected, open the store locator
            enableInventoryFilterOnNextStorePickRef.current = true;
            openStoreLocator();
        }
    };

    const handleStoreNameClick = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        enableInventoryFilterOnNextStorePickRef.current = true;
        openStoreLocator();
    };

    const storeLinkText = selectedStoreInfo?.name || t('storeInventoryFilter.selectStore');
    const [isOpen, setIsOpen] = useState(true); // Default open to match previous behavior

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="border border-border mb-4 rounded-ui"
            data-testid="sf-store-inventory-filter">
            <Typography variant="small" as="h3" className="leading-normal p-4 transition-colors hover:bg-muted/60">
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left px-1 py-1 -mx-1 cursor-pointer">
                    <Typography variant="small" as="span" className="font-medium">
                        {t('storeInventoryFilter.heading')}
                    </Typography>
                    {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
                </CollapsibleTrigger>
            </Typography>
            <CollapsibleContent className="px-4 pb-4">
                <div className="flex items-start space-x-2 p-2">
                    <Checkbox
                        id="inventory-filter"
                        checked={isChecked}
                        onCheckedChange={handleCheckboxChange}
                        aria-label={t('storeInventoryFilter.checkboxAriaLabel', { storeName: storeLinkText })}
                        data-testid="sf-store-inventory-filter-checkbox"
                        className="size-4"
                    />
                    <label htmlFor="inventory-filter" className="text-sm font-medium leading-none cursor-pointer">
                        {t('storeInventoryFilter.label', { storeName: ' ' })}
                        <span
                            className="underline cursor-pointer hover:opacity-70"
                            onClick={handleStoreNameClick}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleStoreNameClick(e);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={
                                selectedStoreInfo
                                    ? t('storeInventoryFilter.changeStore')
                                    : t('storeInventoryFilter.selectStore')
                            }>
                            {storeLinkText}
                        </span>
                    </label>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export default function RefineInventory(props: RefineInventoryProps) {
    const config = useConfig();
    return config.features.localInventory?.enabled ? <LocalAvailability /> : <LegacyRefineInventory {...props} />;
}
