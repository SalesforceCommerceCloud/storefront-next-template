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

import { type ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperSearch } from '@/scapi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import CategoryRefinements from './index';

interface FiltersDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    result: ShopperSearch.schemas['ProductSearchResult'];
    refine: string[];
    /** Filter row to open when the drawer opens (the bar button the shopper clicked); none = all collapsed. */
    focusFacetId?: string | null;
}

/**
 * Filters side drawer: slides in from the left over a dimmed page. A header with Close and the title, one +/-
 * row per filter (only one open at a time) and a "View Results" button that closes the drawer. Filters apply
 * as they are selected (URL driven), so "View Results" simply returns to the results.
 */
export default function FiltersDrawer({
    open,
    onOpenChange,
    result,
    refine,
    focusFacetId = null,
}: FiltersDrawerProps): ReactElement {
    const { t } = useTranslation('categoryRefinements');
    const [openId, setOpenId] = useState<string | null>(focusFacetId);
    // Every time the drawer opens, show the filter the shopper came from (or none for the plain Filters button).
    useEffect(() => {
        if (open) setOpenId(focusFacetId);
    }, [open, focusFacetId]);
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="left"
                data-testid="filters-drawer"
                className="w-full gap-0 p-0 sm:max-w-[440px] [&>button:last-child]:hidden">
                <div className="relative flex h-16 shrink-0 items-center justify-center border-b border-border">
                    <SheetClose asChild>
                        <button
                            type="button"
                            className="absolute left-5 cursor-pointer text-sm text-foreground hover:underline">
                            {t('closeFilters')}
                        </button>
                    </SheetClose>
                    <SheetTitle className="text-lg">{t('filtersButtonLabel')}</SheetTitle>
                    <SheetDescription className="sr-only">{t('filtersDrawerDescription')}</SheetDescription>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <CategoryRefinements
                        layout="accordion"
                        result={result}
                        refine={refine}
                        openId={openId}
                        onOpenIdChange={setOpenId}
                    />
                </div>

                <div className="shrink-0 border-t border-border p-4">
                    <Button className="h-12 w-full" onClick={() => onOpenChange(false)}>
                        {t('viewResults')}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
