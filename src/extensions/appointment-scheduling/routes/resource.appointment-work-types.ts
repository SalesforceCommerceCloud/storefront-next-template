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
import type { WorkTypeOption } from '@/lib/appointment-scheduler/types';

/**
 * Result of the appointment-work-types loader.
 *
 * @property success - Whether the work types were fetched from the Scheduler
 * @property workTypes - Available work types for the reason-for-visit step
 */
export interface AppointmentWorkTypesResult {
    success: boolean;
    workTypes?: WorkTypeOption[];
    error?: string;
    /** Echoed back so the component can verify the response belongs to the requested territory. */
    territoryId?: string;
}

/**
 * Fetches the available appointment work types (visit reasons) for the configured
 * Salesforce Scheduler WorkTypeGroup. The wizard uses these to populate the
 * "Why Are You Visiting" step dynamically, replacing the hardcoded SERVICES list.
 *
 * Returns `success: false` when the feature is not configured or the provider doesn't
 * support work-type fetching yet — the component falls back to its hardcoded list.
 */
export async function loader({
    request,
    context,
}: LoaderFunctionArgs): Promise<ReturnType<typeof data<AppointmentWorkTypesResult>>> {
    const logger = getLogger(context);
    const session = getAuthServer(context);
    if (!session.customerId) {
        logger.warn('AppointmentWorkTypes: unauthorized access denied', {
            userType: session.userType,
            endpoint: 'appointment-work-types',
            outcome: 'denied',
        });
        return data({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const config = getConfig(context);
    if (!config.features?.appointment?.enabled) {
        return data({ success: false, error: 'Appointment booking is not enabled' }, { status: 404 });
    }

    const url = new URL(request.url);
    const territoryId = url.searchParams.get('territoryId') ?? undefined;

    const provider = getAppointmentProvider(config, context);
    const result = await provider.getWorkTypes({ territoryId });

    if (!result.success) {
        logger.warn('AppointmentWorkTypes: fetch failed', { code: result.error.code });
        // Echo territoryId even on failure so the wizard can clear its loading state.
        return data({ success: false, error: result.error.message ?? result.error.code, territoryId });
    }

    return data({ success: true, workTypes: result.workTypes, territoryId });
}
