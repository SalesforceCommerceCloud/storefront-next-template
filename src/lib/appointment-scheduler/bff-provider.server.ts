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
import type { RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { correlationContext } from '@/lib/correlation';
import {
    resolveSchedulerCoreConfig,
    getAvailability as schedulerGetAvailability,
    bookAppointment as schedulerBookAppointment,
} from '@/lib/scheduler/scheduler.server';
import type {
    AppointmentSchedulerProvider,
    AvailabilityResult,
    BookingResult,
    AppointmentAvailabilityInput,
    AppointmentBookingInput,
    AppointmentProviderErrorCode,
} from './types';

/**
 * BFF appointment provider.
 *
 * Calls Salesforce Core org directly via the scheduler module (storefront Node
 * → OAuth 2.0 client-credentials → Scheduler Connect REST + Data API).
 */
export function createBffAppointmentProvider(
    context: RouterContextProvider | Readonly<RouterContextProvider>
): AppointmentSchedulerProvider {
    return {
        name: 'bff',

        async getAvailability(input: AppointmentAvailabilityInput): Promise<AvailabilityResult> {
            const core = resolveSchedulerCoreConfig(getConfig(context));
            if (!core || !core.enabled) {
                return {
                    success: false,
                    error: { code: 'NOT_CONFIGURED', status: 503, message: 'Scheduler not configured' },
                };
            }

            const result = await schedulerGetAvailability(
                core,
                { startTime: input.startTime, endTime: input.endTime, storeId: input.storeId },
                {
                    logger: getLogger(context),
                    correlationId: context.get(correlationContext),
                }
            );

            if (result.success) {
                return {
                    success: true,
                    slots: result.data.slots,
                    ...(result.data.timezone ? { timezone: result.data.timezone } : {}),
                };
            }

            // Map SchedulerErrorCode → AppointmentProviderError.
            const entry = ERROR_MAP[result.error.code] ?? ERROR_MAP.SCHEDULER_UNAVAILABLE;
            return {
                success: false,
                error: {
                    code: entry.code,
                    status: entry.status,
                    message: entry.message,
                    retryable: result.error.retryable,
                },
            };
        },

        async bookAppointment(input: AppointmentBookingInput): Promise<BookingResult> {
            const core = resolveSchedulerCoreConfig(getConfig(context));
            if (!core || !core.enabled) {
                return {
                    success: false,
                    error: { code: 'NOT_CONFIGURED', status: 503, message: 'Scheduler not configured' },
                };
            }

            const result = await schedulerBookAppointment(
                core,
                {
                    schedStartTime: input.schedStartTime,
                    schedEndTime: input.schedEndTime,
                    email: input.email,
                    b2cCustomerId: input.b2cCustomerId,
                    subject: input.subject,
                    serviceId: input.serviceId,
                    storeId: input.storeId,
                },
                {
                    logger: getLogger(context),
                    correlationId: context.get(correlationContext),
                }
            );

            if (result.success) {
                return {
                    success: true,
                    serviceAppointmentId: result.data.serviceAppointmentId,
                    assignedResourceId: result.data.assignedResourceId,
                };
            }

            // Map SchedulerErrorCode → AppointmentProviderError.
            const entry = ERROR_MAP[result.error.code] ?? ERROR_MAP.SCHEDULER_UNAVAILABLE;
            return {
                success: false,
                error: {
                    code: entry.code,
                    status: entry.status,
                    message: entry.message,
                    retryable: result.error.retryable,
                },
            };
        },
    };
}

/**
 * Maps each SchedulerErrorCode to its provider-facing error code, HTTP status, and message.
 *
 * SCHEDULER_AUTHORIZATION → 502 (NOT 401) because the BFF's OAuth credentials are wrong,
 * not the shopper's session. 401 would prompt the storefront to clear session cookies.
 */
const ERROR_MAP: Record<string, { code: AppointmentProviderErrorCode; status: number; message: string }> = {
    SCHEDULER_NOT_CONFIGURED: { code: 'NOT_CONFIGURED', status: 503, message: 'Appointment booking is not configured' },
    SCHEDULER_UNAVAILABLE: {
        code: 'UNAVAILABLE',
        status: 502,
        message: 'Appointment booking is currently unavailable',
    },
    SCHEDULER_AUTHORIZATION: { code: 'AUTHORIZATION', status: 502, message: 'Appointment authorization failed' },
    SCHEDULER_RATE_LIMITED: {
        code: 'RATE_LIMITED',
        status: 503,
        message: 'Too many requests. Please try again shortly.',
    },
    INVALID_REQUEST: { code: 'INVALID_REQUEST', status: 400, message: 'Invalid appointment request' },
};
