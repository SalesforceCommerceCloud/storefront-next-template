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
/* oxlint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { ServiceTerritoryOption } from '@/lib/appointment-scheduler/types';

/** Enriched work-type entry from the scheduler loader or fallback list. */
export interface ServiceEntry {
    id: string;
    workType: string;
    minutes: number;
    titleKey: string | null;
    title?: string;
    hintKey?: string;
    image?: string;
    workTypeGroupId?: string;
    externalId?: string;
}

export interface AppointmentContextValue {
    territories: ServiceTerritoryOption[];
    advanceNoticeMinutes: number;
    onBook: (formData: FormData) => void;
    bookingSubmitting: boolean;
    bookingResult?: { success: boolean; serviceAppointmentId?: string; error?: string };
    /** Pre-populated from the authenticated shopper session for the review step form. */
    shopperName?: string;
    shopperEmail?: string;
    /**
     * Whether the Salesforce Scheduler is configured for this site. When false the wizard
     * skips the work-types fetch entirely and shows the dataset-provisioned fallback services
     * immediately. When true the wizard fetches work types and shows an error state on failure
     * — never falls back to the hardcoded list.
     */
    schedulerEnabled?: boolean;
    /** Enriched work types from the loader (present when a territory is selected). */
    workTypes?: ServiceEntry[];
    /** Enriched availability slots from the loader. */
    slots?: { startTime: string; endTime: string }[];
    /** Whether a React Router navigation is in-flight. */
    isNavigating?: boolean;
}

const AppointmentContext = createContext<AppointmentContextValue | null>(null);

export function useAppointment(): AppointmentContextValue | null {
    return useContext(AppointmentContext);
}

export type AppointmentProviderProps = PropsWithChildren<AppointmentContextValue>;

export function AppointmentProvider({
    territories,
    advanceNoticeMinutes,
    onBook,
    bookingSubmitting,
    bookingResult,
    shopperName,
    shopperEmail,
    schedulerEnabled,
    workTypes,
    slots,
    isNavigating,
    children,
}: AppointmentProviderProps): ReactElement {
    return (
        <AppointmentContext.Provider
            value={{
                territories,
                advanceNoticeMinutes,
                onBook,
                bookingSubmitting,
                bookingResult,
                shopperName,
                shopperEmail,
                schedulerEnabled,
                workTypes,
                slots,
                isNavigating,
            }}>
            {children}
        </AppointmentContext.Provider>
    );
}
