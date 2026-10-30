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

/** A bookable appointment slot (ISO 8601 start/end). */
export interface AppointmentSlot {
    startTime: string;
    endTime: string;
    resources?: string[];
}

/** Appointment provider error codes. */
export type AppointmentProviderErrorCode =
    | 'NOT_CONFIGURED'
    | 'UNAVAILABLE'
    | 'AUTHORIZATION'
    | 'RATE_LIMITED'
    | 'INVALID_REQUEST';

/** Appointment provider error detail. */
export interface AppointmentProviderError {
    code: AppointmentProviderErrorCode;
    status?: number;
    message?: string;
    retryable?: boolean;
}

/** Appointment availability result (success or error). */
export type AvailabilityResult =
    | { success: true; slots: AppointmentSlot[]; timezone?: string }
    | { success: false; error: AppointmentProviderError };

/** Appointment booking result (success or error). */
export type BookingResult =
    | { success: true; serviceAppointmentId: string; assignedResourceId?: string }
    | { success: false; error: AppointmentProviderError };

/** Input for checking appointment availability. */
export interface AppointmentAvailabilityInput {
    startTime: string;
    endTime: string;
    /** B2C store id (matches ServiceTerritory.StoreId__c on Core). Falls back to config territoryId. */
    storeId?: string;
}

/** Input for booking an appointment. */
export interface AppointmentBookingInput {
    schedStartTime: string;
    schedEndTime: string;
    email: string;
    b2cCustomerId: string;
    subject?: string;
    /** Storefront service id (matches WorkType.ServiceId__c on Core). Falls back to config workTypeId. */
    serviceId?: string;
    /** B2C store id (matches ServiceTerritory.StoreId__c on Core). Falls back to config territoryId. */
    storeId?: string;
}

/**
 * Appointment scheduler provider interface.
 *
 * Implemented by SCAPI (CAP) and BFF (storefront Node → Core org directly) backends.
 */
export interface AppointmentSchedulerProvider {
    readonly name: 'bff' | 'scapi';
    getAvailability(input: AppointmentAvailabilityInput): Promise<AvailabilityResult>;
    bookAppointment(input: AppointmentBookingInput): Promise<BookingResult>;
}
