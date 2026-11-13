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
import { normalizeSalesforceMyDomain } from '@/lib/salesforce-domains.server';
import type { ServiceTerritoryOption } from '@/lib/appointment-scheduler/types';
import type { Logger } from '@/lib/logger';
import type { AppConfig } from '@/types/config';
import type {
    AvailabilityData,
    AvailabilityInput,
    AvailableSlot,
    BookingData,
    BookingInput,
    SchedulerCoreConfig,
    SchedulerError,
    SchedulerResult,
} from './types';

/** Escape a value for use inside a SOQL single-quoted string literal. */
/** Returns true when the value is a 15- or 18-character Salesforce record Id (alphanumeric only). */
function isSfRecordId(value: string): boolean {
    return /^[a-zA-Z0-9]{15}$/.test(value) || /^[a-zA-Z0-9]{18}$/.test(value);
}

function escapeSoql(value: string): string {
    // Escape backslashes first, then single quotes — order matters.
    // In SOQL, \ is the escape char so a trailing \ would cancel the closing '.
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Extract the first Salesforce Id from a SOQL query response, validating the shape at runtime. */
function extractFirstId(json: unknown): string | undefined {
    if (json === null || typeof json !== 'object' || !Array.isArray((json as Record<string, unknown>).records))
        return undefined;
    const first = (json as { records: unknown[] }).records[0];
    if (first === null || typeof first !== 'object') return undefined;
    const id = (first as Record<string, unknown>).Id;
    return typeof id === 'string' && id ? id : undefined;
}

/** Refresh the cached token this many seconds before it actually expires. */
const TOKEN_REFRESH_MARGIN_SECONDS = 300;
/** Conservative default token TTL when the Core token response omits `expires_in`. */
const DEFAULT_TOKEN_TTL_SECONDS = 1800;
/** Outbound request timeout for all Core calls. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Module-level client-credentials token cache, reused across warm Lambda invocations to avoid
 * one token exchange per availability/booking call. Keyed by `${clientId}|${origin}` so a
 * misconfiguration (or multi-org setup) never reuses a token against the wrong Core org.
 */
const _schedulerTokenCache = new Map<string, { token: string; expiry: number }>();

/** @internal Exported only for unit tests. */
export function _resetSchedulerTokenCacheForTest(): void {
    _schedulerTokenCache.clear();
}

/** {@link SchedulerCoreConfig} plus the merchant feature flag, as resolved from app config. */
export interface ResolvedSchedulerConfig extends SchedulerCoreConfig {
    enabled: boolean;
}

/**
 * Build the Core config the scheduler functions need from the template's app config, layering in
 * the server-only exact-host override. Returns `null` when the feature block is absent so routes
 * can treat it as disabled.
 *
 * @env SCHEDULER_MYDOMAIN_ALLOWED_HOST - Optional. Exact host that authorizes a non-production Core
 *   My Domain whose host does not end in `my.salesforce.com` (e.g. an internal sandbox pod).
 *   Example: `SCHEDULER_MYDOMAIN_ALLOWED_HOST=example.test1.my.pc-rnd.salesforce.com`.
 */
export function resolveSchedulerCoreConfig(config: AppConfig): ResolvedSchedulerConfig | null {
    const scheduler = config.scheduler;
    if (!scheduler) return null;
    return {
        enabled: scheduler.enabled,
        myDomain: scheduler.myDomain,
        clientId: scheduler.clientId,
        apiVersion: scheduler.apiVersion,
        territoryId: scheduler.territoryId,
        workTypeGroupId: scheduler.workTypeGroupId,
        parentRecordId: scheduler.parentRecordId,
        ...(scheduler.schedulingPolicyId ? { schedulingPolicyId: scheduler.schedulingPolicyId } : {}),
        ...(process.env.SCHEDULER_MYDOMAIN_ALLOWED_HOST
            ? { allowedHost: process.env.SCHEDULER_MYDOMAIN_ALLOWED_HOST }
            : {}),
    };
}

/** Raised when required Core configuration/secret is missing, so callers can map to NOT_CONFIGURED. */
class SchedulerNotConfiguredError extends Error {}

interface SchedulerOptions {
    fetchImpl?: typeof fetch;
    logger?: Logger;
    correlationId?: string;
}

function correlationHeaders(correlationId: string | undefined): Record<string, string> {
    return correlationId ? { 'correlation-id': correlationId } : {};
}

function boundedRetryAfter(value: string | null): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 3600 ? seconds : undefined;
}

