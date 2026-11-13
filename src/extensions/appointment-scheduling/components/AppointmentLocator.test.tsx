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
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AppointmentProvider } from '../context/appointment-context';
import AppointmentLocator from './AppointmentLocator';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return { ...actual, useFetcher: vi.fn(() => ({ state: 'idle', data: undefined, load: vi.fn(), submit: vi.fn() })) };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
}));

const noop = () => {};

describe('AppointmentLocator', () => {
    test('renders nothing when outside AppointmentProvider', () => {
        const { container } = render(<AppointmentLocator />);
        expect(container.firstChild).toBeNull();
    });

    test('renders empty state when territories list is empty', () => {
        render(
            <AppointmentProvider territories={[]} advanceNoticeMinutes={120} onBook={noop} bookingSubmitting={false}>
                <AppointmentLocator />
            </AppointmentProvider>
        );
        // Wizard renders stepper (4 steps) but no territory tiles in the location list
        expect(screen.queryByTestId('appointment-locator')).not.toBeInTheDocument();
    });

    test('renders territory names from context', () => {
        const territories = [
            { id: '0HhSB001', sfId: '0HhSB001', name: 'Market Street Flagship', timezone: 'America/Los_Angeles' },
            { id: '0HhSB002', sfId: '0HhSB002', name: 'Market Street Downtown', timezone: 'America/New_York' },
        ];
        render(
            <AppointmentProvider
                territories={territories}
                advanceNoticeMinutes={120}
                onBook={noop}
                bookingSubmitting={false}>
                <AppointmentLocator />
            </AppointmentProvider>
        );
        expect(screen.getAllByText('Market Street Flagship').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Market Street Downtown').length).toBeGreaterThan(0);
    });
});
