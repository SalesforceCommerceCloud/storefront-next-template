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
import { useFetcher, useFetchers } from 'react-router';
import { resourceRoutes } from '@/route-paths';
import type { SaveResult } from './save-status';

/**
 * Submits a default-store candidate to the dedicated save action. This is deliberately separate from
 * the active-selection coordinator: it never changes the current store, selection cookie or basket.
 */
export function useSaveDefaultStore(control: 'current' | 'chooser') {
    // One key per control: a failed or finished save in one control must not surface in (or be retried by) the other.
    const fetcher = useFetcher<SaveResult>({ key: `save-default-store:${control}` });
    const pending = fetcher.state !== 'idle';
    // Either control's save blocks both: overlapping writes could finish out of order and overwrite the shopper's later choice.
    // `useFetchers` only lists fetchers that are not idle.
    const anyPending = useFetchers().some((other) => other.formAction === resourceRoutes.saveDefaultStore);
    const save = (storeId: string) =>
        void fetcher.submit({ storeId }, { method: 'post', action: resourceRoutes.saveDefaultStore });
    return { save, pending, saveBlocked: pending || anyPending, result: pending ? undefined : fetcher.data };
}