/**
 * Resolve + validate the Core origin (SSRF guard). Returns `null` when the configured My Domain
 * is not a trusted `*.my.salesforce.com` host and is not authorized by the exact-host override.
 */
function resolveCoreOrigin(core: SchedulerCoreConfig): string | null {
    if (!core.myDomain || !core.clientId || !core.apiVersion) return null;
    return normalizeSalesforceMyDomain(core.myDomain, core.allowedHost);
}

/** Log the Core org's raw downstream error body (server-side only — never forwarded to the browser). */
async function logDownstreamError(logger: Logger | undefined, scope: string, response: Response): Promise<void> {
    if (!logger) return;
    let body: unknown;
    try {
        body = await response.clone().text();
    } catch (readError) {
        logger.error('Scheduler: failed to read downstream error body', {
            scope,
            status: response.status,
            error: readError,
        });
        return;
    }
    logger.error('Scheduler: downstream error response', {
        scope,
        status: response.status,
        statusText: response.statusText,
        body,
    });
}

/** Map a non-OK Core HTTP response to a typed {@link SchedulerError}. */
function mapHttpError(response: Response): SchedulerError {
    if (response.status === 400 || response.status === 404) {
        return { code: 'INVALID_REQUEST', retryable: false };
    }
    if (response.status === 401 || response.status === 403) {
        return { code: 'SCHEDULER_AUTHORIZATION', retryable: false };
    }
    if (response.status === 429) {
        const retryAfterSeconds = boundedRetryAfter(response.headers.get('Retry-After'));
        return {
            code: 'SCHEDULER_RATE_LIMITED',
            retryable: true,
            ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        };
    }
    return { code: 'SCHEDULER_UNAVAILABLE', retryable: [500, 502, 503, 504].includes(response.status) };
}

/**
 * Acquire a client-credentials access token for the Core org, cached per `${clientId}|${origin}`.
 *
 * @env SCHEDULER_CLIENT_SECRET - Required. The OAuth consumer secret for the Core client-credentials
 *   app. Server-only (never `PUBLIC__`). Example: `SCHEDULER_CLIENT_SECRET=0123...abcd`.
 */
async function acquireToken(origin: string, clientId: string, options: SchedulerOptions): Promise<string> {
    const { fetchImpl = fetch, logger, correlationId } = options;
    const cacheKey = `${clientId}|${origin}`;

    const cached = _schedulerTokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        logger?.debug('Scheduler: token cache hit');
        return cached.token;
    }

    const clientSecret = process.env.SCHEDULER_CLIENT_SECRET;
    if (!clientSecret) {
        throw new SchedulerNotConfiguredError('SCHEDULER_CLIENT_SECRET is not set in the environment variables.');
    }

    logger?.info('Scheduler: acquiring client-credentials token', { clientId });

    const response = await fetchImpl(`${origin}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...correlationHeaders(correlationId) },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
        }),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
        await logDownstreamError(logger, 'token', response);
        throw new Error(`Scheduler token request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof data.access_token !== 'string' || !data.access_token) {
        throw new Error('Scheduler token response did not contain an access_token');
    }
    const ttlSeconds = typeof data.expires_in === 'number' ? data.expires_in : DEFAULT_TOKEN_TTL_SECONDS;
    _schedulerTokenCache.set(cacheKey, {
        token: data.access_token,
        expiry: Date.now() + Math.max(ttlSeconds - TOKEN_REFRESH_MARGIN_SECONDS, 0) * 1000,
    });
    return data.access_token;
}

/**
 * Run an authenticated Core request, retrying once on a 401 after invalidating the cached token
 * (the token may have been revoked or expired early — Core access tokens are session-scoped and
 * the response carries no `expires_in`).
 *
 * Non-idempotent calls (e.g. POST booking) must pass `{ idempotent: false }` to skip the retry
 * and avoid creating a duplicate ServiceAppointment on a stale-token 401.
 */
async function withAuthRetry(
    origin: string,
    clientId: string,
    options: SchedulerOptions,
    call: (token: string) => Promise<Response>,
    retryOptions?: { idempotent?: boolean }
): Promise<Response> {
    const token = await acquireToken(origin, clientId, options);
    const response = await call(token);
    if (response.status !== 401 || retryOptions?.idempotent === false) return response;
    _schedulerTokenCache.delete(`${clientId}|${origin}`);
    const freshToken = await acquireToken(origin, clientId, options);
    return call(freshToken);
}

