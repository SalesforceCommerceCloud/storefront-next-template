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
import type { PropsWithChildren, ReactElement } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { ShopByStoreOption, ShopByStoreState } from '@/extensions/shop-by-store';
import { SHOP_BY_STORE_FIXTURES } from '@/extensions/shop-by-store/components/shop-by-store-fixtures';

type ShopByStoreSelectorPanelProps = {
    state: ShopByStoreState;
    stores?: ShopByStoreOption[];
    selectedStoreId?: string;
    onSelect?: (store: ShopByStoreOption) => void;
    onRetry?: () => void;
};

type ShopByStoreSheetProps = PropsWithChildren<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    state: ShopByStoreState;
    selectedStoreId?: string;
    onSelect: (store: ShopByStoreOption) => void;
    onRetry: () => void;
}>;

function StateMessage({
    title,
    description,
    error = false,
    onRetry,
}: {
    title: string;
    description: string;
    error?: boolean;
    onRetry?: () => void;
}): ReactElement {
    return (
        <div
            className="space-y-3 rounded-ui border border-border bg-card p-4"
            role={error ? 'alert' : 'status'}
            aria-live="polite">
            <p className={error ? 'font-semibold text-destructive' : 'font-semibold'}>{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
            {onRetry ? (
                <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                    Try again
                </Button>
            ) : null}
        </div>
    );
}

export function ShopByStoreSelectorPanel({
    state,
    stores = SHOP_BY_STORE_FIXTURES,
    selectedStoreId,
    onSelect,
    onRetry,
}: ShopByStoreSelectorPanelProps): ReactElement {
    if (state === 'loading') {
        return (
            <section aria-labelledby="shop-by-store-selector-heading" className="space-y-4">
                <SelectorHeading />
                <div aria-live="polite" className="space-y-3" role="status">
                    <span className="sr-only">Loading stores</span>
                    {[0, 1, 2].map((index) => (
                        <div key={index} className="h-24 animate-pulse rounded-ui bg-muted" />
                    ))}
                </div>
            </section>
        );
    }

    const message =
        state === 'empty'
            ? {
                  title: 'No stores found',
                  description: 'Try another postal code to find a nearby store.',
              }
            : state === 'location-denied'
              ? {
                    title: 'Location sharing is off',
                    description: 'Enter a postal code instead to find a store near you.',
                }
              : state === 'search-error'
                ? {
                      title: 'We could not search for stores',
                      description: 'Check your connection and try again.',
                  }
                : state === 'selection-error'
                  ? {
                        title: 'We could not choose that store',
                        description: 'Your preview has not changed. Try again.',
                    }
                  : null;

    return (
        <section aria-labelledby="shop-by-store-selector-heading" className="space-y-4">
            <SelectorHeading />
            {message ? (
                <StateMessage
                    title={message.title}
                    description={message.description}
                    error={state === 'search-error' || state === 'selection-error'}
                    onRetry={onRetry}
                />
            ) : (
                <fieldset className="space-y-3">
                    <legend className="text-sm font-medium">Available stores</legend>
                    {stores.map((store) => {
                        const selected = store.id === selectedStoreId;
                        const inputId = `shop-by-store-${store.id}`;
                        const addressId = `${inputId}-address`;
                        const distanceId = `${inputId}-distance`;

                        return (
                            <div key={store.id} className="rounded-ui border border-border bg-card p-4">
                                <input
                                    id={inputId}
                                    type="radio"
                                    name="shop-by-store"
                                    value={store.id}
                                    checked={selected}
                                    aria-describedby={`${addressId} ${distanceId}`}
                                    onChange={() => onSelect?.(store)}
                                />
                                <label htmlFor={inputId} className="ml-3 cursor-pointer font-semibold">
                                    {store.name}
                                </label>
                                <p id={addressId} className="ml-7 mt-1 text-sm text-muted-foreground">
                                    {store.address}
                                </p>
                                <p id={distanceId} className="ml-7 mt-2 text-sm">
                                    {store.distance}
                                </p>
                            </div>
                        );
                    })}
                </fieldset>
            )}
        </section>
    );
}

function SelectorHeading(): ReactElement {
    return (
        <div>
            <h2 id="shop-by-store-selector-heading" className="text-2xl font-semibold">
                Choose your store
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Browse store options in this fixture-driven preview.</p>
        </div>
    );
}

export default function ShopByStoreSheet({
    children,
    open,
    onOpenChange,
    state,
    selectedStoreId,
    onSelect,
    onRetry,
}: ShopByStoreSheetProps): ReactElement {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetTrigger asChild>{children}</SheetTrigger>
            <SheetContent className="w-full p-0 sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>Choose your store</SheetTitle>
                    <SheetDescription>Preview a store-selection experience with local fixture data.</SheetDescription>
                </SheetHeader>
                <div className="overflow-y-auto px-4 pb-6">
                    <ShopByStoreSelectorPanel
                        state={state}
                        selectedStoreId={selectedStoreId}
                        onSelect={onSelect}
                        onRetry={onRetry}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
