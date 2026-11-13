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
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import AppointmentAffordance from './AppointmentAffordance';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useRouteLoaderData: vi.fn(),
    };
});

vi.mock('@/components/link', () => ({
    Link: vi.fn(({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) => (
        <a href={to} className={className}>
            {children}
        </a>
    )),
}));

import { useRouteLoaderData } from 'react-router';

describe('AppointmentAffordance', () => {
    test('renders nothing when appointment feature is disabled', () => {
        vi.mocked(useRouteLoaderData).mockReturnValue({ appConfig: { features: { appointment: { enabled: false } } } });
        const { container } = render(<AppointmentAffordance />);
        expect(container.firstChild).toBeNull();
    });

    test('renders nothing when appConfig is missing', () => {
        vi.mocked(useRouteLoaderData).mockReturnValue(undefined);
        const { container } = render(<AppointmentAffordance />);
        expect(container.firstChild).toBeNull();
    });

    test('renders link to /appointments when feature is enabled', () => {
        vi.mocked(useRouteLoaderData).mockReturnValue({ appConfig: { features: { appointment: { enabled: true } } } });
        render(<AppointmentAffordance />);
        const link = screen.getByRole('link');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/appointments');
    });

    test('includes productId in href when provided', () => {
        vi.mocked(useRouteLoaderData).mockReturnValue({ appConfig: { features: { appointment: { enabled: true } } } });
        render(<AppointmentAffordance productId="watch-001" />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/appointments?product=watch-001');
    });
});
