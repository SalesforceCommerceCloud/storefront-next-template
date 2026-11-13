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
import { useMemo, useId, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoreLocatorList } from '@/extensions/store-locator/hooks/use-store-locator-list';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/typography';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import StoreDetails from './details';
import ListSkeleton from './list-skeleton';

/**
 * StoreLocatorList
 *
 * Presents search results and selection UI.
 *
 * @returns ReactElement
 */
export default function StoreLocatorList(): ReactElement | null {
    const { t } = useTranslation('extStoreLocator');
    const instanceId = useId(); // Generate unique ID for this component instance
    const {
        mode,
        searchParams,
        config,
        selectedStoreInfo,
        setSelectedStoreInfo,
        geoError,
        hasSearched,
        hasError,
        isLoading,
        isSelecting,
        stores,
        storesPaginated,
        setPage,
    } = useStoreLocatorList();

    const statusMessage = useMemo(() => {
        if (!hasSearched) return null;
        if (mode === 'input' && searchParams) {
            const match = config.supportedCountries.find((c) => c.countryCode === searchParams.countryCode);
            const countryName = match?.countryName || searchParams.countryCode;
            const distanceText = `${config.radius} ${config.radiusUnit}`;
            const postal = searchParams.postalCode;
            return t('storeLocator.list.statusInput', {
                distanceText,
                postal,
                countryName,
            });
        }
        return t('storeLocator.list.statusLocation');
    }, [t, hasSearched, mode, searchParams, config.radius, config.radiusUnit, config.supportedCountries]);

    const renderMessage = (text: string, variant: 'info' | 'error' = 'info') => (
        <div className="my-6 text-center" role="status">
            <Typography variant="large" as="div" className={variant === 'error' ? 'text-destructive' : ''}>
                {text}
            </Typography>
            <Separator className="mt-4" />
        </div>
    );

    // Show permission error immediately if present
    if (geoError) {
        return renderMessage(t('storeLocator.list.geoError'), 'error');
    }

    // Show fetch error if present
    if (hasError) {
        return renderMessage(t('storeLocator.list.fetchError'), 'error');
    }

    if (!hasSearched) {
        return null;
    }

    if (isLoading) {
        return <ListSkeleton statusMessage={statusMessage} />;
    }

    if (!stores.length) {
        return renderMessage(t('storeLocator.list.noResults'));
    }

    return (
        <div className="mt-4">
            {statusMessage && (
                <div className="mb-4">
                    <Typography variant="large" as="div" className="flex justify-center items-center text-center">
                        {statusMessage}
                    </Typography>
                    <Separator className="mt-4" />
                </div>
            )}
            <RadioGroup
                aria-busy={isSelecting || undefined}
                disabled={isSelecting}
                className="store-locator-square-radio-group"
                name={`selectedStore-${instanceId}`}
                value={selectedStoreInfo?.id ?? ''}
                onValueChange={(value: string) => {
                    const selectedStore = storesPaginated.find((store) => store.id === value);
                    if (selectedStore) {
                        setSelectedStoreInfo(selectedStore);
                    }
                }}>
                <ul>
                    {storesPaginated.map((s, idx) => {
                        const radioId = `selectedStore-${instanceId}-${s.id}`;
                        return (
                            <li key={s.id} className="py-3">
                                <label className="flex items-start gap-3" htmlFor={radioId}>
                                    <RadioGroupItem
                                        id={radioId}
                                        value={s.id}
                                        className="store-locator-square-radio mt-1"
                                        aria-describedby={`store-info-${s.id}`}
                                        disabled={!s.inventoryId}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <StoreDetails
                                            store={s}
                                            showDistance={true}
                                            distanceUnit={config.radiusUnit}
                                            showStoreHours={true}
                                            showPhone={true}
                                            showEmail={true}
                                            id={`store-info-${s.id}`}
                                        />
                                    </div>
                                </label>
                                {idx < storesPaginated.length - 1 && <Separator className="my-3" />}
                            </li>
                        );
                    })}
                </ul>
            </RadioGroup>
            {stores.length > storesPaginated.length && (
                <div className="mt-3">
                    <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => setPage((p) => p + 1)}
                        id="load-more-button">
                        {t('storeLocator.list.loadMoreButton')}
                    </Button>
                </div>
            )}
        </div>
    );
}
