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

/**
 * Types for the Salesforce Scheduler (Core org) appointment-booking integration.
 *
 * The storefront server (BFF) calls a *separate* Salesforce Core org via OAuth 2.0
 * client-credentials, then calls Scheduler Connect REST (availability) and the Data
 * API (ServiceAppointment create). The Core org is reached directly — it is NOT
 * behind B2C Commerce SCAPI — so this follows the direct-fetch pattern used by the
 * Marketing Cloud and Cimulate token-bridge integrations, not the SCAPI custom-client
 * mechanism.
 */

/**
 * Merchant-controlled, non-secret configuration for the Core Scheduler org. Sourced from
 * `config.app.scheduler` (see `src/types/config.ts`). The consumer SECRET is never here —
 * it is read from `process.env.SCHEDULER_CLIENT_SECRET` in `scheduler.server.ts` only.
 */
export interface SchedulerCoreConfig {
    /** Core org My Domain host, e.g. `example.my.salesforce.com`. */
    myDomain: string;
    /** OAuth client-credentials consumer key (client ID). Not a secret. */
    clientId: string;
    /** Salesforce API version for Connect REST + Data API, e.g. `v64.0`. */
    apiVersion: string;
    /** Service territory offering the appointments (ServiceTerritory Id). */
    territoryId: string;
    /** Work type group whose availability is queried (WorkTypeGroup Id). */
    workTypeGroupId: string;
    /** Work type booked on the ServiceAppointment (WorkType Id). */
    workTypeId: string;
    /** Anchor Account used as `ParentRecordId` (no-Contact correlation design). */
    parentRecordId: string;
    /** Optional AppointmentSchedulingPolicy Id applied to availability lookups. */
    schedulingPolicyId?: string;
    /** Optional ServiceResource required on the booking (consumes the slot / anti-double-booking). */
    serviceResourceId?: string;
    /**
     * Optional exact host that authorizes a non-production Core My Domain whose host does not
     * end in the trusted `my.salesforce.com` suffix (e.g. an internal sandbox pod). Sourced
     * from `process.env.SCHEDULER_MYDOMAIN_ALLOWED_HOST` — not from merchant config.
     */
    allowedHost?: string;
}

/** Per-request availability window. Territory/work-type/policy come from {@link SchedulerCoreConfig}. */
export interface AvailabilityInput {
    /** ISO 8601 start of the search window. */
    startTime: string;
    /** ISO 8601 end of the search window (Core caps results to 31 days from `startTime`). */
    endTime: string;
    /** B2C store id (matches ServiceTerritory.StoreId__c on Core). Falls back to config territoryId. */
    storeId?: string;
}

/** Per-request booking details. Territory/work-type/parent/resource come from {@link SchedulerCoreConfig}. */
export interface BookingInput {
    /** ISO 8601 appointment start (must match an available slot). */
    schedStartTime: string;
    /** ISO 8601 appointment end. */
    schedEndTime: string;
    /** Shopper email the confirmation is sent to. */
    email: string;
    /**
     * Correlation id for the shopper, carried on `ServiceAppointment.b2cCustomerId__c`.
     * MUST be derived from the authenticated session (SCAPI customer id), never from client input.
     */
    b2cCustomerId: string;
    /** Optional appointment subject. */
    subject?: string;
    /** Storefront service id (matches WorkType.ServiceId__c on Core). Falls back to config workTypeId. */
    serviceId?: string;
    /** B2C store id (matches ServiceTerritory.StoreId__c on Core). Falls back to config territoryId. */
    storeId?: string;
    /** Advisor external id (matches ServiceResource.AdvisorId__c on Core). When provided, books a specific
     *  advisor. When absent, the BFF auto-selects the first active Primary resource for the territory. */
    advisorId?: string;
}

export interface AvailableSlot {
    startTime: string;
    endTime: string;
    resources?: string[];
}

export interface AvailabilityData {
    slots: AvailableSlot[];
    /** IANA timezone of the territory (e.g. 'Europe/London'). Fetched from OperatingHours.TimeZone. */
    timezone?: string;
}

export interface BookingData {
    serviceAppointmentId: string;
    /** Present only when a required ServiceResource was assigned (consumes the slot). */
    assignedResourceId?: string;
}

/** Error codes returned by the scheduler server functions (downstream Core failures). */
export type SchedulerErrorCode =
    | 'SCHEDULER_NOT_CONFIGURED'
    | 'SCHEDULER_UNAVAILABLE'
    | 'SCHEDULER_AUTHORIZATION'
    | 'SCHEDULER_RATE_LIMITED'
    | 'INVALID_REQUEST';

export interface SchedulerError {
    code: SchedulerErrorCode;
    retryable?: boolean;
    retryAfterSeconds?: number;
}

export type SchedulerResult<T> = { success: true; data: T } | { success: false; error: SchedulerError };

/** Error codes a scheduler resource route can return to the browser (route guards + downstream). */
export type SchedulerRouteErrorCode =
    | 'METHOD_NOT_ALLOWED'
    | 'FORBIDDEN_ORIGIN'
    | 'FEATURE_DISABLED'
    | 'INVALID_REQUEST'
    | 'SHOPPER_SESSION_REQUIRED'
    | SchedulerErrorCode;

export type AvailabilityResponseBody =
    | { success: true; slots: AvailableSlot[] }
    | { success: false; error: { code: SchedulerRouteErrorCode } };

export type BookingResponseBody =
    | { success: true; serviceAppointmentId: string; assignedResourceId?: string }
    | { success: false; error: { code: SchedulerRouteErrorCode } };
