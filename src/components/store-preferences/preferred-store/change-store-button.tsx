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
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import {
    SelectionFeedback,
    useStoreSelection,
    useStoreSelectionFeedbackHost,
} from '@/extensions/store-locator/providers/selection';

/**
 * Client component that provides a button to open the Store Selector extension.
 *
 * Action-driven revalidation refreshes account details after persistence.
 */
export default function ChangeStoreButton(): ReactElement {
    const { t } = useTranslation('account');
    const { retry } = useStoreSelection();
    const openStoreLocator = useStoreLocator((s) => s.open);
    const isOpen = useStoreLocator((s) => s.isOpen);
    const pending = useStoreLocator((s) => s.selectionPending);
    const error = useStoreLocator((s) => s.selectionError);
    useStoreSelectionFeedbackHost();

    return (
        <div className="flex flex-wrap gap-2" aria-busy={pending}>
            <Button
                type="button"
                variant="outline"
                onClick={() => openStoreLocator()}
                disabled={pending}
                aria-haspopup="dialog"
                aria-expanded={isOpen}>
                {t('storePreferences.preferredStore.changeStore')}
            </Button>
            {!isOpen && (pending || error) && <SelectionFeedback retry={retry} />}
        </div>
    );
}
