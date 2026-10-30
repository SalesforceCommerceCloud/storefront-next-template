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
import { createScapiAppointmentProvider } from './scapi-provider.server';

vi.mock('@/lib/api-clients.server');
vi.mock('@/lib/utils', () => ({
    extractResponseError: vi.fn(),
}));

import { createApiClients } from '@/lib/api-clients.server';
import { extractResponseError } from '@/lib/utils';

const mockContext = {} as RouterContextProvider;

describe('createScapiAppointmentProvider', () => {
    const mockAppointmentsClient = {
        getAppointmentAvailability: vi.fn(),
        createAppointment: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({
            appointments: mockAppointmentsClient,
        } as any);
    });

    describe('getAvailability', () => {
        it('returns slots on success', async () => {
            mockAppointmentsClient.getAppointmentAvailability.mockResolvedValue({
                data: {
                    slots: [
                        { startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z' },
                        { startTime: '2026-10-26T11:00:00Z', endTime: '2026-10-26T11:30:00Z' },
                    ],
                },
            });

            const provider = createScapiAppointmentProvider(mockContext);
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

        it('filters out invalid slots', async () => {
            mockAppointmentsClient.getAppointmentAvailability.mockResolvedValue({
                data: {
                    slots: [
                        { startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z' },
                        { startTime: '2026-10-26T11:00:00Z' }, // missing endTime
                        { endTime: '2026-10-26T11:30:00Z' }, // missing startTime
                        null,
                    ],
                },
            });

            const provider = createScapiAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.slots).toHaveLength(1);
            }
        });

        it('returns error with status from extractResponseError', async () => {
            mockAppointmentsClient.getAppointmentAvailability.mockRejectedValue(new Error('API error'));
            vi.mocked(extractResponseError).mockResolvedValue({
                status_code: '503',
                responseMessage: 'Service unavailable',
            } as any);

            const provider = createScapiAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('UNAVAILABLE');
                expect(result.error.status).toBe(503);
                expect(result.error.message).toBe('Service unavailable');
            }
        });

        it('clamps status to 400-599 range', async () => {
            mockAppointmentsClient.getAppointmentAvailability.mockRejectedValue(new Error('API error'));
            vi.mocked(extractResponseError).mockResolvedValue({
                status_code: '999',
                responseMessage: 'Invalid status',
            } as any);

            const provider = createScapiAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.status).toBe(502); // clamped default
            }
        });

        it('uses default status and message when extractResponseError throws', async () => {
            const error = new Error('Network error');
            mockAppointmentsClient.getAppointmentAvailability.mockRejectedValue(error);
            vi.mocked(extractResponseError).mockRejectedValue(new Error('Extract failed'));

            const provider = createScapiAppointmentProvider(mockContext);
            const result = await provider.getAvailability({
                startTime: '2026-10-26T10:00:00Z',
                endTime: '2026-10-26T12:00:00Z',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('UNAVAILABLE');
                expect(result.error.status).toBe(502);
                expect(result.error.message).toBe('Network error');
            }
        });
    });

    describe('bookAppointment', () => {
        it('returns serviceAppointmentId on success', async () => {
            mockAppointmentsClient.createAppointment.mockResolvedValue({
                data: {
                    serviceAppointmentId: 'SA-12345',
                },
            });

            const provider = createScapiAppointmentProvider(mockContext);
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
            }
        });

        it('returns error when serviceAppointmentId is missing', async () => {
            mockAppointmentsClient.createAppointment.mockResolvedValue({
                data: {},
            });

            const provider = createScapiAppointmentProvider(mockContext);
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
                expect(result.error.message).toBe('Scheduler did not return an appointment id');
            }
        });

        it('returns error with status from extractResponseError', async () => {
            mockAppointmentsClient.createAppointment.mockRejectedValue(new Error('API error'));
            vi.mocked(extractResponseError).mockResolvedValue({
                status_code: '400',
                responseMessage: 'Invalid request',
            } as any);

            const provider = createScapiAppointmentProvider(mockContext);
            const result = await provider.bookAppointment({
                schedStartTime: '2026-10-26T10:00:00Z',
                schedEndTime: '2026-10-26T10:30:00Z',
                email: 'test@example.com',
                b2cCustomerId: 'cust-123',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe('INVALID_REQUEST');
                expect(result.error.status).toBe(400);
                expect(result.error.message).toBe('Invalid request');
            }
        });

        it('uses default status and message when extractResponseError throws', async () => {
            const error = new Error('Booking failed');
            mockAppointmentsClient.createAppointment.mockRejectedValue(error);
            vi.mocked(extractResponseError).mockRejectedValue(new Error('Extract failed'));

            const provider = createScapiAppointmentProvider(mockContext);
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
                expect(result.error.message).toBe('Booking failed');
            }
        });
    });
});
