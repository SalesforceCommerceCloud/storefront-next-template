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
import type { ShopperStores } from '@/scapi';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Typography } from '@/components/typography';
import { useStoreLocatorLayout } from '@/extensions/store-locator/context/layout';
import StoreAddress from './address';
import { cn } from '@/lib/utils';

interface StoreDetailsProps {
    /** Store object containing store information */
    store?: ShopperStores.schemas['Store'] & { c_customerServiceEmail?: string };
    /** Whether to show distance information */
    showDistance?: boolean;
    /** Distance unit from config (km/mi) */
    distanceUnit?: string;
    /** Whether to show store hours */
    showStoreHours?: boolean;
    /** Whether to show phone number */
    showPhone?: boolean;
    /** Whether to show email address */
    showEmail?: boolean;
    /** ID for accessibility */
    id?: string;
    /** Optional primary action slot rendered in the reserved area */
    primaryAction?: ReactNode;
    /** Use mobile layout regardless of screen size */
    mobileLayout?: boolean;
    /** Use compact address format with store name inline (for checkout/BOPIS) */
    compactAddress?: boolean;
}

/**
 * StoreDetails
 *
 * Displays store information including name, address, optional distance, phone and email.
 * Store hours are presented in an accordion to keep the card compact by default.
 *
 * @param store - Store object returned by Shopper Stores API
 * @param showDistance - Whether to show distance information
 * @param distanceUnit - Distance unit to display ("km" | "mi"), default "km"
 * @param showStoreHours - Whether to show store hours in an accordion
 * @param showPhone - Whether to show the phone number
 * @param showEmail - Whether to show the email address
 * @param id - Optional id for accessibility/anchoring
 * @param primaryAction - Optional slot rendered in the reserved area (top-right on mobile, third column on desktop)
 * @param forceMobile - Force mobile layout regardless of screen size (overrides context)
 * @param compactAddress - Use compact address format with store name inline (for checkout/BOPIS)
 * @returns ReactElement | null
 *
 * @example
 * <StoreDetails store={store} distanceUnit="mi" />
 *
 * @example
 * <StoreDetails
 *   store={store}
 *   primaryAction={<Button size="sm">Select Store</Button>}
 * />
 *
 * @example
 * <StoreDetails
 *   store={store}
 *   forceMobile={true}  // Always show vertical layout
 * />
 *
 * @example
 * <StoreDetails
 *   store={store}
 *   compactAddress={true}  // Shows "Store Name - 123 Main St" format
 * />
 */
export default function StoreDetails({
    store,
    showDistance = true,
    distanceUnit = 'km',
    showStoreHours = true,
    showPhone = true,
    showEmail = true,
    id,
    primaryAction,
    mobileLayout = false,
    compactAddress = false,
}: StoreDetailsProps) {
    const { t } = useTranslation('extStoreLocator');
    const { forceMobile: forceMobileContext } = useStoreLocatorLayout();
    // Use prop if provided, otherwise use context value
    const forceMobile = mobileLayout || forceMobileContext;

    if (!store) {
        return null;
    }

    // Determine what sections should be displayed inside the accordion
    const hasHours = Boolean(showStoreHours && store.storeHours);
    const hasPhone = Boolean(showPhone && store.phone);
    const hasEmail = Boolean(showEmail && store.c_customerServiceEmail);
    const showAccordion = hasPhone || hasEmail || hasHours;

    const containerGridClass = cn('grid grid-cols-2 gap-2', !forceMobile && 'md:grid-cols-[260px_1fr_auto]');

    return (
        <div id={id} className={containerGridClass}>
            {/* Store Name - only show separately if not using compact address */}
            {store.name && !compactAddress && (
                <div className="col-span-1">
                    <Typography variant="large" as="div">
                        {store.name}
                    </Typography>
                </div>
            )}

            {/* Reserved/Primary Action */}
            {primaryAction && (
                <div
                    className={cn(
                        'col-span-1 col-start-2 justify-self-end self-start',
                        !forceMobile && 'md:col-start-3 md:col-span-1'
                    )}>
                    {primaryAction}
                </div>
            )}

            {/* Address (mobile: full width; desktop: middle column) */}
            <div className={cn('col-span-2', !forceMobile && 'md:col-span-1 md:col-start-2')}>
                <Typography variant="muted" as="div">
                    <StoreAddress store={store} includeStoreName={compactAddress} />
                </Typography>
            </div>

            {/* Distance (mobile: full width; desktop: first column, second row) */}
            {showDistance && typeof store.distance === 'number' && (
                <div className={cn('col-span-2', !forceMobile && 'md:col-span-1 md:col-start-1 md:mt-2')}>
                    <Typography variant="muted" as="div" className="text-xs flex items-center gap-1">
                        <MapPin className="size-4" />
                        {t('storeLocator.details.distanceAway', {
                            distance: store.distance.toFixed(2),
                            unit: distanceUnit,
                        })}
                    </Typography>
                </div>
            )}

            {/* Store Hours + Phone/Email - Expandable Accordion (mobile: full width; desktop: columns 2-3) */}
            {showAccordion && (
                <div className={cn('col-span-2', !forceMobile && 'md:col-span-2 md:col-start-2')}>
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="store-hours" className="border-none">
                            <AccordionTrigger className="text-sm font-semibold text-primary hover:text-primary/80 py-2 px-0">
                                {t('storeLocator.details.storeDetailsTitle')}
                            </AccordionTrigger>
                            <AccordionContent className="px-0 pb-2">
                                <Typography variant="muted" as="div">
                                    {showPhone && store.phone && (
                                        <div>
                                            <span className="font-medium">{t('storeLocator.details.phoneLabel')}</span>{' '}
                                            <a
                                                href={`tel:${store.phone}`}
                                                className="underline-offset-2 hover:underline">
                                                {store.phone}
                                            </a>
                                        </div>
                                    )}
                                    {showEmail && store.c_customerServiceEmail && (
                                        <div>
                                            <span className="font-medium">{t('storeLocator.details.emailLabel')}</span>{' '}
                                            <a
                                                href={`mailto:${store.c_customerServiceEmail}`}
                                                className="underline-offset-2 hover:underline">
                                                {store.c_customerServiceEmail}
                                            </a>
                                        </div>
                                    )}
                                </Typography>
                                {hasHours && (
                                    <>
                                        <Typography variant="muted" as="div" className="mt-2 font-semibold">
                                            {t('storeLocator.details.storeHoursTitle')}
                                        </Typography>
                                        <Typography
                                            variant="muted"
                                            as="div"
                                            className="whitespace-pre-line"
                                            // oxlint-disable-next-line react/no-danger -- oxlint flags dangerouslySetInnerHTML on custom components; eslint-plugin-react only flags host elements
                                            dangerouslySetInnerHTML={{ __html: String(store.storeHours) }}
                                        />
                                    </>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            )}
        </div>
    );
}
