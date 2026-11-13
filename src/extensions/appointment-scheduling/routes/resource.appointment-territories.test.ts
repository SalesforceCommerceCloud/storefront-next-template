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
import { loader } from './resource.appointment-territories';

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ userType: 'registered', customerId: 'test-customer-id' })),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));
vi.mock('@/lib/appointment-scheduler', () => ({
    getAppointmentProvider: vi.fn(() => ({
        getServiceTerritories: vi.fn(() =>
            Promise.resolve({ success: false, error: { code: 'NOT_CONFIGURED', retryable: false } })
        ),
    })),
}));

import { getAppointmentProvider } from '@/lib/appointment-scheduler';

const BASE_URL = 'http://localhost/resource/appointment-territories';

describe('resource.appointment-territories loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'test-customer-id' } as never);
        vi.mocked(getConfig).mockReturnValue({ features: { appointment: { enabled: true } } } as never);
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getServiceTerritories: vi.fn(() =>
                Promise.resolve({ success: false, error: { code: 'NOT_CONFIGURED', retryable: false } })
            ),
            getWorkTypes: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);
    });

    test('returns 401 when not authenticated', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', customerId: null } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('Unauthorized');
    });

    test('returns territories on success from provider', async () => {
        const territories = [
            {
                id: 'st-001',
                storeId: 'ln-boutique-bond-street',
                name: 'Bond Street Boutique',
                timezone: 'Europe/London',
            },
            { id: 'st-002', storeId: 'ln-boutique-paris', name: 'Paris Boutique', timezone: 'Europe/Paris' },
        ];
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getServiceTerritories: vi.fn(() => Promise.resolve({ success: true, territories })),
            getWorkTypes: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(result.data.success).toBe(true);
        expect(result.data.territories).toEqual(territories);
    });

    test('returns success: false when provider fails', async () => {
        vi.mocked(getAppointmentProvider).mockReturnValue({
            name: 'bff',
            getServiceTerritories: vi.fn(() =>
                Promise.resolve({
                    success: false,
                    error: {
                        code: 'UNAVAILABLE',
                        message: 'Appointment booking is currently unavailable',
                        status: 502,
                    },
                })
            ),
            getWorkTypes: vi.fn(),
            getAvailability: vi.fn(),
            bookAppointment: vi.fn(),
        } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('Appointment booking is currently unavailable');
    });
});
