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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { createBffAppointmentProvider } from './bff-provider.server';
import type { SchedulerResult, AvailabilityData, BookingData } from '@/lib/scheduler/types';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(() => ({
        scheduler: {
            enabled: true,
            myDomain: 'test.my.salesforce.com',
            clientId: 'test-client-id',
            apiVersion: 'v64.0',
            territoryId: 'test-territory',
            workTypeGroupId: 'test-group',
            workTypeId: 'test-work-type',
            parentRecordId: 'test-parent',
        },
    })),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/lib/correlation', () => ({
    correlationContext: Symbol('correlation'),
}));

vi.mock('@/lib/scheduler/scheduler.server');

import { bookAppointment, resolveSchedulerCoreConfig, getAvailability } from '@/lib/scheduler/scheduler.server';

const mockContext = {
    get: vi.fn(() => 'test-correlation-id'),
} as unknown as RouterContextProvider;

describe('createBffAppointmentProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(resolveSchedulerCoreConfig).mockReturnValue({
            enabled: true,
            myDomain: 'test.my.salesforce.com',
            clientId: 'test-client-id',
            apiVersion: 'v64.0',
            territoryId: 'test-territory',
            workTypeGroupId: 'test-group',
            workTypeId: 'test-work-type',
            parentRecordId: 'test-parent',
        });
    });

    describe('getAvailability', () => {
        it('returns slots on success', async () => {
            vi.mocked(getAvailability).mockResolvedValue({
                success: true,
                data: {
                    slots: [
                        { startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z' },
                        { startTime: '2026-10-26T11:00:00Z', endTime: '2026-10-26T11:30:00Z' },
                    ],
                },
            } as SchedulerResult<AvailabilityData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.slots).toHaveLength(2);
                expect(result.slots[0]).toEqual({
                    startTime: '2026-10-26T10:00:00Z',
                    endTime: '2026-10-26T10:30:00Z',
                });
            }
        });

        it('returns NOT_CONFIGURED error when scheduler config is missing', async () => {
            vi.mocked(resolveSchedulerCoreConfig).mockReturnValue(null);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('NOT_CONFIGURED');
                expect(result.error.status).toBe(503);
            }
        });

        it('returns NOT_CONFIGURED error when scheduler is disabled', async () => {
            vi.mocked(resolveSchedulerCoreConfig).mockReturnValue({
                enabled: false,
                myDomain: '',
                clientId: '',
                apiVersion: 'v64.0',
                territoryId: '',
                workTypeGroupId: '',
                workTypeId: '',
                parentRecordId: '',
            });

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('NOT_CONFIGURED');
                expect(result.error.status).toBe(503);
            }
        });

        it('maps scheduler UNAVAILABLE error to 502', async () => {
            vi.mocked(getAvailability).mockResolvedValue({
                success: false,
                error: {
                    code: 'SCHEDULER_UNAVAILABLE',
                    retryable: true,
                },
            } as SchedulerResult<AvailabilityData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('UNAVAILABLE');
                expect(result.error.status).toBe(502);
                expect(result.error.retryable).toBe(true);
            }
        });

        it('maps scheduler AUTHORIZATION error to 502 (not 401)', async () => {
            vi.mocked(getAvailability).mockResolvedValue({
                success: false,
                error: {
                    code: 'SCHEDULER_AUTHORIZATION',
                },
            } as SchedulerResult<AvailabilityData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('AUTHORIZATION');
                expect(result.error.status).toBe(502);
            }
        });

        it('maps scheduler RATE_LIMITED error to 503', async () => {
            vi.mocked(getAvailability).mockResolvedValue({
                success: false,
                error: {
                    code: 'SCHEDULER_RATE_LIMITED',
                    retryable: true,
                },
            } as SchedulerResult<AvailabilityData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('RATE_LIMITED');
                expect(result.error.status).toBe(503);
            }
        });

        it('maps scheduler INVALID_REQUEST error to 400', async () => {
            vi.mocked(getAvailability).mockResolvedValue({
                success: false,
                error: {
                    code: 'INVALID_REQUEST',
                },
            } as SchedulerResult<AvailabilityData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('INVALID_REQUEST');
                expect(result.error.status).toBe(400);
            }
        });
    });

    describe('bookAppointment', () => {
        it('returns serviceAppointmentId on success', async () => {
            vi.mocked(bookAppointment).mockResolvedValue({
                success: true,
                data: {
                    serviceAppointmentId: 'SA-12345',
                    assignedResourceId: 'SR-67890',
                },
            } as SchedulerResult<BookingData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.bookAppointment({
                schedStartTime: '2026-10-26T10:00:00Z',
                schedEndTime: '2026-10-26T10:30:00Z',
                email: 'test@example.com',
                b2cCustomerId: 'cust-123',
                subject: 'Test appointment',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.serviceAppointmentId).toBe('SA-12345');
                expect(result.assignedResourceId).toBe('SR-67890');
            }
        });

        it('returns NOT_CONFIGURED error when scheduler config is missing', async () => {
            vi.mocked(resolveSchedulerCoreConfig).mockReturnValue(null);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.bookAppointment({
                schedStartTime: '2026-10-26T10:00:00Z',
                schedEndTime: '2026-10-26T10:30:00Z',
                email: 'test@example.com',
                b2cCustomerId: 'cust-123',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('NOT_CONFIGURED');
                expect(result.error.status).toBe(503);
            }
        });

        it('maps scheduler error to provider error', async () => {
            vi.mocked(bookAppointment).mockResolvedValue({
                success: false,
                error: {
                    code: 'SCHEDULER_UNAVAILABLE',
                },
            } as SchedulerResult<BookingData>);

            const provider = createBffAppointmentProvider(mockContext);
            const result = await provider.bookAppointment({
                schedStartTime: '2026-10-26T10:00:00Z',
                schedEndTime: '2026-10-26T10:30:00Z',
                email: 'test@example.com',
                b2cCustomerId: 'cust-123',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('UNAVAILABLE');
                expect(result.error.status).toBe(502);
            }
        });
    });
});
