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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { createLoaderArgs, expectStatus, ROUTE_PATTERN } from '@/lib/test-utils';
import { loader } from './resource.appointment-work-types';

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ userType: 'registered', customerId: 'test-customer-id' })),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));
vi.mock('@/lib/appointment-scheduler', () => ({
    getAppointmentProvider: vi.fn(() => ({
        getWorkTypes: vi.fn(() =>
            Promise.resolve({
                success: false,
                error: { code: 'NOT_CONFIGURED', message: 'not configured', status: 503 },
            })
        ),
    })),
}));

import { getAppointmentProvider } from '@/lib/appointment-scheduler';

const BASE_URL = 'http://localhost/resource/appointment-work-types';

describe('resource.appointment-work-types loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'test-customer-id' } as never);
        vi.mocked(getConfig).mockReturnValue({ features: { appointment: { enabled: true } } } as never);
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getWorkTypes: vi.fn(() =>
                Promise.resolve({
                    success: false,
                    error: { code: 'NOT_CONFIGURED', message: 'not configured', status: 503 },
                })
            ),
            getServiceTerritories: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);
    });

    test('returns 401 when the shopper is not authenticated', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', customerId: null } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('Unauthorized');
    });

    test('returns 401 when customerId is missing even if userType is registered', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: null } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(result.data.success).toBe(false);
    });

    test('returns success with work types when provider succeeds', async () => {
        const workTypes = [
            { id: 'view', name: 'Private Viewing', durationMinutes: 30, workTypeGroupId: 'wtg-1' },
            { id: 'service', name: 'Watch Servicing', durationMinutes: 15, workTypeGroupId: 'wtg-1' },
        ];
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getWorkTypes: vi.fn(() => Promise.resolve({ success: true, workTypes })),
            getServiceTerritories: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(result.data.success).toBe(true);
        expect(result.data.workTypes).toEqual(workTypes);
    });

    test('forwards optional territoryId query param to the provider', async () => {
        const getWorkTypesMock = vi.fn(() => Promise.resolve({ success: true, workTypes: [] }));
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getWorkTypes: getWorkTypesMock,
            getServiceTerritories: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);

        const request = new Request(`${BASE_URL}?territoryId=ln-boutique-london`);
        await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(getWorkTypesMock).toHaveBeenCalledWith({ territoryId: 'ln-boutique-london' });
    });

    test('returns success:false with error message when provider fails', async () => {
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getWorkTypes: vi.fn(() =>
                Promise.resolve({
                    success: false,
                    error: {
                        code: 'UNAVAILABLE',
                        message: 'Appointment booking is currently unavailable',
                        status: 502,
                    },
                })
            ),
            getServiceTerritories: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('Appointment booking is currently unavailable');
    });
});
