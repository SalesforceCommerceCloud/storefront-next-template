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
import { useEffect, type ReactElement } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import StoreSelectionFeedback from '@/extensions/store-locator/providers/chooser-feedback';
import StoreLocatorForm from '@/extensions/store-locator/components/store-locator/form';
import StoreLocatorList from '@/extensions/store-locator/components/store-locator/list';

/**
 * StoreLocator
 *
 * Composition of store locator form and results list.
 *
 * @returns ReactElement
 */
export default function StoreLocator(): ReactElement {
    const entry = useConfig().features?.storeEntry;
    const { t } = useTranslation('extStoreLocator');
    const mode = useStoreLocator((s) => s.fulfillmentMode);
    const setMode = useStoreLocator((s) => s.setFulfillmentMode);
    const attempt = useStoreLocator((s) => s.selectionPending);
    useEffect(() => {
        if (entry?.enabled && entry.fulfillmentModes.length === 1 && mode !== entry.fulfillmentModes[0])
            setMode(entry.fulfillmentModes[0]);
    }, [entry, mode, setMode]);
    return (
        <section aria-labelledby="store-locator-heading" className="p-4">
            {entry?.enabled && entry.fulfillmentModes.length > 1 && (
                <fieldset className="mb-6" disabled={attempt}>
                    <legend className="mb-3 font-semibold">{t('storeLocator.entry.chooseMode')}</legend>
                    <RadioGroup
                        aria-label={t('storeLocator.entry.chooseMode')}
                        value={mode ?? ''}
                        onValueChange={(value) => {
                            if (value === 'pickup' || value === 'delivery') setMode(value);
                        }}>
                        {entry.fulfillmentModes.map((value) => (
                            <label key={value} className="flex gap-3 items-center py-2">
                                <RadioGroupItem value={value} aria-label={t(`storeLocator.entry.${value}`)} />
                                {t(`storeLocator.entry.${value}`)}
                            </label>
                        ))}
                    </RadioGroup>
                </fieldset>
            )}
            {(!entry?.enabled || mode) && (
                <>
                    <StoreLocatorForm />
                    <StoreSelectionFeedback />
                    <StoreLocatorList key={mode ?? 'locator'} />
                </>
            )}
        </section>
    );
}
