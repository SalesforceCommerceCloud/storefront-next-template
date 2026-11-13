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
import { loader } from './resource.appointment-availability';

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ customerId: 'test-customer-id' })),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));
vi.mock('@/lib/origin', () => ({
    isSameOrigin: vi.fn(() => true),
}));
vi.mock('@/lib/appointment-scheduler', () => ({
    getAppointmentProvider: vi.fn(() => ({
        getAvailability: vi.fn(() =>
            Promise.resolve({ success: false, error: { message: 'unavailable', status: 503 } })
        ),
    })),
}));

const BASE_URL = 'http://localhost/resource/appointment-availability';

describe('resource.appointment-availability loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ customerId: 'test-customer-id' } as never);
        vi.mocked(getConfig).mockReturnValue({ features: { appointment: { enabled: true } } } as never);
    });

    test('returns 404 when appointment feature is disabled', async () => {
        vi.mocked(getConfig).mockReturnValue({ features: { appointment: { enabled: false } } } as never);

        const request = new Request(`${BASE_URL}?startTime=2026-12-01T09:00:00Z&endTime=2026-12-01T17:00:00Z`);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 404);
        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('Appointment booking is not enabled');
    });

    test('returns 401 when no shopper session is present', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: null } as never);

        const request = new Request(`${BASE_URL}?startTime=2026-12-01T09:00:00Z&endTime=2026-12-01T17:00:00Z`);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 401);
        expect(result.data.success).toBe(false);
    });

    test('returns 400 when startTime is missing', async () => {
        const request = new Request(`${BASE_URL}?endTime=2026-12-01T17:00:00Z`);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('startTime and endTime are required');
    });

    test('returns 400 when endTime is missing', async () => {
        const request = new Request(`${BASE_URL}?startTime=2026-12-01T09:00:00Z`);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expectStatus(result, 400);
        expect(result.data.success).toBe(false);
        expect(result.data.error).toBe('startTime and endTime are required');
    });

    test('forwards workTypeGroupId from URL to provider.getAvailability()', async () => {
        const mockGetAvailability = vi.fn().mockResolvedValue({ success: true, slots: [] });
        const { getAppointmentProvider } = await import('@/lib/appointment-scheduler');
        vi.mocked(getAppointmentProvider).mockReturnValue({
            getAvailability: mockGetAvailability,
        } as any);

        const request = new Request(
            `${BASE_URL}?startTime=2026-12-01T09:00:00Z&endTime=2026-12-01T17:00:00Z&territoryId=ln-boutique-london&workTypeGroupId=0VSSB0000002ojt4AA`
        );
        await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(mockGetAvailability).toHaveBeenCalledWith(
            expect.objectContaining({ workTypeGroupId: '0VSSB0000002ojt4AA' })
        );
    });
});
