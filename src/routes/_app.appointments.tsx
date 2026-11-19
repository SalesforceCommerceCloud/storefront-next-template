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
/** @sfdc-extension-file SFDC_EXT_APPOINTMENT_SCHEDULING */
import { type ReactElement, useCallback } from 'react';
import {
    redirect,
    useFetcher,
    useNavigation,
    type LoaderFunctionArgs,
    type ShouldRevalidateFunctionArgs,
} from 'react-router';
import { useTranslation } from 'react-i18next';
import { SeoMeta } from '@/components/seo-meta';
import { buildCanonicalUrl } from '@/utils/canonical-url';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { getAuth as getAuthServer } from '@/middlewares/auth.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { routes } from '@/route-paths';
import { UITarget } from '@/targets/ui-target';
import { getAppointmentProvider } from '@/lib/appointment-scheduler/get-provider.server';
import type { ServiceTerritoryOption } from '@/lib/appointment-scheduler';
import {
    AppointmentProvider,
    type ServiceEntry,
} from '@/extensions/appointment-scheduling/context/appointment-context';
import { getCurrentCustomer } from '@/lib/api/customer.server';

const BOOKING_WINDOW_DAYS = 90;

export type AppointmentsPageData = {
    pageUrl: string;
    territories: ServiceTerritoryOption[];
    workTypes?: ServiceEntry[];
    slots?: { startTime: string; endTime: string }[];
    advanceNoticeMinutes: number;
    schedulerEnabled: boolean;
    shopperName?: string;
    shopperEmail?: string;
};

export function shouldRevalidate({
    currentUrl,
    nextUrl,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
    const prev = currentUrl.searchParams;
    const next = nextUrl.searchParams;
    return (
        defaultShouldRevalidate ||
        prev.get('territory') !== next.get('territory') ||
        prev.get('workType') !== next.get('workType')
    );
}

export async function loader({ request, context }: LoaderFunctionArgs): Promise<AppointmentsPageData> {
    const config = getConfig(context);
    const logger = getLogger(context);
    const session = getAuthServer(context);
    if (session.userType !== 'registered' || !session.customerId) {
        logger.warn('Appointments: unauthenticated access, redirecting to login');
        const returnPath = new URL(request.url).pathname + new URL(request.url).search;
        const loginUrl = new URL(buildUrlFromContext(routes.login, context), request.url);
        loginUrl.searchParams.set('returnUrl', returnPath);
        throw redirect(loginUrl.toString());
    }

    const requestUrl = new URL(request.url);
    const territoryId = requestUrl.searchParams.get('territory') ?? undefined;
    const workTypeId = requestUrl.searchParams.get('workType') ?? undefined;
    const siteId = config.scheduler?.siteId;
    const schedulerEnabled = Boolean(config.features?.appointment?.enabled);

    const [territoriesResult, customer] = await Promise.all([
        (async () => {
            try {
                return await getAppointmentProvider(config, context).getServiceTerritories({ siteId });
            } catch {
                return { success: false as const, error: { code: 'UNAVAILABLE' as const } };
            }
        })(),
        getCurrentCustomer(context).catch(() => null),
    ]);

    const territories: ServiceTerritoryOption[] = territoriesResult.success ? territoriesResult.territories : [];
    let workTypes: ServiceEntry[] | undefined;
    let slots: { startTime: string; endTime: string }[] | undefined;

    if (territoryId && schedulerEnabled) {
        const workTypesResult = await (async () => {
            try {
                return await getAppointmentProvider(config, context).getWorkTypes({ territoryId });
            } catch {
                return { success: false as const, error: { code: 'UNAVAILABLE' as const } };
            }
        })();

        if (workTypesResult.success) {
            workTypes = workTypesResult.workTypes.map((wt) => ({
                id: wt.id,
                workType: wt.id,
                minutes: wt.durationMinutes,
                titleKey: null as null,
                title: wt.name,
                workTypeGroupId: wt.workTypeGroupId,
                externalId: wt.externalId,
            }));
        }

        if (workTypeId && workTypes) {
            const selectedWorkType = workTypesResult.success
                ? workTypesResult.workTypes.find((wt) => wt.id === workTypeId)
                : undefined;
            const workTypeGroupId = selectedWorkType?.workTypeGroupId;
            const now = new Date();
            const endWindow = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
            try {
                const availabilityResult = await getAppointmentProvider(config, context).getAvailability({
                    startTime: now.toISOString(),
                    endTime: endWindow.toISOString(),
                    territoryId,
                    workTypeId,
                    workTypeGroupId,
                });
                if (availabilityResult.success) {
                    slots = availabilityResult.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
                }
            } catch {
                // non-fatal — availability degrades gracefully to empty calendar
            }
        }
    }

    const shopperName = customer
        ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined
        : undefined;

    return {
        pageUrl: buildCanonicalUrl(requestUrl.origin, requestUrl.pathname, requestUrl.search),
        territories,
        workTypes,
        slots,
        advanceNoticeMinutes: config.features.appointment?.advanceNoticeMinutes ?? 120,
        schedulerEnabled,
        shopperName,
        shopperEmail: customer?.email ?? customer?.login ?? undefined,
    };
}

export default function AppointmentsPage({ loaderData }: { loaderData: AppointmentsPageData }): ReactElement {
    const { t } = useTranslation();
    const bookingFetcher = useFetcher<{ success: boolean; serviceAppointmentId?: string; error?: string }>();
    const navigation = useNavigation();

    const onBook = useCallback(
        (formData: FormData) => {
            void bookingFetcher.submit(formData, { method: 'POST', action: '/resource/appointment-book' });
        },
        [bookingFetcher]
    );

    return (
        <AppointmentProvider
            territories={loaderData.territories}
            workTypes={loaderData.workTypes}
            slots={loaderData.slots}
            advanceNoticeMinutes={loaderData.advanceNoticeMinutes}
            schedulerEnabled={loaderData.schedulerEnabled}
            isNavigating={navigation.state === 'loading'}
            onBook={onBook}
            bookingSubmitting={bookingFetcher.state !== 'idle'}
            bookingResult={bookingFetcher.data}
            shopperName={loaderData.shopperName}
            shopperEmail={loaderData.shopperEmail}>
            <div className="flex h-full min-h-0 w-full flex-1 flex-col">
                <SeoMeta
                    rawTitle
                    title={t('scheduler.pageTitle', 'Book an Appointment')}
                    description={t(
                        'scheduler.pageDescription',
                        'Book an in-store appointment with one of our experts.'
                    )}
                    openGraph={{ type: 'website', url: loaderData.pageUrl }}
                />
                <UITarget targetId="sfcc.scheduler.appointment-locator" />
            </div>
        </AppointmentProvider>
    );
}
