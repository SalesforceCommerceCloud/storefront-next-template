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
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import type {
    AppointmentProviderErrorCode,
    AppointmentSchedulerProvider,
    AvailabilityResult,
    BookingResult,
    WorkTypesResult,
    ServiceTerritoriesResult,
    AppointmentAvailabilityInput,
    AppointmentBookingInput,
    ServiceTerritoryOption,
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

        async getWorkTypes(input: { territoryId?: string }): Promise<WorkTypesResult> {
            try {
                const clients = createApiClients(context);
                const { data: result } = await clients.appointments.getWorkTypes({
                    params: {
                        query: {
                            ...(input.territoryId ? { c_territoryId: input.territoryId } : {}),
                        },
                    },
                });
                const workTypes = (result?.workTypes ?? []).filter(
                    (wt): wt is { id: string; name: string; durationMinutes: number; workTypeGroupId: string } =>
                        Boolean(wt?.id && wt?.name)
                );
                return { success: true, workTypes };
            } catch (error) {
                let status = 502;
                let message = 'Work types are currently unavailable';
                try {
                    const info = await extractResponseError(error as Error);
                    const parsed = Number(info.status_code);
                    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) status = parsed;
                    if (info.responseMessage) message = info.responseMessage;
                } catch {
                    if (error instanceof Error && error.message) message = error.message;
                    else if (typeof error === 'string') message = error;
                }
                return { success: false, error: { code: classifyStatus(status), status, message } };
            }
        },

        async getServiceTerritories(input: { siteId?: string } = {}): Promise<ServiceTerritoriesResult> {
            try {
                const clients = createApiClients(context);
                const { data: result } = await clients.appointments.getServiceTerritories({
                    params: {
                        query: {
                            ...(input.siteId ? { c_siteId: input.siteId } : {}),
                        },
                    },
                });
                const territories = (result?.territories ?? [])
                    .filter((t): t is NonNullable<typeof t> => Boolean(t?.id && t?.name))
                    .map((t) => ({
                        id: t.id ?? '',
                        sfId: t.sfId ?? t.id ?? '',
                        name: t.name ?? '',
                        timezone: t.timezone ?? 'UTC',
                        ...(t.externalId ? { externalId: t.externalId } : {}),
                        ...(t.siteId ? { siteId: t.siteId } : {}),
                        ...(t.address1 ? { address1: t.address1 } : {}),
                        ...(t.city ? { city: t.city } : {}),
                        ...(t.postalCode ? { postalCode: t.postalCode } : {}),
                        ...(t.stateCode ? { stateCode: t.stateCode } : {}),
                        ...(t.countryCode ? { countryCode: t.countryCode } : {}),
                        ...(t.phone ? { phone: t.phone } : {}),
                        ...(t.latitude != null ? { latitude: t.latitude } : {}),
                        ...(t.longitude != null ? { longitude: t.longitude } : {}),
                    })) as ServiceTerritoryOption[];
                return { success: true, territories };
            } catch (error) {
                let status = 502;
                let message = 'Service territories are currently unavailable';
                try {
                    const info = await extractResponseError(error as Error);
                    const parsed = Number(info.status_code);
                    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) status = parsed;
                    if (info.responseMessage) message = info.responseMessage;
                } catch {
                    if (error instanceof Error && error.message) message = error.message;
                    else if (typeof error === 'string') message = error;
                }
                return { success: false, error: { code: classifyStatus(status), status, message } };
            }
        },

        async getAvailability(input: AppointmentAvailabilityInput): Promise<AvailabilityResult> {
            try {
                const clients = createApiClients(context);
                const siteId = context.get(siteContext)?.site?.id ?? '';
                const { data: result } = await clients.appointments.getAppointmentAvailability({
                    params: {
                        query: {
                            siteId,
                            c_startTime: input.startTime,
                            c_endTime: input.endTime,
                            ...(input.territoryId ? { c_territoryId: input.territoryId } : {}),
                            ...(input.workTypeGroupId ? { c_workTypeGroupId: input.workTypeGroupId } : {}),
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
                const siteId = context.get(siteContext)?.site?.id ?? '';
                const { data: result } = await clients.appointments.createAppointment({
                    params: { query: { siteId } },
                    body: {
                        schedStartTime: input.schedStartTime,
                        schedEndTime: input.schedEndTime,
                        email: input.email,
                        // CAP API field name is still b2cCustomerId — mapped from internal shopperExternalId.
                        b2cCustomerId: input.shopperExternalId,
                        subject: input.subject,
                        ...(input.workTypeId ? { workTypeId: input.workTypeId } : {}),
                        ...(input.territoryId ? { territoryId: input.territoryId } : {}),
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
                    } else if (typeof error === 'string') {
                        message = error;
                    }
                }
                return { success: false, error: { code: classifyStatus(status), status, message } };
            }
        },
    };
}
