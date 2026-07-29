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
import { type ReactElement, useEffect, useRef } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';

interface ChangeStoreButtonProps {
    /** Current store ID to compare against selected store */
    currentStoreId?: string;
}

/**
 * Client component that provides a button to open the Store Selector extension.
 *
 * When a user selects a store and closes the locator, this component triggers
 * page revalidation to refetch store details from the server.
 */
export default function ChangeStoreButton({ currentStoreId }: ChangeStoreButtonProps): ReactElement {
    const { t } = useTranslation('account');
    const revalidator = useRevalidator();
    const wasOpenRef = useRef(false);

    const openStoreLocator = useStoreLocator((s) => s.open);
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const isOpen = useStoreLocator((s) => s.isOpen);

    // Trigger revalidation when the store locator closes with a different store selected
    useEffect(() => {
        if (wasOpenRef.current && !isOpen && selectedStoreInfo?.id && selectedStoreInfo.id !== currentStoreId) {
            void revalidator.revalidate();
        }
        wasOpenRef.current = isOpen;
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedStoreInfo?.id, currentStoreId, isOpen]);

    return (
        <Button type="button" variant="outline" onClick={openStoreLocator}>
            {t('storePreferences.preferredStore.changeStore')}
        </Button>
    );
}
