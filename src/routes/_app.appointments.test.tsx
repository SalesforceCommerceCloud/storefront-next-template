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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getAuth } from '@/middlewares/auth.server';
import { createLoaderArgs, ROUTE_PATTERN } from '@/lib/test-utils';
import { loader } from './_app.appointments';

vi.mock('@salesforce/storefront-next-runtime/config');
vi.mock('@/middlewares/auth.server', () => ({
    getAuth: vi.fn(() => ({ userType: 'registered', customerId: 'shopper-1' })),
}));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
}));
vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: vi.fn(() => '/login'),
}));
vi.mock('@/utils/canonical-url', () => ({
    buildCanonicalUrl: vi.fn((_origin, path) => `https://example.com${path}`),
}));
vi.mock('@/lib/appointment-scheduler', () => ({
    getAppointmentProvider: vi.fn(() => ({
        getServiceTerritories: vi.fn(() => Promise.resolve({ success: true, territories: [] })),
    })),
}));

import { getAppointmentProvider } from '@/lib/appointment-scheduler';

const BASE_URL = 'http://localhost/global/en-US/appointments';

describe('_app.appointments loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAuth).mockReturnValue({ userType: 'registered', customerId: 'shopper-1' } as never);
        vi.mocked(getConfig).mockReturnValue({
            scheduler: { siteId: 'Fashion' },
            features: { appointment: { advanceNoticeMinutes: 120 } },
        } as never);
        vi.mocked(getAppointmentProvider).mockReturnValue({
            getServiceTerritories: vi.fn(() => Promise.resolve({ success: true, territories: [] })),
        } as never);
    });

    test('redirects unauthenticated users to login', async () => {
        vi.mocked(getAuth).mockReturnValue({ userType: 'guest', customerId: null } as never);
        const request = new Request(BASE_URL);
        await expect(loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }))).rejects.toThrow();
    });

    test('passes siteId from config to getServiceTerritories', async () => {
        const mockGetTerritories = vi.fn(() => Promise.resolve({ success: true, territories: [] }));
        vi.mocked(getAppointmentProvider).mockReturnValue({ getServiceTerritories: mockGetTerritories } as never);

        const request = new Request(BASE_URL);
        await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(mockGetTerritories).toHaveBeenCalledWith({ siteId: 'Fashion' });
    });

    test('returns empty territories on provider failure', async () => {
        vi.mocked(getAppointmentProvider).mockReturnValue({
            getServiceTerritories: vi.fn(() => Promise.resolve({ success: false, error: { code: 'UNAVAILABLE' } })),
        } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(result.territories).toEqual([]);
    });

    test('returns territories and advanceNoticeMinutes on success', async () => {
        const territories = [{ id: '0HhSB001', name: 'Market Street Flagship', timezone: 'America/Los_Angeles' }];
        vi.mocked(getAppointmentProvider).mockReturnValue({
            getServiceTerritories: vi.fn(() => Promise.resolve({ success: true, territories })),
        } as never);

        const request = new Request(BASE_URL);
        const result = await loader(createLoaderArgs(request, {} as never, { pattern: ROUTE_PATTERN }));

        expect(result.territories).toEqual(territories);
        expect(result.advanceNoticeMinutes).toBe(120);
    });
});
