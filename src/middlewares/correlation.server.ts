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
import type { MiddlewareFunction } from 'react-router';
import { correlationContext, generateCorrelationId } from '@/lib/correlation';
import { getLogger } from '@/lib/logger.server';

/**
 * UUID-safe correlation ID shape. Rejects empty values, CRLF / injection
 * characters, and oversized strings before they are accepted from the request
 * or forwarded on outbound headers via context.
 */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function isValidCorrelationId(value: string | null | undefined): value is string {
    return typeof value === 'string' && CORRELATION_ID_PATTERN.test(value);
}

/**
 * Middleware to extract or generate a correlation ID for request tracing.
 * This must run FIRST in the middleware chain so all subsequent middleware
 * and loaders can access the correlation ID.
 *
 * Correlation ID is determined in the following order:
 * 1. x-correlation-id request header (if present and valid)
 * 2. x-correlation-id FormData field on application/x-www-form-urlencoded or
 *    multipart/form-data POSTs (if present and valid)
 *    (fallback for React Router's fetcher.submit, which does not accept a
 *    headers option; the checkout mid-flow submits use this path)
 * 3. Newly generated UUID (final fallback)
 *
 * Invalid or empty values on either path are treated as absent.
 */
export const correlationMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const logger = getLogger(context);
    const rawHeader = request.headers.get('x-correlation-id');
    const headerCorrelationId = isValidCorrelationId(rawHeader) ? rawHeader : null;
    const formCorrelationId = headerCorrelationId ? null : await readCorrelationIdFromForm(request);
    const correlationId = headerCorrelationId || formCorrelationId || generateCorrelationId();

    logger.debug('Correlation: middleware starting', {
        correlationId,
        fromHeader: !!headerCorrelationId,
        fromForm: !headerCorrelationId && !!formCorrelationId,
    });

    context.set(correlationContext, correlationId);
    return next();
};

/**
 * Reads `x-correlation-id` from a POST body when the request is form-encoded.
 * Clones the request first so downstream loaders/actions can still read the body.
 * Returns null for any non-form request, invalid value, or on parse failure -
 * the middleware falls back to generating a fresh UUID.
 */
async function readCorrelationIdFromForm(request: Request): Promise<string | null> {
    if (request.method !== 'POST') return null;
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (
        !contentType.startsWith('application/x-www-form-urlencoded') &&
        !contentType.startsWith('multipart/form-data')
    ) {
        return null;
    }
    try {
        const formData = await request.clone().formData();
        const value = formData.get('x-correlation-id');
        return typeof value === 'string' && isValidCorrelationId(value) ? value : null;
    } catch {
        return null;
    }
}
