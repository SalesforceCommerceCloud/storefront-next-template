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

export interface AppointmentContextValue {
    territories: ServiceTerritoryOption[];
    advanceNoticeMinutes: number;
    onBook: (formData: FormData) => void;
    bookingSubmitting: boolean;
    bookingResult?: { success: boolean; serviceAppointmentId?: string; error?: string };
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
    children,
}: AppointmentProviderProps): ReactElement {
    return (
        <AppointmentContext.Provider
            value={{ territories, advanceNoticeMinutes, onBook, bookingSubmitting, bookingResult }}>
            {children}
        </AppointmentContext.Provider>
    );
}
