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
import { data, type LoaderFunctionArgs } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAppointmentProvider } from '@/lib/appointment-scheduler';
import { getAuth as getAuthServer } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import type { ServiceTerritoryOption } from '@/lib/appointment-scheduler/types';

/**
 * Result of the appointment-territories loader.
 *
 * @property success - Whether territories were fetched from the Scheduler
 * @property territories - Active service territories available for appointment booking
 */
export interface AppointmentTerritoriesResult {
    success: boolean;
    territories?: ServiceTerritoryOption[];
    error?: string;
}

/**
 * Fetches all active service territories (boutiques) for the appointment wizard's
 * store-selection step. Returns every territory where `StoreId__c` is populated so
 * the shopper can pick a boutique before choosing a time slot.
 *
 * Returns `success: false` when the feature is not configured or the provider doesn't
 * support territory fetching yet — the component falls back to its configured default.
 */
export async function loader({
    request,
    context,
}: LoaderFunctionArgs): Promise<ReturnType<typeof data<AppointmentTerritoriesResult>>> {
    const logger = getLogger(context);
    const session = getAuthServer(context);
    if (session.userType !== 'registered' || !session.customerId) {
        logger.warn('AppointmentTerritories: unauthorized access denied', {
            userType: session.userType,
            endpoint: 'appointment-territories',
            outcome: 'denied',
        });
        return data({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const config = getConfig(context);
    if (!config.features?.appointment?.enabled) {
        return data({ success: false, error: 'Appointment booking is not enabled' }, { status: 404 });
    }

    const url = new URL(request.url);
    // siteId scopes territories to a specific B2C site (SN_SiteId__c in Core).
    // Falls back to the configured scheduler siteId so omitting the param never leaks cross-site territories.
    const siteId = url.searchParams.get('siteId') ?? config.scheduler?.siteId ?? undefined;

    const provider = getAppointmentProvider(config, context);
    const result = await provider.getServiceTerritories({ siteId });

    if (!result.success) {
        logger.warn('AppointmentTerritories: fetch failed', { code: result.error.code });
        return data({ success: false, error: result.error.message ?? result.error.code });
    }

    return data({ success: true, territories: result.territories });
}
