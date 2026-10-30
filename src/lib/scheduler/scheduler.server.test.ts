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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@/types/config';
import {
    _resetSchedulerTokenCacheForTest,
    bookAppointment,
    getAvailability,
    resolveSchedulerCoreConfig,
} from './scheduler.server';
import type { SchedulerCoreConfig } from './types';

const core: SchedulerCoreConfig = {
    myDomain: 'acme.my.salesforce.com',
    clientId: 'client-123',
    apiVersion: 'v64.0',
    territoryId: '0HhSB0000044Z3J0AU',
    workTypeGroupId: '0VSSB0000002ojt4AA',
    workTypeId: '08qSB000000HdEfYAK',
    parentRecordId: '001SB000026inYPYAY',
    serviceResourceId: '0HnSB000000ZkUb0AK',
};

function mockResponse(opts: { ok?: boolean; status?: number; json?: unknown; retryAfter?: string | null }): Response {
    const status = opts.status ?? (opts.ok === false ? 500 : 200);
    const ok = opts.ok ?? (status >= 200 && status < 300);
    const jsonBody = opts.json ?? {};
    return {
        ok,
        status,
        statusText: 'mock',
        headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? (opts.retryAfter ?? null) : null) },
        json: () => Promise.resolve(jsonBody),
        clone: () => ({ text: () => Promise.resolve(JSON.stringify(jsonBody)) }),
        text: () => Promise.resolve(JSON.stringify(jsonBody)),
    } as unknown as Response;
}

const tokenOk = () => mockResponse({ json: { access_token: 'tok-1', expires_in: 1800 } });
const availabilityOk = (slots: Array<{ startTime: string; endTime: string }>) =>
    mockResponse({ json: { result: { territorySlots: [{ slots }] } } });
// Simulates the OperatingHours.TimeZone query added after the territory-id lookup.
const timezoneOk = (tz = 'Europe/London') =>
    mockResponse({ json: { records: [{ OperatingHours: { TimeZone: tz } }] } });

