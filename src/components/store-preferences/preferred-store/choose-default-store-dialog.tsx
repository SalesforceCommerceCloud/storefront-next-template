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
import { useRef, useState, type FormEvent, type ReactElement } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { resourceRoutes } from '@/route-paths';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import StoreAddress from '@/extensions/store-locator/components/store-locator/address';
import type { SearchStoresResult } from '@/extensions/store-locator/routes/resource.stores';
import { SaveStatus, type SaveResult } from './save-status';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    save: (storeId: string) => void;
    pending: boolean;
    /** True while any save is in flight, including the other control's. */
    blocked: boolean;
    result: SaveResult | undefined;
};

/**
 * Default-store chooser dialog with its own store search. Loaded lazily by `ChooseDefaultStore`
 * so the search UI, radio group and address formatting stay out of the account page's initial bundle.
 */
export default function ChooseDefaultStoreDialog({
    open,
    onOpenChange,
    save,
    pending,
    blocked,
    result,
}: Props): ReactElement {
    const { t } = useTranslation('account');
    const config = useStoreLocator((s) => s.config);
    const [countryCode, setCountryCode] = useState(config.supportedCountries[0]?.countryCode ?? '');
    const [postalCode, setPostalCode] = useState('');
    const [candidate, setCandidate] = useState('');
    const [postalMissing, setPostalMissing] = useState(false);
    const postalRef = useRef<HTMLInputElement>(null);
    const search = useFetcher<SearchStoresResult>();
    const stores = (search.data?.success ? (search.data.stores?.data ?? []) : []).filter((store) => store.inventoryId);

    const onSearch = (event: FormEvent) => {
        event.preventDefault();
        if (!countryCode) return;
        if (!postalCode.trim()) {
            setPostalMissing(true);
            postalRef.current?.focus();
            return;
        }
        const params = new URLSearchParams({
            mode: 'input',
            countryCode,
            postalCode: postalCode.trim(),
            maxDistance: String(config.radius),
            distanceUnit: config.radiusUnit,
            limit: String(config.limit),
        });
        setCandidate('');
        void search.load(`${resourceRoutes.stores}?${params.toString()}`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('storePreferences.defaultStore.dialogTitle')}</DialogTitle>
                    <DialogDescription>{t('storePreferences.defaultStore.dialogDescription')}</DialogDescription>
                </DialogHeader>
                <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="default-store-country">{t('storePreferences.defaultStore.country')}</Label>
                        <NativeSelect
                            id="default-store-country"
                            value={countryCode}
                            onChange={(event) => setCountryCode(event.target.value)}>
                            {config.supportedCountries.map((country) => (
                                <NativeSelectOption key={country.countryCode} value={country.countryCode}>
                                    {country.countryName}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <Label htmlFor="default-store-postal">{t('storePreferences.defaultStore.postalCode')}</Label>
                        <Input
                            id="default-store-postal"
                            ref={postalRef}
                            value={postalCode}
                            onChange={(event) => {
                                setPostalCode(event.target.value);
                                setPostalMissing(false);
                            }}
                            autoComplete="postal-code"
                            required
                            aria-invalid={postalMissing}
                            aria-describedby={postalMissing ? 'default-store-postal-error' : undefined}
                        />
                        {postalMissing && (
                            <p id="default-store-postal-error" role="alert" className="text-sm text-destructive">
                                {t('storePreferences.defaultStore.postalRequired')}
                            </p>
                        )}
                    </div>
                    <Button type="submit" disabled={search.state !== 'idle'}>
                        {t('storePreferences.defaultStore.search')}
                    </Button>
                </form>
                <div aria-live="polite" className="max-h-72 overflow-y-auto">
                    {search.state === 'idle' && search.data && !search.data.success && (
                        <p role="alert" className="text-sm">
                            {t('storePreferences.defaultStore.searchFailed')}
                        </p>
                    )}
                    {search.state === 'idle' && search.data?.success && stores.length === 0 && (
                        <p className="text-sm">{t('storePreferences.defaultStore.noResults')}</p>
                    )}
                    {stores.length > 0 && (
                        <RadioGroup
                            value={candidate}
                            onValueChange={setCandidate}
                            aria-label={t('storePreferences.defaultStore.results')}>
                            {stores.map((store) => (
                                <div key={store.id} className="flex items-start gap-2 py-2">
                                    <RadioGroupItem value={store.id} id={`default-store-${store.id}`} />
                                    <Label htmlFor={`default-store-${store.id}`} className="flex flex-col items-start">
                                        <span>{store.name}</span>
                                        <span className="text-muted-foreground font-normal">
                                            <StoreAddress store={store} multiline={false} />
                                        </span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    )}
                </div>
                <SaveStatus pending={pending} result={result} />
                <DialogFooter>
                    <Button type="button" disabled={!candidate || blocked} onClick={() => save(candidate)}>
                        {t('storePreferences.defaultStore.saveAsDefault')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
