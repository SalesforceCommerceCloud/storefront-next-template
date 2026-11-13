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
import { data, type ActionFunctionArgs } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAppointmentProvider } from '@/lib/appointment-scheduler';
import { getAuth as getAuthServer } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';

/**
 * Result of the appointment-book action.
 *
 * @property success - Whether the ServiceAppointment was created
 * @property serviceAppointmentId - Core ServiceAppointment id on success
 * @property error - Error message when booking failed
 */
export interface BookAppointmentResult {
    success: boolean;
    serviceAppointmentId?: string;
    error?: string;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server-side action to book a boutique appointment against Salesforce Scheduler.
 *
 * Routes through the configured appointment provider (SCAPI or BFF) to create the ServiceAppointment.
 * The provider is selected by `config.features.appointment.provider`:
 * - `scapi` (default): calls the Appointment Commerce App (CAP) via SCAPI
 * - `bff`: storefront Node → Salesforce Core org directly (OAuth 2.0 client-credentials)
 *
 * The shopper external id (`shopperExternalId`, carried on `ServiceAppointment.ExternalId__c`) is
 * derived here from the authenticated SLAS session — never trusted from the browser. The Core-side
 * record-triggered Flow emails the confirmation.
 *
 * `POST /resource/appointment-book` — FormData: `schedStartTime`, `schedEndTime`, `email`, `subject?`.
 * `schedStartTime`/`schedEndTime` are the ISO 8601 bounds of a slot the availability loader returned.
 *
 * @param args - Action arguments (request carries the FormData; context for provider selection + session)
 * @returns JSON response with the ServiceAppointment id or an error
 */
export async function action({
    request,
    context,
}: ActionFunctionArgs): Promise<ReturnType<typeof data<BookAppointmentResult>>> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return data({ success: false, error: 'Method not allowed' }, { status: 405 });
    }

    // shopperExternalId is derived from the registered session, never from the request body.
    // Guests are rejected — a durable registered identity is required so the ServiceAppointment
    // can be correlated back to the shopper in Core (via ExternalId__c).
    const session = getAuthServer(context);
    if (session.userType !== 'registered' || !session.customerId) {
        logger.warn('AppointmentBook: guest session denied', {
            userType: session.userType,
            endpoint: 'appointment-book',
            outcome: 'denied',
        });
        return data({ success: false, error: 'A registered shopper session is required to book' }, { status: 401 });
    }

    let schedStartTime: string;
    let schedEndTime: string;
    let email: string;
    let subject: string | undefined;
    let workTypeId: string | undefined;
    let territoryId: string | undefined;
    try {
        const form = await request.formData();
        schedStartTime = String(form.get('schedStartTime') ?? '');
        schedEndTime = String(form.get('schedEndTime') ?? '');
        email = String(form.get('email') ?? '').trim();
        const rawSubject = form.get('subject');
        subject = typeof rawSubject === 'string' && rawSubject.trim() ? rawSubject.trim() : undefined;
        if (subject && subject.length > 255) {
            subject = subject.slice(0, 255);
        }
        const rawWorkTypeId = form.get('workTypeId');
        workTypeId = typeof rawWorkTypeId === 'string' && rawWorkTypeId.trim() ? rawWorkTypeId.trim() : undefined;
        const rawTerritoryId = form.get('territoryId');
        territoryId = typeof rawTerritoryId === 'string' && rawTerritoryId.trim() ? rawTerritoryId.trim() : undefined;
    } catch {
        return data({ success: false, error: 'Invalid form data' }, { status: 400 });
    }

    if (!ISO_DATETIME.test(schedStartTime) || !ISO_DATETIME.test(schedEndTime)) {
        return data({ success: false, error: 'schedStartTime/schedEndTime must be ISO 8601' }, { status: 400 });
    }
    // Normalise to UTC Z-suffix so all downstream code (SOQL, SA creation) receives a
    // clean UTC ISO string regardless of whether the client submitted a +HH:MM offset.
    try {
        schedStartTime = new Date(schedStartTime).toISOString();
        schedEndTime = new Date(schedEndTime).toISOString();
    } catch {
        return data({ success: false, error: 'schedStartTime/schedEndTime could not be parsed' }, { status: 400 });
    }
    if (!EMAIL.test(email) || email.length > 254) {
        return data({ success: false, error: 'A valid email is required' }, { status: 400 });
    }

    try {
        const config = getConfig(context);
        if (!config.features.appointment?.enabled) {
            return data({ success: false, error: 'Appointment booking is not enabled' }, { status: 404 });
        }

        const provider = getAppointmentProvider(config, context);
        const result = await provider.bookAppointment({
            schedStartTime,
            schedEndTime,
            email,
            shopperExternalId: session.customerId,
            subject,
            workTypeId,
            territoryId,
        });

        if (result.success) {
            logger.info('BoutiqueAppointment: booked', {
                serviceAppointmentId: result.serviceAppointmentId,
                customerId: session.customerId,
            });
            return data({ success: true, serviceAppointmentId: result.serviceAppointmentId });
        }

        // Provider error: map to route response.
        const status =
            result.error.status &&
            Number.isInteger(result.error.status) &&
            result.error.status >= 400 &&
            result.error.status <= 599
                ? result.error.status
                : 502;
        return data({ success: false, error: 'Booking is currently unavailable' }, { status });
    } catch (error) {
        logger.error('BoutiqueAppointment: booking failed', { error });
        return data({ success: false, error: 'Booking is currently unavailable' }, { status: 502 });
    }
}