describe('scheduler.server', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        _resetSchedulerTokenCacheForTest();
        vi.stubEnv('SCHEDULER_CLIENT_SECRET', 'super-secret');
    });

    describe('getAvailability', () => {
        it('acquires a token and returns slots, unwrapping the `result` envelope', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(timezoneOk())
                .mockResolvedValueOnce(
                    availabilityOk([{ startTime: '2026-10-26T09:00:00.000Z', endTime: '2026-10-26T10:00:00.000Z' }])
                );

            const result = await getAvailability(
                core,
                { startTime: '2026-10-26T00:00:00.000Z', endTime: '2026-10-31T00:00:00.000Z' },
                { fetchImpl }
            );

            expect(result).toEqual({
                success: true,
                data: {
                    slots: [{ startTime: '2026-10-26T09:00:00.000Z', endTime: '2026-10-26T10:00:00.000Z' }],
                    timezone: 'Europe/London',
                },
            });
            expect(fetchImpl.mock.calls[0][0]).toBe('https://acme.my.salesforce.com/services/oauth2/token');
            expect(fetchImpl.mock.calls[2][0]).toBe(
                'https://acme.my.salesforce.com/services/data/v64.0/connect/scheduling/available-territory-slots'
            );
        });

        it('reuses the cached token across calls', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(timezoneOk())
                .mockResolvedValueOnce(availabilityOk([]))
                .mockResolvedValueOnce(timezoneOk())
                .mockResolvedValueOnce(availabilityOk([]));

            const input = { startTime: '2026-10-26T00:00:00.000Z', endTime: '2026-10-31T00:00:00.000Z' };
            await getAvailability(core, input, { fetchImpl });
            await getAvailability(core, input, { fetchImpl });

            // 1 token fetch + (1 timezone + 1 availability) × 2 calls (token reused on the second call).
            expect(fetchImpl).toHaveBeenCalledTimes(5);
            expect(fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith('/oauth2/token'))).toHaveLength(1);
        });

        it('retries once on a 401 after invalidating the cached token', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(timezoneOk())
                .mockResolvedValueOnce(mockResponse({ ok: false, status: 401 }))
                .mockResolvedValueOnce(mockResponse({ json: { access_token: 'tok-2', expires_in: 1800 } }))
                .mockResolvedValueOnce(availabilityOk([]));

            const result = await getAvailability(
                core,
                { startTime: '2026-10-26T00:00:00.000Z', endTime: '2026-10-31T00:00:00.000Z' },
                { fetchImpl }
            );

            expect(result.success).toBe(true);
            expect(fetchImpl).toHaveBeenCalledTimes(5);
        });

        it('maps a 429 to SCHEDULER_RATE_LIMITED with Retry-After', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(timezoneOk())
                .mockResolvedValueOnce(mockResponse({ ok: false, status: 429, retryAfter: '30' }));

            const result = await getAvailability(
                core,
                { startTime: '2026-10-26T00:00:00.000Z', endTime: '2026-10-31T00:00:00.000Z' },
                { fetchImpl }
            );

            expect(result).toEqual({
                success: false,
                error: { code: 'SCHEDULER_RATE_LIMITED', retryable: true, retryAfterSeconds: 30 },
            });
        });

        it('returns SCHEDULER_NOT_CONFIGURED when the secret is missing (no outbound call)', async () => {
            vi.stubEnv('SCHEDULER_CLIENT_SECRET', '');
            const fetchImpl = vi.fn();

            const result = await getAvailability(
                core,
                { startTime: '2026-10-26T00:00:00.000Z', endTime: '2026-10-31T00:00:00.000Z' },
                { fetchImpl }
            );

            expect(result).toEqual({ success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } });
            expect(fetchImpl).not.toHaveBeenCalled();
        });

        it('returns SCHEDULER_NOT_CONFIGURED for an untrusted My Domain (SSRF guard)', async () => {
            const fetchImpl = vi.fn();

            const result = await getAvailability(
                { ...core, myDomain: 'evil.example.com' },
                { startTime: '2026-10-26T00:00:00.000Z', endTime: '2026-10-31T00:00:00.000Z' },
                { fetchImpl }
            );

            expect(result).toEqual({ success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } });
            expect(fetchImpl).not.toHaveBeenCalled();
        });
    });

    describe('bookAppointment', () => {
        const booking = {
            schedStartTime: '2026-10-26T09:00:00.000Z',
            schedEndTime: '2026-10-26T10:00:00.000Z',
            email: 'shopper@example.com',
            b2cCustomerId: 'cust-abc',
        };

        it('creates the ServiceAppointment and assigns the required resource', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'sa-1', success: true } }))
                .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'ar-1', success: true } }));

            const result = await bookAppointment(core, booking, { fetchImpl });

            expect(result).toEqual({
                success: true,
                data: { serviceAppointmentId: 'sa-1', assignedResourceId: 'ar-1' },
            });
            const saCall = fetchImpl.mock.calls[1];
            expect(saCall[0]).toBe('https://acme.my.salesforce.com/services/data/v64.0/sobjects/ServiceAppointment');
            const saBody = JSON.parse(saCall[1].body);
            expect(saBody.b2cCustomerId__c).toBe('cust-abc');
            expect(saBody.Status).toBe('Scheduled');
        });

        it('still succeeds when resource assignment fails (appointment exists, slot not consumed)', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'sa-1' } }))
                .mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }));

            const result = await bookAppointment(core, booking, { fetchImpl });

            expect(result).toEqual({ success: true, data: { serviceAppointmentId: 'sa-1' } });
        });

        it('maps a 400 from the Core booking call to INVALID_REQUEST', async () => {
            const fetchImpl = vi
                .fn()
                .mockResolvedValueOnce(tokenOk())
                .mockResolvedValueOnce(mockResponse({ ok: false, status: 400 }));

            const result = await bookAppointment(core, booking, { fetchImpl });

            expect(result).toEqual({ success: false, error: { code: 'INVALID_REQUEST', retryable: false } });
        });

        describe('dynamic advisor selection (no serviceResourceId in config)', () => {
            const coreNoResource = { ...core, serviceResourceId: undefined };
            const advisorA = '0HnSB000000advisor1';
            const advisorB = '0HnSB000000advisor2';

            const membersResponse = mockResponse({
                json: { records: [{ ServiceResourceId: advisorA }, { ServiceResourceId: advisorB }] },
            });

            it('picks the first free advisor when both are available', async () => {
                const fetchImpl = vi
                    .fn()
                    .mockResolvedValueOnce(tokenOk())
                    // territory members query
                    .mockResolvedValueOnce(membersResponse)
                    // busy advisors query → none busy
                    .mockResolvedValueOnce(mockResponse({ json: { records: [] } }))
                    // SA create
                    .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'sa-1' } }))
                    // AR create
                    .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'ar-1' } }));

                const result = await bookAppointment(coreNoResource, booking, { fetchImpl });

                expect(result).toEqual({
                    success: true,
                    data: { serviceAppointmentId: 'sa-1', assignedResourceId: 'ar-1' },
                });
                // AR was created with advisorA (first alphabetically / first returned)
                const arBody = JSON.parse(fetchImpl.mock.calls[4][1].body as string);
                expect(arBody.ServiceResourceId).toBe(advisorA);
            });

            it('skips a busy advisor and picks the next free one', async () => {
                const fetchImpl = vi
                    .fn()
                    .mockResolvedValueOnce(tokenOk())
                    // territory members
                    .mockResolvedValueOnce(membersResponse)
                    // busy advisors → advisorA is busy
                    .mockResolvedValueOnce(mockResponse({ json: { records: [{ ServiceResourceId: advisorA }] } }))
                    // SA create
                    .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'sa-2' } }))
                    // AR create
                    .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'ar-2' } }));

                const result = await bookAppointment(coreNoResource, booking, { fetchImpl });

                expect(result).toEqual({
                    success: true,
                    data: { serviceAppointmentId: 'sa-2', assignedResourceId: 'ar-2' },
                });
                // AR was created with advisorB (A was busy)
                const arBody = JSON.parse(fetchImpl.mock.calls[4][1].body as string);
                expect(arBody.ServiceResourceId).toBe(advisorB);
            });

            it('returns SCHEDULER_UNAVAILABLE (409) when all advisors are busy — no SA created', async () => {
                const fetchImpl = vi
                    .fn()
                    .mockResolvedValueOnce(tokenOk())
                    // territory members
                    .mockResolvedValueOnce(membersResponse)
                    // busy advisors → both busy
                    .mockResolvedValueOnce(
                        mockResponse({
                            json: { records: [{ ServiceResourceId: advisorA }, { ServiceResourceId: advisorB }] },
                        })
                    );
                // NOTE: no SA create call — gate returns before creating the SA

                const result = await bookAppointment(coreNoResource, booking, { fetchImpl });

                expect(result).toEqual({ success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: false } });
                // Only 3 fetch calls: token + members + busy check (no SA create)
                expect(fetchImpl).toHaveBeenCalledTimes(3);
            });

            it('resolves advisorId via AdvisorId__c External ID when provided', async () => {
                const fetchImpl = vi
                    .fn()
                    .mockResolvedValueOnce(tokenOk())
                    // AdvisorId__c lookup → resolves to advisorB
                    .mockResolvedValueOnce(mockResponse({ json: { records: [{ Id: advisorB }] } }))
                    // SA create
                    .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'sa-3' } }))
                    // AR create
                    .mockResolvedValueOnce(mockResponse({ status: 201, json: { id: 'ar-3' } }));

                const result = await bookAppointment(
                    coreNoResource,
                    { ...booking, advisorId: 'ln-boutique-london-2' },
                    { fetchImpl }
                );

                expect(result).toEqual({
                    success: true,
                    data: { serviceAppointmentId: 'sa-3', assignedResourceId: 'ar-3' },
                });
                // AR was created with advisorB (from AdvisorId__c lookup)
                const arBody = JSON.parse(fetchImpl.mock.calls[3][1].body as string);
                expect(arBody.ServiceResourceId).toBe(advisorB);
                // No territory members query — specific advisor was requested
                expect(fetchImpl).toHaveBeenCalledTimes(4);
            });
        });
    });

    describe('resolveSchedulerCoreConfig', () => {
        it('returns null when the scheduler config block is absent', () => {
            expect(resolveSchedulerCoreConfig({} as AppConfig)).toBeNull();
        });

        it('maps app config and layers in the server-only allowed-host override', () => {
            vi.stubEnv('SCHEDULER_MYDOMAIN_ALLOWED_HOST', 'orgfarm.test1.my.pc-rnd.salesforce.com');
            const config = {
                scheduler: {
                    enabled: true,
                    myDomain: 'acme.my.salesforce.com',
                    clientId: 'client-123',
                    apiVersion: 'v64.0',
                    territoryId: 't1',
                    workTypeGroupId: 'g1',
                    workTypeId: 'w1',
                    parentRecordId: 'a1',
                },
            } as AppConfig;

            expect(resolveSchedulerCoreConfig(config)).toEqual({
                enabled: true,
                myDomain: 'acme.my.salesforce.com',
                clientId: 'client-123',
                apiVersion: 'v64.0',
                territoryId: 't1',
                workTypeGroupId: 'g1',
                workTypeId: 'w1',
                parentRecordId: 'a1',
                allowedHost: 'orgfarm.test1.my.pc-rnd.salesforce.com',
            });
        });
    });
});
