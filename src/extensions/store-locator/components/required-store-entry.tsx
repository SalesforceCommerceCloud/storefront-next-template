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
import { lazy, Suspense, useEffect, useId, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    SelectedStoreBoundary,
    useStoreLocator,
    useStoreLocatorApi,
} from '@/extensions/store-locator/providers/store-locator';
import { hasStoreEntrySelection } from '@/extensions/store-locator/lib/store-entry-selection';
import type { StoreEntryConfig } from '@/extensions/store-locator/lib/store-entry';

const StoreLocatorSheet = lazy(() => import('@/extensions/store-locator/components/header/store-locator-sheet'));

export default function RequiredStoreEntry({
    children,
    entry,
    fallback,
}: PropsWithChildren<{ entry: StoreEntryConfig; fallback: ReactNode }>) {
    const location = useLocation();
    const selected = useStoreLocator((state) => state.selectedStoreInfo);
    return (
        <SelectedStoreBoundary fallback={fallback}>
            {(selection) =>
                hasStoreEntrySelection(selection === undefined ? selected : selection, entry) ? (
                    children
                ) : (
                    <SelectionRequired key={location.key} entry={entry} />
                )
            }
        </SelectedStoreBoundary>
    );
}

/** Closing cancels any pending add but leaves this view gated. Arrival itself never creates an add intent. */
function SelectionRequired({ entry }: { entry: StoreEntryConfig }) {
    const { t } = useTranslation('extStoreLocator');
    const api = useStoreLocatorApi();
    const button = useRef<HTMLButtonElement>(null);
    const headingId = useId();
    const descriptionId = useId();
    const [open, setOpen] = useState(false);
    // The server and initial hydration render the gate; mount the optional overlay after hydration.
    useEffect(() => setOpen(true), []);

    return (
        <section
            className="mx-auto flex min-h-80 max-w-xl flex-col items-start gap-4 px-4 py-12"
            aria-labelledby={headingId}
            aria-describedby={descriptionId}>
            <h1 id={headingId} className="text-2xl font-semibold">
                {t('storeLocator.entry.requiredTitle')}
            </h1>
            <p id={descriptionId}>{t('storeLocator.entry.requiredDescription')}</p>
            <Button ref={button} onClick={() => setOpen(true)}>
                {t('storeLocator.entry.chooseStore')}
            </Button>
            {open && (
                <Suspense fallback={<p role="status">{t('storeLocator.entry.loadingSelection')}</p>}>
                    <StoreLocatorSheet
                        open
                        onOpenChange={(nextOpen) => {
                            if (!nextOpen) api?.getState().close();
                            setOpen(nextOpen);
                        }}
                        onCloseAutoFocus={(event) => {
                            event.preventDefault();
                            if (hasStoreEntrySelection(api?.getState().selectedStoreInfo ?? null, entry)) {
                                document.getElementById('main-content')?.focus();
                            } else {
                                button.current?.focus();
                            }
                        }}
                    />
                </Suspense>
            )}
        </section>
    );
}
