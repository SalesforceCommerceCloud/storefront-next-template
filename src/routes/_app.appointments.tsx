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
import { redirect, useFetcher, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SeoMeta } from '@/components/seo-meta';
import { buildCanonicalUrl } from '@/utils/canonical-url';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { getAuth as getAuthServer } from '@/middlewares/auth.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { routes } from '@/route-paths';
import { UITarget } from '@/targets/ui-target';
import { getAppointmentProvider, type ServiceTerritoryOption } from '@/lib/appointment-scheduler';
import { AppointmentProvider } from '@/extensions/appointment-scheduling/context/appointment-context';

export type AppointmentsPageData = {
    pageUrl: string;
    territories: ServiceTerritoryOption[];
    advanceNoticeMinutes: number;
};

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
    const siteId = config.scheduler?.siteId;

    const territoriesResult = await (async () => {
        try {
            return await getAppointmentProvider(config, context).getServiceTerritories({ siteId });
        } catch {
            return { success: false as const, error: { code: 'UNAVAILABLE' as const } };
        }
    })();

    return {
        pageUrl: buildCanonicalUrl(requestUrl.origin, requestUrl.pathname, requestUrl.search),
        territories: territoriesResult.success ? territoriesResult.territories : [],
        advanceNoticeMinutes: config.features.appointment?.advanceNoticeMinutes ?? 120,
    };
}

export default function AppointmentsPage({ loaderData }: { loaderData: AppointmentsPageData }): ReactElement {
    const { t } = useTranslation();
    const bookingFetcher = useFetcher<{ success: boolean; serviceAppointmentId?: string; error?: string }>();

    const onBook = useCallback(
        (formData: FormData) => {
            void bookingFetcher.submit(formData, { method: 'POST', action: '/resource/appointment-book' });
        },
        [bookingFetcher]
    );

    return (
        <AppointmentProvider
            territories={loaderData.territories}
            advanceNoticeMinutes={loaderData.advanceNoticeMinutes}
            onBook={onBook}
            bookingSubmitting={bookingFetcher.state !== 'idle'}
            bookingResult={bookingFetcher.data}>
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
