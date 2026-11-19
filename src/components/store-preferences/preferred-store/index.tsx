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
import { type ReactElement, useEffect } from 'react';
import { useLoaderData, useNavigation } from 'react-router';
import type { loader } from '@/routes/_app.account.store-preferences';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
import { Typography } from '@/components/typography';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import ChangeStoreButton from './change-store-button';
import { ChooseDefaultStore, SaveCurrentStoreAsDefault } from './save-default-store';
import StoreAddress from '@/extensions/store-locator/components/store-locator/address';
import type { ShopperStores } from '@/scapi';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
function StoreDetails({
    store,
    hoursTitle,
}: {
    store: ShopperStores.schemas['Store'];
    hoursTitle: string;
}): ReactElement {
    return (
        <Card className="bg-muted/40 rounded-ui border border-border gap-0 py-0">
            <CardContent className="px-4 py-3">
                <Typography variant="large" as="p">
                    {store.name}
                </Typography>
                <Typography variant="muted" as="div" className="mt-1">
                    <StoreAddress store={store} multiline={false} />
                </Typography>
                {store.storeHours && (
                    <Accordion type="single" collapsible className="mt-1">
                        <AccordionItem value={`store-hours-${store.id}`} className="border-none">
                            <AccordionTrigger className="py-1 text-sm text-primary font-normal underline cursor-pointer hover:underline">
                                {hoursTitle}
                            </AccordionTrigger>
                            <AccordionContent className="pb-0">
                                <Typography
                                    variant="muted"
                                    as="div"
                                    // Store hours HTML comes from SCAPI (Salesforce Commerce Cloud backend)
                                    // and is controlled by merchants via Business Manager. The content is
                                    // sanitized server-side by the Commerce Cloud platform before being
                                    // served through the API, making it safe to render.
                                    // oxlint-disable-next-line react/no-danger -- oxlint flags dangerouslySetInnerHTML on custom components; eslint-plugin-react only flags host elements
                                    dangerouslySetInnerHTML={{ __html: String(store.storeHours) }}
                                />
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

/**
 * Preferred Store for Pickup section.
 *
 * Displays the user's preferred store for BOPIS (Buy Online Pick Up In Store) orders.
 * Shows store details including name, address, and hours (if available).
 *
 * With the Store Selector extension, shows the saved default store and the current (active) store
 * separately. "Change store" only changes the current store; saving a default is a separate action
 * (current store or an isolated chooser) that never changes the active selection.
 */
export default function PreferredStore(): ReactElement {
    const { t } = useTranslation('account');
    const loaderData = useLoaderData<typeof loader>();
    const activeError = loaderData?.activeError ?? null;
    const defaultError = loaderData?.defaultError ?? null;
    // The active store (current shopping context) and the saved default are independent.
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    const activeStore = loaderData?.activeStore ?? null;
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    const defaultStore = loaderData?.defaultStore ?? null;
    let defaultStoreId: string | null = null;
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    defaultStoreId = loaderData?.defaultStoreId ?? null;
    let hasLocator = false;
    // @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
    hasLocator = true;
    const { addToast } = useToast();
    const navigation = useNavigation();

    // Check if page is revalidating (loading new data)
    const isRevalidating = navigation.state === 'loading';

    // Show error toast when store fetch fails
    const toastError = activeError ?? defaultError;
    useEffect(() => {
        if (toastError) addToast(toastError, 'error');
    }, [toastError, addToast]);

    return (
        <Card className="">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle as="h2" className="text-lg">
                        {t('storePreferences.preferredStore.heading')}
                    </CardTitle>
                    <CardDescription className="mt-1">
                        {t('storePreferences.preferredStore.description')}
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {isRevalidating ? (
                    <div className="flex flex-col gap-6">
                        {(hasLocator ? [0, 1] : [0]).map((section) => (
                            <Card key={section} className="bg-muted/40 rounded-ui border border-border gap-0 py-0">
                                <CardContent className="px-4 py-3">
                                    <Skeleton className="h-6 w-3/4" data-testid="skeleton" />
                                    <Skeleton className="h-4 w-full mt-2" data-testid="skeleton" />
                                    <Skeleton className="h-4 w-1/2 mt-1" data-testid="skeleton" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <>
                        {/* @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR */}
                        {hasLocator && (
                            <div className="flex flex-col gap-6">
                                <section aria-labelledby="default-store-heading" className="flex flex-col gap-3">
                                    <Typography variant="large" as="h3" id="default-store-heading">
                                        {t('storePreferences.defaultStore.heading')}
                                    </Typography>
                                    {defaultStore ? (
                                        <StoreDetails
                                            store={defaultStore}
                                            hoursTitle={t('storePreferences.preferredStore.storeHoursTitle')}
                                        />
                                    ) : (
                                        <Typography variant="muted">
                                            {defaultError ??
                                                (defaultStoreId
                                                    ? t('storePreferences.preferredStore.savedStoreUnavailable')
                                                    : t('storePreferences.defaultStore.none'))}
                                        </Typography>
                                    )}
                                    <div className="flex flex-wrap items-start gap-2">
                                        {activeStore && activeStore.id !== defaultStoreId && (
                                            <SaveCurrentStoreAsDefault activeStore={activeStore} />
                                        )}
                                        <ChooseDefaultStore />
                                    </div>
                                </section>
                                <section aria-labelledby="current-store-heading" className="flex flex-col gap-3">
                                    <Typography variant="large" as="h3" id="current-store-heading">
                                        {t('storePreferences.defaultStore.currentHeading')}
                                    </Typography>
                                    {activeStore ? (
                                        <StoreDetails
                                            store={activeStore}
                                            hoursTitle={t('storePreferences.preferredStore.storeHoursTitle')}
                                        />
                                    ) : (
                                        <Typography variant="muted">
                                            {activeError ?? t('storePreferences.preferredStore.noStoreSelected')}
                                        </Typography>
                                    )}
                                    <ChangeStoreButton />
                                </section>
                            </div>
                        )}
                        {/* @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR */}
                        {!hasLocator && (
                            <Typography variant="muted">
                                {activeError ?? t('storePreferences.preferredStore.noStoreSelected')}
                            </Typography>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