/**
 * Get consolidated appointment availability for the configured territory + work-type group via
 * Scheduler Connect REST (`POST /connect/scheduling/available-territory-slots`).
 *
 * The Connect REST response is wrapped in a `result` envelope (`result.territorySlots[].slots`);
 * callers reading `territorySlots` at the top level silently see zero slots. This unwraps it.
 */
export async function getAvailability(
    core: SchedulerCoreConfig,
    input: AvailabilityInput,
    options: SchedulerOptions = {}
): Promise<SchedulerResult<AvailabilityData>> {
    const { fetchImpl = fetch, logger, correlationId } = options;
    const origin = resolveCoreOrigin(core);
    if (!origin) {
        return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
    }

    const url = `${origin}/services/data/${core.apiVersion}/connect/scheduling/available-territory-slots`;

    try {
        // Resolve the ServiceTerritory Salesforce Id from the territory external id when provided.
        let territoryId = core.territoryId;
        if (input.territoryId) {
            try {
                const territoryIdSafe = input.territoryId;
                const resp = await withAuthRetry(origin, core.clientId, options, (token) =>
                    fetchImpl(
                        `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(isSfRecordId(territoryIdSafe) ? `SELECT Id FROM ServiceTerritory WHERE Id = '${escapeSoql(territoryIdSafe)}' LIMIT 1` : `SELECT Id FROM ServiceTerritory WHERE ExternalId__c = '${escapeSoql(territoryIdSafe)}' LIMIT 1`)}`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/json',
                                ...correlationHeaders(correlationId),
                            },
                            redirect: 'error' as const,
                            cache: 'no-store' as const,
                            credentials: 'omit' as const,
                            referrerPolicy: 'no-referrer' as const,
                            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                        }
                    )
                );
                if (resp.ok) {
                    const json: unknown = await resp.json();
                    const resolved = extractFirstId(json);
                    // When ExternalId__c lookup returns nothing, the input is already
                    // a Salesforce record Id (zero-provisioning: no ExternalId__c set).
                    territoryId = resolved ?? input.territoryId;
                }
            } catch (lookupError) {
                logger?.warn('Scheduler: territory lookup failed, using config fallback', {
                    territoryId: input.territoryId,
                    error: lookupError,
                });
            }
        }

        // Fetch the territory's IANA timezone from its OperatingHours so slot times can be displayed
        // in the boutique's local timezone rather than the shopper's browser timezone.
        let territoryTimezone: string | undefined;
        try {
            const token = await acquireToken(origin, core.clientId, options);
            const resp = await fetchImpl(
                `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(
                    `SELECT OperatingHours.TimeZone FROM ServiceTerritory WHERE Id = '${escapeSoql(territoryId)}' LIMIT 1`
                )}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        ...correlationHeaders(correlationId),
                    },
                    redirect: 'error' as const,
                    cache: 'no-store' as const,
                    credentials: 'omit' as const,
                    referrerPolicy: 'no-referrer' as const,
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                }
            );
            if (resp.ok) {
                const json = (await resp.json()) as {
                    records?: Array<{ OperatingHours?: { TimeZone?: string } }>;
                };
                const tz = json.records?.[0]?.OperatingHours?.TimeZone;
                if (tz) territoryTimezone = tz;
            }
        } catch {
            // non-fatal — component falls back to 'UTC'
        }

        // workTypeGroupId: prefer value carried from the shopper's WorkTypeOption selection
        // (passed via input.workTypeGroupId) — no extra SOQL needed. Falls back to config.
        const workTypeGroupId = input.workTypeGroupId ?? core.workTypeGroupId;

        const requestBody = JSON.stringify({
            startTime: input.startTime,
            endTime: input.endTime,
            territoryIds: [territoryId],
            workTypeGroupId,
            ...(core.schedulingPolicyId ? { schedulingPolicyId: core.schedulingPolicyId } : {}),
        });

        const response = await withAuthRetry(origin, core.clientId, options, (token) =>
            fetchImpl(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...correlationHeaders(correlationId),
                },
                body: requestBody,
                redirect: 'error',
                cache: 'no-store',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        );

        if (!response.ok) {
            await logDownstreamError(logger, 'availability', response);
            return { success: false, error: mapHttpError(response) };
        }

        const json = (await response.json()) as Record<string, unknown>;
        const envelope = (json?.result ?? json) as { territorySlots?: Array<{ slots?: unknown }> };
        const slots: AvailableSlot[] = (envelope.territorySlots ?? []).flatMap((territory) =>
            Array.isArray(territory?.slots)
                ? (territory.slots as unknown[]).flatMap((entry) => {
                      if (
                          entry === null ||
                          typeof entry !== 'object' ||
                          typeof (entry as Record<string, unknown>).startTime !== 'string' ||
                          typeof (entry as Record<string, unknown>).endTime !== 'string'
                      )
                          return [];
                      const slot = entry as AvailableSlot;
                      return [
                          {
                              startTime: slot.startTime,
                              endTime: slot.endTime,
                              ...(slot.resources ? { resources: slot.resources } : {}),
                          },
                      ];
                  })
                : []
        );
        return { success: true, data: { slots, ...(territoryTimezone ? { timezone: territoryTimezone } : {}) } };
    } catch (error) {
        if (error instanceof SchedulerNotConfiguredError) {
            return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
        }
        logger?.error('Scheduler: availability request failed', { error });
        return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
    }
}

/**
 * Book an appointment on the Core org: create a `ServiceAppointment` (no Contact — shopper identity
 * is carried on `b2cCustomerId__c`), then assign the configured required ServiceResource so the slot
 * is consumed (native anti-double-booking). The record-triggered Flow on the Core org sends the
 * confirmation email.
 */
export async function bookAppointment(
    core: SchedulerCoreConfig,
    input: BookingInput,
    options: SchedulerOptions = {}
): Promise<SchedulerResult<BookingData>> {
    const { fetchImpl = fetch, logger, correlationId } = options;
    const origin = resolveCoreOrigin(core);
    if (!origin) {
        return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
    }

    const jsonHeaders = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...correlationHeaders(correlationId),
    });
    const hardening = {
        redirect: 'error' as const,
        cache: 'no-store' as const,
        credentials: 'omit' as const,
        referrerPolicy: 'no-referrer' as const,
    };

    try {
        // Resolve ServiceTerritory, WorkType, and Advisor Salesforce Ids from external IDs in parallel.
        let territoryId = core.territoryId;
        let workTypeId: string | undefined;
        let advisorResourceId: string | undefined;

        // Capture optional inputs as locals so closures inside .then() retain the narrowed type.
        const advisorId = input.advisorId;
        const territoryExternalId = input.territoryId;
        const workTypeExternalId = input.workTypeId;

        // Resolve all external IDs in parallel (token is cached so the acquireToken calls are near-instant).
        const [advisorJson, territoryJson, workTypeJson] = await Promise.all([
            advisorId
                ? acquireToken(origin, core.clientId, options)
                      .then((tok) =>
                          fetchImpl(
                              `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(isSfRecordId(advisorId) ? `SELECT Id FROM ServiceResource WHERE Id = '${escapeSoql(advisorId)}' LIMIT 1` : `SELECT Id FROM ServiceResource WHERE ExternalId__c = '${escapeSoql(advisorId)}' LIMIT 1`)}`,
                              {
                                  headers: jsonHeaders(tok),
                                  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                                  ...hardening,
                              }
                          )
                      )
                      .then(async (r) => (r.ok ? ((await r.json()) as unknown) : null))
                      .catch((err: unknown) => {
                          logger?.warn('Scheduler: advisor lookup failed, booking proceeds without specific advisor', {
                              advisorId,
                              error: err,
                          });
                          return null;
                      })
                : null,
            territoryExternalId
                ? acquireToken(origin, core.clientId, options)
                      .then((tok) =>
                          fetchImpl(
                              `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(isSfRecordId(territoryExternalId) ? `SELECT Id FROM ServiceTerritory WHERE Id = '${escapeSoql(territoryExternalId)}' LIMIT 1` : `SELECT Id FROM ServiceTerritory WHERE ExternalId__c = '${escapeSoql(territoryExternalId)}' LIMIT 1`)}`,
                              {
                                  headers: jsonHeaders(tok),
                                  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                                  ...hardening,
                              }
                          )
                      )
                      .then(async (r) => (r.ok ? ((await r.json()) as unknown) : null))
                      .catch((err: unknown) => {
                          logger?.warn('Scheduler: territory lookup failed, using config fallback', {
                              territoryId: territoryExternalId,
                              error: err,
                          });
                          return null;
                      })
                : null,
            workTypeExternalId
                ? acquireToken(origin, core.clientId, options)
                      .then((tok) =>
                          fetchImpl(
                              `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(isSfRecordId(workTypeExternalId) ? `SELECT Id FROM WorkType WHERE Id = '${escapeSoql(workTypeExternalId)}' LIMIT 1` : `SELECT Id FROM WorkType WHERE ExternalId__c = '${escapeSoql(workTypeExternalId)}' LIMIT 1`)}`,
                              {
                                  headers: jsonHeaders(tok),
                                  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                                  ...hardening,
                              }
                          )
                      )
                      .then(async (r) => (r.ok ? ((await r.json()) as unknown) : null))
                      .catch((err: unknown) => {
                          logger?.warn('Scheduler: work type lookup failed, using config fallback', {
                              workTypeId: input.workTypeId,
                              error: err,
                          });
                          return null;
                      })
                : null,
        ]);

        const resolvedAdvisor = extractFirstId(advisorJson);
        if (resolvedAdvisor) advisorResourceId = resolvedAdvisor;

        const resolvedTerritory = extractFirstId(territoryJson);
        if (resolvedTerritory) territoryId = resolvedTerritory;

        const resolvedWorkType = extractFirstId(workTypeJson);
        if (resolvedWorkType) workTypeId = resolvedWorkType;

        // Note: TOCTOU race — two concurrent requests can both pass this check and
        // double-assign the same advisor. This is low-stakes for the POC (Core's
        // AssignedResource create may reject the second with a conflict); a production
        // hardening would use a short-lived distributed lock or atomic claim. See HLD §Security.

        // ── Pre-booking advisor gate ──────────────────────────────────────────────
        // When no specific advisor is requested and the territory uses dynamic resource
        // selection (core.serviceResourceId absent), find the free advisor BEFORE creating
        // the SA. If all advisors are booked for this slot, return 409 immediately to avoid
        // creating orphan ServiceAppointments that cannot be assigned.
        let preselectedResourceId: string | undefined = advisorResourceId;
        if (!advisorResourceId && territoryId) {
            try {
                const token = await acquireToken(origin, core.clientId, options);
                const membersResp = await fetchImpl(
                    `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(
                        `SELECT ServiceResourceId FROM ServiceTerritoryMember WHERE ServiceTerritoryId = '${territoryId}' AND ServiceResource.IsActive = true AND TerritoryType = 'P' ORDER BY ServiceResource.Name`
                    )}`,
                    { headers: jsonHeaders(token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...hardening }
                );
                if (membersResp.ok) {
                    const membersJson = (await membersResp.json()) as {
                        records?: Array<{ ServiceResourceId: string }>;
                    };
                    const advisorIds = (membersJson.records ?? []).map((r) => r.ServiceResourceId);
                    if (advisorIds.length > 0) {
                        const busyResp = await fetchImpl(
                            `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(
                                `SELECT ServiceResourceId FROM AssignedResource WHERE ServiceResourceId IN (${advisorIds.map((id) => `'${id}'`).join(',')}) AND ServiceAppointment.SchedStartTime < ${input.schedEndTime} AND ServiceAppointment.SchedEndTime > ${input.schedStartTime} AND ServiceAppointment.Status != 'Canceled' AND IsRequiredResource = true`
                            )}`,
                            {
                                headers: jsonHeaders(token),
                                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                                ...hardening,
                            }
                        );
                        const busyAdvisors = new Set<string>();
                        if (busyResp.ok) {
                            const busyJson = (await busyResp.json()) as {
                                records?: Array<{ ServiceResourceId: string }>;
                            };
                            for (const row of busyJson.records ?? []) busyAdvisors.add(row.ServiceResourceId);
                        }
                        const freeAdvisors = advisorIds.filter((id) => !busyAdvisors.has(id));
                        if (freeAdvisors.length === 0) {
                            // All advisors are booked — slot is fully taken. Reject before creating an orphan SA.
                            return {
                                success: false,
                                error: { code: 'SCHEDULER_UNAVAILABLE' as const, retryable: false },
                            };
                        }
                        preselectedResourceId = freeAdvisors[0];
                    }
                }
            } catch {
                // non-fatal — proceed without pre-check; assignment step will handle it best-effort
                logger?.warn('Scheduler: pre-booking advisor gate failed, proceeding without pre-check');
            }
        }

        const appointmentResponse = await withAuthRetry(
            origin,
            core.clientId,
            options,
            (token) =>
                fetchImpl(`${origin}/services/data/${core.apiVersion}/sobjects/ServiceAppointment`, {
                    method: 'POST',
                    headers: jsonHeaders(token),
                    body: JSON.stringify({
                        ParentRecordId: core.parentRecordId,
                        ServiceTerritoryId: territoryId,
                        WorkTypeId: workTypeId,
                        Status: 'Scheduled',
                        SchedStartTime: input.schedStartTime,
                        SchedEndTime: input.schedEndTime,
                        Email: input.email,
                        ExternalId__c: input.shopperExternalId,
                        ...(input.subject ? { Subject: input.subject } : {}),
                    }),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                    ...hardening,
                }),
            { idempotent: false }
        );

        if (!appointmentResponse.ok) {
            await logDownstreamError(logger, 'booking', appointmentResponse);
            return { success: false, error: mapHttpError(appointmentResponse) };
        }

        const created = (await appointmentResponse.json()) as { id?: unknown };
        if (typeof created.id !== 'string' || !created.id) {
            return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: false } };
        }
        const serviceAppointmentId = created.id;

        // Assign the pre-selected resource (resolved before SA creation in the gate above).
        // preselectedResourceId is already the correct free advisor — no second lookup needed.
        const resolvedResourceId: string | undefined = preselectedResourceId;

        let assignedResourceId: string | undefined;
        if (resolvedResourceId) {
            const resourceResponse = await withAuthRetry(
                origin,
                core.clientId,
                options,
                (token) =>
                    fetchImpl(`${origin}/services/data/${core.apiVersion}/sobjects/AssignedResource`, {
                        method: 'POST',
                        headers: jsonHeaders(token),
                        body: JSON.stringify({
                            ServiceAppointmentId: serviceAppointmentId,
                            ServiceResourceId: resolvedResourceId,
                            IsRequiredResource: true,
                        }),
                        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                        ...hardening,
                    }),
                { idempotent: false }
            );
            if (resourceResponse.ok) {
                const resource = (await resourceResponse.json()) as { id?: unknown };
                assignedResourceId = typeof resource.id === 'string' ? resource.id : undefined;
            } else {
                await logDownstreamError(logger, 'assigned-resource', resourceResponse);
                // Best-effort resource assignment. If it fails, the SA is still created (the shopper's
                // booking is confirmed) but the slot capacity is not consumed — double-booking becomes
                // possible for that specific slot. This is the intentional trade-off for the POC;
                // production hardening should retry or cancel-and-retry the SA on assignment failure.
                logger?.warn('Scheduler: appointment created but resource assignment failed (slot not consumed)', {
                    serviceAppointmentId,
                });
            }
        }

        return { success: true, data: { serviceAppointmentId, ...(assignedResourceId ? { assignedResourceId } : {}) } };
    } catch (error) {
        if (error instanceof SchedulerNotConfiguredError) {
            return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
        }
        logger?.error('Scheduler: booking request failed', { error });
        return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
    }
}

interface WorkTypesSuccess {
    success: true;
    workTypes: { id: string; name: string; durationMinutes: number; workTypeGroupId: string }[];
}
interface WorkTypesFailure {
    success: false;
    error: { code: string; retryable: boolean };
}

/**
 * Fetch the WorkType options for the appointment wizard's "Why Are You Visiting" step.
 *
 * Queries all WorkTypes in the configured WorkTypeGroup via `WorkTypeGroupMember` (org-level).
 * When `storeId` is provided, first resolves the territory's WorkTypeGroup from its
 * `ServiceTerritoryWorkType` anchor record — uses that group instead of the global config.
 *
 * Each returned work type includes `workTypeGroupId` so `getAvailability()` can use it
 * directly without an additional SOQL lookup.
 */
export async function getWorkTypes(
    core: SchedulerCoreConfig,
    input: { territoryId?: string } = {},
    options: SchedulerOptions = {}
): Promise<WorkTypesSuccess | WorkTypesFailure> {
    const { logger } = options;
    try {
        const origin = resolveCoreOrigin(core);
        if (!origin) throw new SchedulerNotConfiguredError('Core My Domain not configured');

        // Resolve workTypeGroupId per territory using two sequential SOQL queries:
        // Step 1: get the territory's STWT anchor WorkTypeId (territory-specific)
        // Step 2: get that WorkType's WorkTypeGroupId via WorkTypeGroupMember
        // ServiceTerritoryWorkType now has READ in the permission set.
        let workTypeGroupId: string | undefined;
        if (input.territoryId) {
            try {
                // Step 1 — territory's STWT anchor
                const stwtFilter = isSfRecordId(input.territoryId)
                    ? `ServiceTerritoryId = '${escapeSoql(input.territoryId)}'`
                    : `ServiceTerritory.ExternalId__c = '${escapeSoql(input.territoryId)}'`;
                const stwtResp = await withAuthRetry(origin, core.clientId, options, (token) =>
                    fetch(
                        `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(`SELECT WorkTypeId FROM ServiceTerritoryWorkType WHERE ${stwtFilter} LIMIT 1`)}`,
                        {
                            headers: { Authorization: `Bearer ${token}` },
                            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                        }
                    )
                );
                if (stwtResp.ok) {
                    const stwtJson = (await stwtResp.json()) as { records?: Array<{ WorkTypeId: string }> };
                    const anchorWtId = stwtJson.records?.[0]?.WorkTypeId;
                    if (anchorWtId) {
                        // Step 2 — WorkTypeGroup for that specific WorkType
                        const wtgResp = await withAuthRetry(origin, core.clientId, options, (token) =>
                            fetch(
                                `${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(`SELECT WorkTypeGroupId FROM WorkTypeGroupMember WHERE WorkTypeId = '${escapeSoql(anchorWtId)}' LIMIT 1`)}`,
                                {
                                    headers: { Authorization: `Bearer ${token}` },
                                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                                }
                            )
                        );
                        if (wtgResp.ok) {
                            const wtgJson = (await wtgResp.json()) as { records?: Array<{ WorkTypeGroupId: string }> };
                            workTypeGroupId = wtgJson.records?.[0]?.WorkTypeGroupId;
                            if (workTypeGroupId)
                                logger?.info('Scheduler: resolved WorkTypeGroupId for territory', {
                                    territoryId: input.territoryId,
                                    workTypeGroupId,
                                });
                        }
                    }
                }
            } catch (lookupError) {
                logger?.warn('Scheduler: territory WorkTypeGroup lookup failed', {
                    territoryId: input.territoryId,
                    error: lookupError,
                });
            }
        }

        workTypeGroupId ??= core.workTypeGroupId;

        if (!workTypeGroupId) {
            return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
        }

        // Fetch all WorkTypes via WorkTypeGroupMember relationship — avoids nested-subquery
        // FLS issues with certain fields. Results are scoped to the resolved group.
        const soql = `SELECT WorkType.Id, WorkType.Name, WorkType.EstimatedDuration FROM WorkTypeGroupMember WHERE WorkTypeGroupId = '${escapeSoql(workTypeGroupId)}' ORDER BY WorkType.Name ASC`;
        const resp = await withAuthRetry(origin, core.clientId, options, (token) =>
            fetch(`${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(soql)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        );
        if (!resp.ok) {
            logger?.warn('Scheduler: WorkType query failed', { status: resp.status });
            return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
        }

        const json = (await resp.json()) as {
            records?: Array<{ WorkType?: { Id: string; Name: string; EstimatedDuration?: number } }>;
        };
        if (!json || !Array.isArray(json.records)) {
            return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
        }
        logger?.info('Scheduler: WorkType records returned', {
            count: json.records?.length ?? 0,
            groupId: workTypeGroupId,
        });
        const effectiveGroupId = workTypeGroupId;
        // Deduplicate by WorkType.Name — re-seeding can create multiple WorkType records with the
        // same name but different Salesforce IDs, all in the same WorkTypeGroup.
        const seen = new Set<string>();
        const workTypes = (json.records ?? [])
            .filter((r) => r.WorkType?.Id && r.WorkType.Name && !seen.has(r.WorkType.Name) && seen.add(r.WorkType.Name))
            .map((r) => ({
                id: r.WorkType?.Id ?? '',
                name: r.WorkType?.Name ?? '',
                durationMinutes: r.WorkType?.EstimatedDuration ?? 30,
                workTypeGroupId: effectiveGroupId,
            }));
        return { success: true, workTypes };
    } catch (error) {
        if (error instanceof SchedulerNotConfiguredError) {
            return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
        }
        logger?.error('Scheduler: getWorkTypes failed', { error });
        return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
    }
}

