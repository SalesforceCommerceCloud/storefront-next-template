export interface paths {
    "/appointment-availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get appointment availability (open slots) for the configured territory + work-type group */
        get: operations["getAppointmentAvailability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/appointments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Book an appointment */
        post: operations["createAppointment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getAppointmentAvailability: {
        parameters: {
            query: {
                siteId: string;
                /** @description ISO 8601 start of the search window. */
                startTime: string;
                /** @description ISO 8601 end of the search window (Core caps results to 31 days from startTime). */
                endTime: string;
                /** @description B2C store id (matches ServiceTerritory.StoreId__c on Core). Falls back to config territoryId. */
                storeId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Availability returned */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        success?: boolean;
                        slots?: {
                            startTime?: string;
                            endTime?: string;
                            resources?: string[];
                        }[];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Scheduler unavailable or not configured */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    createAppointment: {
        parameters: {
            query: {
                siteId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description ISO 8601 appointment start (must match an available slot). */
                    schedStartTime: string;
                    /** @description ISO 8601 appointment end. */
                    schedEndTime: string;
                    /** @description Shopper email the confirmation is sent to. */
                    email: string;
                    /** @description Shopper correlation id carried on ServiceAppointment.b2cCustomerId__c. Derived by the storefront server from the authenticated session before the call — never from the browser. */
                    b2cCustomerId: string;
                    subject?: string;
                    /** @description Storefront service id (matches WorkType.ServiceId__c on Core). Falls back to config workTypeId. */
                    serviceId?: string;
                    /** @description B2C store id (matches ServiceTerritory.StoreId__c on Core). Falls back to config territoryId. */
                    storeId?: string;
                };
            };
        };
        responses: {
            /** @description Appointment booked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        success?: boolean;
                        serviceAppointmentId?: string;
                        assignedResourceId?: string;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Scheduler unavailable or not configured */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
