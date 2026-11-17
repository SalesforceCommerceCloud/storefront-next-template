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
import { lazy, Suspense, useState, type ReactElement } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeferredUnmount } from '@/hooks/use-deferred-unmount';
import type { ShopByStoreOption, ShopByStoreState } from '@/extensions/shop-by-store';

const ShopByStoreSheet = lazy(() => import('@/extensions/shop-by-store/components/shop-by-store-sheet'));

type ShopByStoreScaffoldProps = {
    initialSelectedStore?: ShopByStoreOption;
    initialSelectorState?: ShopByStoreState;
    initialSheetOpen?: boolean;
};

function ShopByStoreControl({
    selectedStore,
    onClick,
}: {
    selectedStore?: ShopByStoreOption;
    onClick?: () => void;
}): ReactElement {
    const label = selectedStore ? `Change store. Current store: ${selectedStore.name}` : 'Choose a store';

    return (
        <Button
            type="button"
            variant="ghost"
            className="h-auto gap-2 px-3 py-2 text-left hover:bg-accent"
            aria-label={label}
            onClick={onClick}>
            <MapPin className="size-5 shrink-0" aria-hidden="true" />
            <span className="max-w-40 truncate text-sm font-semibold">
                {selectedStore ? selectedStore.name : 'Choose a store'}
            </span>
        </Button>
    );
}

function EntryPrompt({ onChooseStore, onDismiss }: { onChooseStore: () => void; onDismiss: () => void }): ReactElement {
    return (
        <section aria-labelledby="shop-by-store-entry-title" className="border-y border-border bg-muted">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 id="shop-by-store-entry-title" className="text-sm font-semibold">
                        Choose your store
                    </h2>
                    <p className="text-sm text-muted-foreground">Browse with a store selected for this preview.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={onChooseStore}>
                        Get started
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                        Not now
                    </Button>
                </div>
            </div>
        </section>
    );
}

/**
 * Presentation-only fixture for designing a Shop by Store experience before it
 * is connected to a storefront target or a persistent store-selection service.
 */
export default function ShopByStoreScaffold({
    initialSelectedStore,
    initialSelectorState = 'results',
    initialSheetOpen = false,
}: ShopByStoreScaffoldProps): ReactElement {
    const [selectedStore, setSelectedStore] = useState(initialSelectedStore);
    const [selectorState, setSelectorState] = useState(initialSelectorState);
    const [sheetOpen, setSheetOpen] = useState(initialSheetOpen);
    const [entryPromptVisible, setEntryPromptVisible] = useState(!initialSelectedStore);
    const sheetMounted = useDeferredUnmount(sheetOpen);

    const selectStore = (store: ShopByStoreOption) => {
        setSelectedStore(store);
        setEntryPromptVisible(false);
        setSelectorState('results');
        setSheetOpen(false);
    };

    const control = <ShopByStoreControl selectedStore={selectedStore} />;

    return (
        <div className="bg-background text-foreground" data-slot="shop-by-store-scaffold">
            <div className="flex justify-end border-b border-border px-4 py-2">
                {sheetMounted ? (
                    <Suspense fallback={control}>
                        <ShopByStoreSheet
                            open={sheetOpen}
                            onOpenChange={setSheetOpen}
                            state={selectorState}
                            selectedStoreId={selectedStore?.id}
                            onSelect={selectStore}
                            onRetry={() => setSelectorState('results')}>
                            {control}
                        </ShopByStoreSheet>
                    </Suspense>
                ) : (
                    <ShopByStoreControl selectedStore={selectedStore} onClick={() => setSheetOpen(true)} />
                )}
            </div>
            {!selectedStore && entryPromptVisible ? (
                <EntryPrompt onChooseStore={() => setSheetOpen(true)} onDismiss={() => setEntryPromptVisible(false)} />
            ) : null}
        </div>
    );
}
