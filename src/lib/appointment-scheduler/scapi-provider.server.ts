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
import { createApiClients } from '@/lib/api-clients.server';
import { extractResponseError } from '@/lib/utils';
import type {
    AppointmentProviderErrorCode,
    AppointmentSchedulerProvider,
    AvailabilityResult,
    BookingResult,
    AppointmentAvailabilityInput,
    AppointmentBookingInput,
} from './types';

function classifyStatus(status: number): AppointmentProviderErrorCode {
    if (status === 401 || status === 403) return 'AUTHORIZATION';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 400) return 'INVALID_REQUEST';
    return 'UNAVAILABLE';
}

/**
 * SCAPI appointment provider.
 *
 * Calls the `appointments` custom SCAPI client (Appointment Commerce App,
 * `/custom/sfnext-appointment/v1`). The CAP's cartridge reaches the Salesforce
 * Scheduler Core org through the B2C Service Framework.
 */
export function createScapiAppointmentProvider(
    context: RouterContextProvider | Readonly<RouterContextProvider>
): AppointmentSchedulerProvider {
    return {
        name: 'scapi',

        async getAvailability(input: AppointmentAvailabilityInput): Promise<AvailabilityResult> {
            try {
                const clients = createApiClients(context);
                const { data: result } = await clients.appointments.getAppointmentAvailability({
                    params: {
                        query: {
                            startTime: input.startTime,
                            endTime: input.endTime,
                            ...(input.storeId ? { storeId: input.storeId } : {}),
                        },
                    },
                });

                const slots = (result?.slots ?? [])
                    .filter((slot): slot is { startTime: string; endTime: string } =>
                        Boolean(slot?.startTime && slot?.endTime)
                    )
                    .map((slot) => ({ startTime: slot.startTime, endTime: slot.endTime }));

                const rawResult: unknown = result;
                const timezone =
                    rawResult !== null &&
                    typeof rawResult === 'object' &&
                    typeof (rawResult as Record<string, unknown>).timezone === 'string' &&
                    (rawResult as Record<string, unknown>).timezone
                        ? ((rawResult as Record<string, unknown>).timezone as string)
                        : undefined;
                return { success: true, slots, ...(timezone ? { timezone } : {}) };
            } catch (error) {
                // `extractResponseError` re-throws when the error carries no SCAPI `response`
                // (e.g. the custom client's `ApiError`), so guard it and always return a valid
                // status — never NaN, never re-throw.
                let status = 502;
                let message = 'Appointment availability is currently unavailable';
                try {
                    const info = await extractResponseError(error as Error);
                    const parsed = Number(info.status_code);
                    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) {
                        status = parsed;
                    }
                    if (info.responseMessage) {
                        message = info.responseMessage;
                    }
                } catch {
                    if (error instanceof Error && error.message) {
                        message = error.message;
                    }
                }
                return { success: false, error: { code: classifyStatus(status), status, message } };
            }
        },

        async bookAppointment(input: AppointmentBookingInput): Promise<BookingResult> {
            try {
                const clients = createApiClients(context);
                const { data: result } = await clients.appointments.createAppointment({
                    params: {},
                    body: {
                        schedStartTime: input.schedStartTime,
                        schedEndTime: input.schedEndTime,
                        email: input.email,
                        b2cCustomerId: input.b2cCustomerId,
                        subject: input.subject,
                        ...(input.serviceId ? { serviceId: input.serviceId } : {}),
                        ...(input.storeId ? { storeId: input.storeId } : {}),
                    },
                });

                if (!result?.serviceAppointmentId) {
                    return {
                        success: false,
                        error: {
                            code: 'UNAVAILABLE',
                            status: 502,
                            message: 'Scheduler did not return an appointment id',
                        },
                    };
                }

                return { success: true, serviceAppointmentId: result.serviceAppointmentId };
            } catch (error) {
                // Same hardened error handling as getAvailability.
                let status = 502;
                let message = 'Booking is currently unavailable';
                try {
                    const info = await extractResponseError(error as Error);
                    const parsed = Number(info.status_code);
                    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) {
                        status = parsed;
                    }
                    if (info.responseMessage) {
                        message = info.responseMessage;
                    }
                } catch {
                    if (error instanceof Error && error.message) {
                        message = error.message;
                    }
                }
                return { success: false, error: { code: classifyStatus(status), status, message } };
            }
        },
    };
}
