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

/** A work type option surfaced in the "Why Are You Visiting" step of the appointment wizard. */
export interface WorkTypeOption {
    /** WorkType.Id from Core. */
    id: string;
    /** WorkType.Name from Core. */
    name: string;
    /** Estimated duration in minutes (WorkType.EstimatedDuration). */
    durationMinutes: number;
    /** WorkTypeGroup.Id — carried here so getAvailability gets it directly from the selection
     *  without a separate WorkTypeGroupMember lookup. */
    workTypeGroupId: string;
}

/** Work types result (success or error). */
export type WorkTypesResult =
    | { success: true; workTypes: WorkTypeOption[] }
    | { success: false; error: AppointmentProviderError };

/** A service territory option surfaced in the location-selection step of the appointment wizard. */
export interface ServiceTerritoryOption {
    /** ExternalId__c if set, otherwise ServiceTerritory.Id. Used as the `territoryId` param. */
    id: string;
    /** ServiceTerritory.Id (Salesforce record Id). Always the SF primary key. */
    sfId: string;
    /** ServiceTerritory.Name from Core — always available, no dataset needed. */
    name: string;
    /** IANA timezone from ServiceTerritory.OperatingHours.TimeZone. Defaults to `'UTC'` when absent. */
    timezone: string;
    /** ServiceTerritory.ExternalId__c — B2C store ID for image/map enrichment.
     *  Absent when zero-provisioning (territory works without dataset). */
    externalId?: string;
    /** ServiceTerritory.SN_SiteId__c — B2C site ID this territory belongs to.
     *  Used to scope territory listings per site in multi-site Core org deployments. */
    siteId?: string;
    // Location from Core (all optional — zero-provisioning works without them)
    address1?: string;
    city?: string;
    postalCode?: string;
    stateCode?: string;
    countryCode?: string;
    phone?: string;
    latitude?: number;
    longitude?: number;
    /** Resolved facade image URL — populated by the B2C enrichment step in the boutiques loader. */
    image?: string;
}

/** Service territories result (success or error). */
export type ServiceTerritoriesResult =
    | { success: true; territories: ServiceTerritoryOption[] }
    | { success: false; error: AppointmentProviderError };

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
    /** Territory external id (matches ServiceTerritory.ExternalId__c on Core). Falls back to config territoryId. */
    territoryId?: string;
    /** WorkType Salesforce Id (returned by getWorkTypes). Kept for reference/logging. */
    workTypeId?: string;
    /** WorkTypeGroup.Id carried from the selected WorkTypeOption. Passed directly to getAvailability
     *  so no extra SOQL lookup is needed. Falls back to config workTypeGroupId. */
    workTypeGroupId?: string;
}

/** Input for booking an appointment. */
export interface AppointmentBookingInput {
    schedStartTime: string;
    schedEndTime: string;
    email: string;
    shopperExternalId: string;
    subject?: string;
    /** Salesforce record Id of the WorkType to associate with the ServiceAppointment. */
    workTypeId?: string;
    /** Salesforce record Id (or ExternalId__c) of the ServiceTerritory. Falls back to config territoryId. */
    territoryId?: string;
}

/**
 * Appointment scheduler provider interface.
 *
 * Implemented by SCAPI (CAP) and BFF (storefront Node → Core org directly) backends.
 */
export interface AppointmentSchedulerProvider {
    readonly name: 'bff' | 'scapi';
    /** Return the merchant-configured work types for the appointment wizard's visit-reason step. */
    getWorkTypes(input: { territoryId?: string }): Promise<WorkTypesResult>;
    /** Return active service territories for appointment booking, optionally scoped to a B2C site. */
    getServiceTerritories(input?: { siteId?: string }): Promise<ServiceTerritoriesResult>;
    getAvailability(input: AppointmentAvailabilityInput): Promise<AvailabilityResult>;
    bookAppointment(input: AppointmentBookingInput): Promise<BookingResult>;
}
