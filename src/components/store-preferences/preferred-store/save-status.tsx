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
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type SaveResult = { success: boolean; code?: string };

/**
 * Save progress and outcome. Two always-mounted live regions (polite status, assertive alert) so a
 * failure is announced reliably instead of relying on a role change on an existing element.
 * Success is only announced once the profile readback succeeded.
 */
export function SaveStatus({ pending, result }: { pending: boolean; result: SaveResult | undefined }): ReactElement {
    const { t } = useTranslation('account');
    let status = '';
    if (pending) status = t('storePreferences.defaultStore.saving');
    else if (result?.success) status = t('storePreferences.defaultStore.saved');
    const failure = !pending && result && !result.success ? t('storePreferences.defaultStore.saveFailed') : '';
    return (
        <>
            <p role="status" aria-live="polite" className="text-sm min-h-5">
                {status}
            </p>
            <p role="alert" className="text-sm text-destructive empty:hidden">
                {failure}
            </p>
        </>
    );
}
