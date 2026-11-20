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
/** Effects established by the selection owner, independent of HTTP or account-default persistence status. */
export type StoreSelectionEffects = {
    storeSelection: 'unchanged' | 'committed' | 'unknown' | 'reconciled';
    nativeContext: 'unchanged' | 'committed' | 'unknown' | 'reconciled';
};

/** Reconciliation establishes current truth; it does not imply that the recovery request performed a write. */
export function hasSettledStoreSelection(effects: StoreSelectionEffects | undefined): boolean {
    return (
        effects?.nativeContext !== 'unknown' &&
        (effects?.storeSelection === 'committed' || effects?.storeSelection === 'reconciled')
    );
}
