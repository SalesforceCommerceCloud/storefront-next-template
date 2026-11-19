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
import type { ReactElement } from 'react';
import { useAppointment } from '../context/appointment-context';
import AppointmentWizard from './AppointmentWizard';

/**
 * Canonical appointment locator — renders the full booking wizard driven by
 * territories, work types, and slots from AppointmentProvider context set by
 * _app.appointments.tsx. Vertical overlays replace this component to add
 * branding, maps, or images.
 */
export default function AppointmentLocator(): ReactElement | null {
    const appointment = useAppointment();

    if (!appointment) return null;

    return (
        <AppointmentWizard
            stores={appointment.territories}
            workTypes={appointment.workTypes}
            slots={appointment.slots}
            advanceNoticeMinutes={appointment.advanceNoticeMinutes}
            schedulerEnabled={appointment.schedulerEnabled}
            isNavigating={appointment.isNavigating}
            onBook={appointment.onBook}
            bookingSubmitting={appointment.bookingSubmitting}
            bookingResult={appointment.bookingResult}
            shopperName={appointment.shopperName}
            shopperEmail={appointment.shopperEmail}
        />
    );
}
