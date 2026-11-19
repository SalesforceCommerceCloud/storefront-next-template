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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useDeferredUnmount } from '@/hooks/use-deferred-unmount';
import type { ShopperStores } from '@/scapi';
import { SaveStatus, type SaveResult } from './save-status';
import { useSaveDefaultStore } from './use-save-default-store';

type Store = ShopperStores.schemas['Store'];

const ChooseDefaultStoreDialog = lazy(() => import('./choose-default-store-dialog'));

/** Saves the current (active) store as the account default; shown only when it differs from the default. */
export function SaveCurrentStoreAsDefault({ activeStore }: { activeStore: Store }): ReactElement {
    const { t } = useTranslation('account');
    const { save, pending, saveBlocked, result } = useSaveDefaultStore('current');
    return (
        <div className="flex flex-col gap-1" aria-busy={pending}>
            <Button type="button" variant="outline" disabled={saveBlocked} onClick={() => save(activeStore.id)}>
                {result && !result.success
                    ? t('storePreferences.defaultStore.retry')
                    : t('storePreferences.defaultStore.saveCurrent')}
            </Button>
            <SaveStatus pending={pending} result={result} />
        </div>
    );
}

/** Trigger for a lazily loaded dialog with its own store search; the picked candidate is saved as the default and never selected. */
export function ChooseDefaultStore(): ReactElement {
    const { t } = useTranslation('account');
    const [open, setOpen] = useState(false);
    const mounted = useDeferredUnmount(open);
    const triggerRef = useRef<HTMLButtonElement>(null);
    // The save fetcher's data outlives the dialog. A result already present when the
    // dialog opens is ignored: they neither close nor decorate it.
    const [baseline, setBaseline] = useState<SaveResult | undefined>(undefined);
    const { save, pending, saveBlocked, result } = useSaveDefaultStore('chooser');
    const fresh = result === baseline ? undefined : result;

    const restoreFocus = useRef(false);

    // Close once the profile readback confirms the save.
    useEffect(() => {
        if (open && fresh?.success) {
            restoreFocus.current = true;
            setOpen(false);
        }
    }, [open, fresh]);

    // Focus returns to the trigger once the dialog has fully unmounted after a save-driven close.
    useEffect(() => {
        if (!mounted && restoreFocus.current) {
            restoreFocus.current = false;
            triggerRef.current?.focus();
        }
    }, [mounted]);

    return (
        <>
            <Button
                ref={triggerRef}
                type="button"
                variant="outline"
                onClick={() => {
                    setBaseline(result);
                    setOpen(true);
                }}
                aria-haspopup="dialog">
                {t('storePreferences.defaultStore.choose')}
            </Button>
            {mounted && (
                <Suspense fallback={null}>
                    <ChooseDefaultStoreDialog
                        open={open}
                        onOpenChange={setOpen}
                        save={save}
                        pending={pending}
                        blocked={saveBlocked}
                        result={fresh}
                    />
                </Suspense>
            )}
        </>
    );
}
