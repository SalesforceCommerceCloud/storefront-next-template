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
import { useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/lib/logger';
import { useStoreLocator, useStoreLocatorApi } from '@/extensions/store-locator/providers/store-locator';
import { useStoreLocatorForm } from '@/extensions/store-locator/hooks/use-store-locator-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { NativeSelect } from '@/components/ui/native-select';
import { TextSeparator } from './text-separator';

const logger = createLogger();

/**
 * StoreLocatorForm
 *
 * Controlled form for searching stores either by country/postal code or by using
 * the shopper's current device location. Backed by the store locator state store.
 *
 * @returns ReactElement
 *
 * @example
 * <StoreLocatorForm />
 */
export default function StoreLocatorForm(): ReactElement {
    const { t } = useTranslation('extStoreLocator');
    const store = useStoreLocatorApi();
    const config = useStoreLocator((s) => s.config);
    const setDeviceCoordinates = useStoreLocator((s) => s.setDeviceCoordinates);
    const setGeoError = useStoreLocator((s) => s.setGeoError);
    const countryOptions = useStoreLocator((s) => s.config.supportedCountries);

    const { form, onSubmit } = useStoreLocatorForm();

    const onUseMyLocation = useCallback(() => {
        if (typeof window !== 'undefined' && window.navigator?.geolocation?.getCurrentPosition) {
            const generation = store.getState().generation;
            // Clear any previous permission error before attempting again
            setGeoError(false);
            window.navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (store.getState().generation !== generation) return;
                    setDeviceCoordinates({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                },
                (error) => {
                    if (store.getState().generation !== generation) return;
                    logger.warn('Geolocation error', { code: error.code, message: error.message });
                    setGeoError(true);
                },
                { timeout: config.geoTimeout }
            );
        }
    }, [store, setDeviceCoordinates, setGeoError, config.geoTimeout]);

    return (
        <Form {...form}>
            <form
                onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
                aria-label={t('storeLocator.form.searchFormAriaLabel')}>
                <div className="flex flex-col gap-3">
                    {countryOptions.length > 0 && (
                        <FormField
                            control={form.control}
                            name="countryCode"
                            render={({ field }) => (
                                <FormItem className="flex flex-col gap-1">
                                    <FormLabel className="sr-only">{t('storeLocator.form.countryLabel')}</FormLabel>
                                    <FormControl>
                                        <div className="w-full [&_[data-slot='native-select-wrapper']]:w-full">
                                            <NativeSelect
                                                aria-label={t('storeLocator.form.countryLabel')}
                                                value={field.value}
                                                onChange={(e) => field.onChange(e.target.value)}>
                                                <option value="" disabled>
                                                    {t('storeLocator.form.selectCountry')}
                                                </option>
                                                {countryOptions.map((c) => (
                                                    <option key={c.countryCode} value={c.countryCode}>
                                                        {c.countryName}
                                                    </option>
                                                ))}
                                            </NativeSelect>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}

                    <div className="flex gap-2 items-end">
                        <FormField
                            control={form.control}
                            name="postalCode"
                            render={({ field }) => (
                                <FormItem className="flex flex-1 flex-col gap-1">
                                    <FormLabel className="sr-only">{t('storeLocator.form.postalCodeLabel')}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            aria-label={t('storeLocator.form.postalCodeLabel')}
                                            placeholder={t('storeLocator.form.postalCodePlaceholder')}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" aria-label={t('storeLocator.form.findButton')} className="h-9 px-5">
                            {t('storeLocator.form.findButton')}
                        </Button>
                    </div>

                    <TextSeparator text={t('storeLocator.form.or')} />

                    <Button
                        type="button"
                        onClick={onUseMyLocation}
                        aria-label={t('storeLocator.form.useMyLocationButton')}
                        className="w-full">
                        {t('storeLocator.form.useMyLocationButton')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
