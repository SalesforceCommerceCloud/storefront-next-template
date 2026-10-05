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
import { createLocalJWKSet, type JWTPayload, jwtVerify } from 'jose';
import { type RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';

export type NotifyType = 'passwordless-magic-link' | 'password-reset' | 'otp' | 'glo-access-code';

export type NotifyPayload =
    | { type: 'passwordless-magic-link'; recipient: string; data: { magicLinkPath: string } }
    | { type: 'password-reset'; recipient: string; data: { magicLinkPath: string } }
    | { type: 'otp'; recipient: string; data: { token: string } }
    | { type: 'glo-access-code'; recipient: string; data: { orderNo: string; accessCode: string } };

/**
 * Sends a transactional notification via the SCAPI Custom API (`POST /notify`).
 *
 * The payload is forwarded to the `app_storefrontnext_base` cartridge, which
 * renders the appropriate ISML template and delivers the message. To change
 * how notifications are sent — or to route them through a different provider —
 * customize `cartridge/scripts/helpers/sendNotification.js`.
 *
 * Authentication uses the shopper's existing SLAS token, which must include
 * the `c_sfnext_notify` scope. Run `sfnext setup-base-cartridge` once after
 * project setup to register this scope on the SLAS client.
 */
export async function sendNotification(
    context: Readonly<RouterContextProvider>,
    payload: NotifyPayload
): Promise<void> {
    const clients = createApiClients(context);
    await clients.sfnextNotify.notify({ params: {}, body: payload });
}

/**
 * Validates the SLAS callback token by fetching JWKS directly from SLAS and
 * verifying the token signature and algorithm. The issuer tenant ID in the
 * verified payload is compared against the configured organization ID to
 * prevent tokens issued for other tenants from being accepted.
 */
export async function validateSlasCallbackToken(
    context: Readonly<RouterContextProvider>,
    token: string
): Promise<JWTPayload> {
    const config = getConfig(context);
    if (!config) {
        throw new Error('Runtime configuration not found in context');
    }

    const configTenantId = config.commerce.api.organizationId.replace(/^f_ecom_/, '');

    try {
        const logger = getLogger(context);
        const jwks = await createJWKSet(context, logger);
        // TODO: Add audience constraint once the SLAS callback token aud claim format is confirmed.
        const { payload: validatedPayload } = await jwtVerify(token, jwks, { algorithms: ['RS256', 'ES256'] });

        // Extract tenant ID from the verified payload's iss claim.
        // Handles multiple issuer formats:
        //   URL format:   "https://zzrf-001.dx.commercecloud.salesforce.com/..." → "zzrf-001"
        //   Simple URL:   "https://zzrf_001/..."                                 → "zzrf_001"
        //   Path format:  "slas/dev/zysg_001"                                   → "zysg_001"
        const issClaim = validatedPayload.iss;
        if (!issClaim) {
            throw new Error('Invalid token: missing or invalid issuer claim');
        }

        // Try URL format first (segment after "//"), then fall back to last path segment
        const urlMatch = issClaim.match(/\/\/([a-zA-Z0-9_-]+)/);
        const tenantId = urlMatch?.[1] ?? issClaim.split('/').at(-1);
        if (!tenantId) {
            throw new Error('Invalid token: unable to extract tenant ID');
        }

        // Normalize hyphens to underscores: production SLAS issuer URLs use hyphens
        // (e.g. "zzrf-001.dx.commercecloud.salesforce.com") but organizationId uses
        // underscores (e.g. "f_ecom_zzrf_001" → configTenantId "zzrf_001").
        if (tenantId.replace(/-/g, '_') !== configTenantId) {
            throw new Error(
                `The tenant ID in your configuration ("${configTenantId}") does not match the tenant ID in the SLAS callback token ("${tenantId}").`
            );
        }

        return validatedPayload;
    } catch (error) {
        throw new Error(`SLAS Token Validation Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Creates a JWKS key set for SLAS JWT validation.
 *
 * Resolution order:
 * 1. `SLAS_JWKS_JSON` env var — preloaded JWKS JSON, bypasses the network fetch.
 *    Use this when the SLAS JWKS endpoint is not reachable from the Lambda
 *    (e.g. Cloudflare blocks the Lambda IP range on sandbox environments).
 *    Value: the JSON string returned by the SLAS JWKS endpoint.
 *    Example: `SLAS_JWKS_JSON='{"keys":[...]}'`
 * 2. Network fetch from the SLAS JWKS endpoint derived from `shortCode` + `organizationId`.
 *
 * @env SLAS_JWKS_JSON - Optional. Pre-loaded JWKS JSON string.
 */
async function createJWKSet(context: Readonly<RouterContextProvider>, logger: ReturnType<typeof getLogger>) {
    const jwksJson = process.env.SLAS_JWKS_JSON;
    if (jwksJson) {
        const jwks = JSON.parse(jwksJson) as { keys: object[] };
        if (!Array.isArray(jwks?.keys) || jwks.keys.length === 0) {
            throw new Error('SLAS_JWKS_JSON must be a JSON object with a non-empty "keys" array');
        }
        logger.info('JWKS: using preloaded SLAS_JWKS_JSON', { keyCount: jwks.keys.length });
        return createLocalJWKSet(jwks);
    }

    const config = getConfig(context);
    if (!config) {
        throw new Error('Runtime configuration not found in context');
    }
    const shortCode = config.commerce.api.shortCode;
    const organizationId = config.commerce.api.organizationId;
    if (!shortCode) {
        throw new Error('shortCode is required for JWKS validation');
    }
    const JWKS_URI = `https://${shortCode}.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/${organizationId}/oauth2/jwks`;
    logger.info('JWKS: fetching', { JWKS_URI });
    const response = await fetch(JWKS_URI, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '(unreadable)');
        logger.error('JWKS: upstream error', { status: response.status, bodyStart: body.slice(0, 200) });
        throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
    }
    const jwks = (await response.json()) as { keys: object[] };
    logger.info('JWKS: received keys', { count: jwks.keys?.length });
    return createLocalJWKSet(jwks);
}