/** Shape returned by the Core SOQL ServiceTerritory query. */
interface ServiceTerritoryRecord {
    Id: string;
    Name: string;
    ExternalId__c?: string;
    SN_SiteId__c?: string;
    SN_Address1__c?: string;
    SN_City__c?: string;
    SN_PostalCode__c?: string;
    SN_StateCode__c?: string;
    SN_CountryCode__c?: string;
    SN_Phone__c?: string;
    SN_Latitude__c?: number;
    SN_Longitude__c?: number;
    OperatingHours?: { TimeZone?: string };
}

interface ServiceTerritoriesSuccess {
    success: true;
    territories: ServiceTerritoryOption[];
}
interface ServiceTerritoriesFailure {
    success: false;
    error: { code: string; retryable: boolean };
}

/**
 * Fetch all active service territories (boutiques) that have a `StoreId__c` set.
 *
 * Used by the appointment wizard's store-selection step to let shoppers choose
 * a boutique. Returns each territory's B2C store id, display name, timezone (from
 * its linked OperatingHours), and optional per-territory WorkTypeGroupId.
 */
export async function getServiceTerritories(
    core: SchedulerCoreConfig,
    input: { siteId?: string } = {},
    options: SchedulerOptions = {}
): Promise<ServiceTerritoriesSuccess | ServiceTerritoriesFailure> {
    const { logger } = options;
    try {
        const origin = resolveCoreOrigin(core);
        if (!origin) throw new SchedulerNotConfiguredError('Core My Domain not configured');

        // Filter by SN_SiteId__c when siteId is provided — scopes territories per B2C site.
        // Without siteId, returns all active territories (zero-provisioning: no ExternalId__c filter).
        const siteFilter = input.siteId ? ` AND SN_SiteId__c = '${escapeSoql(input.siteId)}'` : '';
        const soql = `SELECT Id, Name, ExternalId__c, SN_SiteId__c, SN_Address1__c, SN_City__c, SN_PostalCode__c, SN_StateCode__c, SN_CountryCode__c, SN_Phone__c, SN_Latitude__c, SN_Longitude__c, OperatingHours.TimeZone FROM ServiceTerritory WHERE IsActive = true${siteFilter} ORDER BY Name ASC`;
        const resp = await withAuthRetry(origin, core.clientId, options, (token) =>
            fetch(`${origin}/services/data/${core.apiVersion}/query?q=${encodeURIComponent(soql)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        );
        if (!resp.ok) {
            logger?.warn('Scheduler: ServiceTerritory query failed', { status: resp.status });
            return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
        }
        const json = (await resp.json()) as { records?: ServiceTerritoryRecord[] };
        if (!json || !Array.isArray(json.records)) {
            return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
        }
        const territories = (json.records ?? []).map((r) => ({
            id: r.ExternalId__c ?? r.Id,
            sfId: r.Id,
            name: r.Name,
            timezone: r.OperatingHours?.TimeZone ?? 'UTC',
            ...(r.ExternalId__c ? { externalId: r.ExternalId__c } : {}),
            ...(r.SN_SiteId__c ? { siteId: r.SN_SiteId__c } : {}),
            ...(r.SN_Address1__c ? { address1: r.SN_Address1__c } : {}),
            ...(r.SN_City__c ? { city: r.SN_City__c } : {}),
            ...(r.SN_PostalCode__c ? { postalCode: r.SN_PostalCode__c } : {}),
            ...(r.SN_StateCode__c ? { stateCode: r.SN_StateCode__c } : {}),
            ...(r.SN_CountryCode__c ? { countryCode: r.SN_CountryCode__c } : {}),
            ...(r.SN_Phone__c ? { phone: r.SN_Phone__c } : {}),
            ...(r.SN_Latitude__c != null ? { latitude: r.SN_Latitude__c } : {}),
            ...(r.SN_Longitude__c != null ? { longitude: r.SN_Longitude__c } : {}),
        }));
        return { success: true, territories };
    } catch (error) {
        if (error instanceof SchedulerNotConfiguredError) {
            return { success: false, error: { code: 'SCHEDULER_NOT_CONFIGURED', retryable: false } };
        }
        logger?.error('Scheduler: getServiceTerritories failed', { error });
        return { success: false, error: { code: 'SCHEDULER_UNAVAILABLE', retryable: true } };
    }
}
