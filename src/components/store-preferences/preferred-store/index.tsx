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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Typography } from '@/components/typography';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import ChangeStoreButton from './change-store-button';
import StoreAddress from '@/extensions/store-locator/components/store-locator/address';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

/**
 * Preferred Store for Pickup section.
 *
 * Displays the user's preferred store for BOPIS (Buy Online Pick Up In Store) orders.
 * Shows store details including name, address, and hours (if available).
 *
 * If the Store Selector extension is installed, provides a "Change store" button
 * that opens the store locator modal. If the extension is not installed, the button
 * is hidden to provide graceful degradation.
 *
 * Store selection is persisted via cookie and synced with the store locator extension.
 */
export default function PreferredStore(): ReactElement {
    const { t } = useTranslation('account');
    const loaderData = useLoaderData<typeof loader>();
    const { preferredStore, error } = loaderData || { preferredStore: null, error: null };
    const { addToast } = useToast();
    const navigation = useNavigation();

    // Check if page is revalidating (loading new data)
    const isRevalidating = navigation.state === 'loading';

    // Show error toast when store fetch fails
    useEffect(() => {
        if (error) {
            addToast(error, 'error');
        }
    }, [error, addToast]);

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
                {/* @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR */}
                <CardAction>
                    <ChangeStoreButton currentStoreId={preferredStore?.id} />
                </CardAction>
                {/* @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR */}
            </CardHeader>
            <CardContent>
                {isRevalidating ? (
                    <Card className="bg-muted/40 rounded-ui border border-border gap-0 py-0">
                        <CardContent className="px-4 py-3">
                            <Skeleton className="h-6 w-3/4" data-testid="skeleton" />
                            <Skeleton className="h-4 w-full mt-2" data-testid="skeleton" />
                            <Skeleton className="h-4 w-1/2 mt-1" data-testid="skeleton" />
                        </CardContent>
                    </Card>
                ) : preferredStore ? (
                    <Card className="bg-muted/40 rounded-ui border border-border gap-0 py-0">
                        <CardContent className="px-4 py-3">
                            <Typography variant="large" as="p">
                                {preferredStore.name}
                            </Typography>
                            {/* @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR */}
                            <Typography variant="muted" as="div" className="mt-1">
                                <StoreAddress store={preferredStore} multiline={false} />
                            </Typography>
                            {/* @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR */}
                            {preferredStore.storeHours && (
                                <Accordion type="single" collapsible className="mt-1">
                                    <AccordionItem value="store-hours" className="border-none">
                                        <AccordionTrigger className="py-1 text-sm text-primary font-normal underline cursor-pointer hover:underline">
                                            {t('storePreferences.preferredStore.storeHoursTitle')}
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
                                                dangerouslySetInnerHTML={{
                                                    __html: String(preferredStore.storeHours),
                                                }}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <Typography variant="muted">{t('storePreferences.preferredStore.noStoreSelected')}</Typography>
                )}
            </CardContent>
        </Card>
    );
}
