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
import { getAppointmentProvider, type AppointmentSlot } from '@/lib/appointment-scheduler';
import { getAuth as getAuthServer } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import { isSameOrigin } from '@/lib/origin';

/**
 * Result of the appointment-availability loader.
 *
 * @property success - Whether availability was fetched
 * @property slots - Open slots in the requested window (empty array when none)
 * @property error - Error message when the fetch failed
 */
export interface AppointmentAvailabilityResult {
    success: boolean;
    slots?: AppointmentSlot[];
    error?: string;
    /** IANA timezone of the boutique territory (e.g. 'Europe/London'). */
    timezone?: string;
}

/**
 * Server-side loader for real boutique-appointment availability.
 *
 * Routes through the configured appointment provider (SCAPI or BFF) to fetch open slots.
 * The provider is selected by `config.features.appointment.provider`:
 * - `scapi` (default): calls the Appointment Commerce App (CAP) via SCAPI
 * - `bff`: storefront Node → Salesforce Core org directly (OAuth 2.0 client-credentials)
 *
 * `GET /resource/appointment-availability?startTime=<ISO 8601>&endTime=<ISO 8601>`
 *
 * Each boutique maps to its own ServiceTerritory via `ExternalId__c` — territory resolution is
 * per-boutique when `territoryId` is provided.
 *
 * @param args - Loader arguments (request carries the ISO window; context for provider selection)
 * @returns JSON response with the open slots or an error
 */
export async function loader({
    request,
    context,
}: LoaderFunctionArgs): Promise<ReturnType<typeof data<AppointmentAvailabilityResult>>> {
    const logger = getLogger(context);

    if (!isSameOrigin(request)) {
        logger.warn('AppointmentAvailability: cross-origin request denied', {
            origin: request.headers.get('origin'),
            endpoint: 'appointment-availability',
            outcome: 'denied',
        });
        return data({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const session = getAuthServer(context);
    if (!session.customerId) {
        return data({ success: false, error: 'An active shopper session is required' }, { status: 401 });
    }

    try {
        const config = getConfig(context);
        if (!config.features.appointment?.enabled) {
            return data({ success: false, error: 'Appointment booking is not enabled' }, { status: 404 });
        }

        const url = new URL(request.url);
        const startTime = url.searchParams.get('startTime');
        const endTime = url.searchParams.get('endTime');
        if (!startTime || !endTime) {
            return data({ success: false, error: 'startTime and endTime are required' }, { status: 400 });
        }
        const territoryId = url.searchParams.get('territoryId') ?? undefined;
        const workTypeId = url.searchParams.get('workTypeId') ?? undefined;
        // workTypeGroupId is carried from WorkTypeOption.workTypeGroupId in the wizard — no SOQL needed.
        const workTypeGroupId = url.searchParams.get('workTypeGroupId') ?? undefined;

        const provider = getAppointmentProvider(config, context);
        const result = await provider.getAvailability({ startTime, endTime, territoryId, workTypeId, workTypeGroupId });

        if (result.success) {
            const slots: AppointmentSlot[] = result.slots.map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime,
            }));
            return data({ success: true, slots, ...(result.timezone ? { timezone: result.timezone } : {}) });
        }

        // Provider error: map to route response.
        const status =
            result.error.status &&
            Number.isInteger(result.error.status) &&
            result.error.status >= 400 &&
            result.error.status <= 599
                ? result.error.status
                : 502;
        const message = result.error.message ?? 'Appointment availability is currently unavailable';
        return data({ success: false, error: message }, { status });
    } catch (error) {
        logger.error('AppointmentAvailability: fetch failed', { error });
        return data({ success: false, error: 'Appointment availability is currently unavailable' }, { status: 502 });
    }
}
