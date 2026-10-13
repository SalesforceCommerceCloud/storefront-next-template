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
import type { Middleware } from '@/scapi';

export type ScapiClientProvenance = 'built-in' | 'override' | 'custom';

export type NonPersonalizedResponseClassifierInput = Readonly<{
    client: string;
    provenance: ScapiClientProvenance;
    clientBasePath: string;
    schemaPath: string;
    method: string;
    destination: string;
    request: Request;
    siteId?: string;
    expand?: readonly string[];
    path: Readonly<Record<string, unknown>>;
    query: Readonly<Record<string, string | readonly string[]>>;
}>;

export type NonPersonalizedResponseClassifier = (input: NonPersonalizedResponseClassifierInput) => boolean;

export type NonPersonalizedResponseClassifierErrorContext = Readonly<{
    client: string;
    provenance: ScapiClientProvenance;
    schemaPath: string;
    siteId?: string;
}>;

type CreateNonPersonalizedResponseMiddlewareOptions = Readonly<{
    client: string;
    provenance: ScapiClientProvenance;
    clientBasePath: string;
    expectedBaseUrl: string;
    classifier: NonPersonalizedResponseClassifier;
    onError?: (error: unknown, context: NonPersonalizedResponseClassifierErrorContext) => void;
    onPersonalization?: (id: string, mode: 'automatic-none' | 'explicit') => void;
}>;

const normalizeBaseUrl = (value: string): URL => {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url;
};

const matchesExpectedDestination = (requestUrl: URL, expectedBaseUrl: URL): boolean =>
    requestUrl.origin === expectedBaseUrl.origin &&
    (requestUrl.pathname === expectedBaseUrl.pathname ||
        requestUrl.pathname.startsWith(`${expectedBaseUrl.pathname}/`));

const cloneRecord = (value: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> =>
    Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, Array.isArray(item) ? [...item] : item]));

const getQuery = (searchParams: URLSearchParams): Readonly<Record<string, string | readonly string[]>> => {
    const query: Record<string, string | readonly string[]> = Object.create(null);
    for (const key of new Set(searchParams.keys())) {
        if (key === 'personalized') continue;
        const values = searchParams.getAll(key);
        query[key] = values.length === 1 ? values[0] : values;
    }
    return query;
};

const getExpand = (searchParams: URLSearchParams): readonly string[] | undefined => {
    const values = searchParams
        .getAll('expand')
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean);
    return values.length ? values : undefined;
};

const preserveRequestExtensions = (source: Request, target: Request): void => {
    const targetKeys = new Set(Reflect.ownKeys(target));
    for (const key of Reflect.ownKeys(source)) {
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (descriptor?.enumerable && !targetKeys.has(key)) {
            Object.defineProperty(target, key, descriptor);
        }
    }
};

const reportError = (
    onError: CreateNonPersonalizedResponseMiddlewareOptions['onError'],
    error: unknown,
    context: NonPersonalizedResponseClassifierErrorContext
): void => {
    try {
        onError?.(error, context);
    } catch {
        // Classification diagnostics must not block a valid SCAPI request.
    }
};

/** Creates the final request middleware that applies customer-owned classification. */
export function createNonPersonalizedResponseMiddleware({
    client,
    provenance,
    clientBasePath,
    expectedBaseUrl,
    classifier,
    onError,
    onPersonalization,
}: CreateNonPersonalizedResponseMiddlewareOptions): Middleware {
    const expectedDestination = normalizeBaseUrl(expectedBaseUrl);

    return {
        onRequest({ request, schemaPath, params, options, id }) {
            const requestUrl = new URL(request.url);
            const effectiveDestination = normalizeBaseUrl(options.baseUrl);
            if (requestUrl.searchParams.has('personalized')) {
                onPersonalization?.(id, 'explicit');
                return request;
            }
            if (
                request.method !== 'GET' ||
                effectiveDestination.origin !== expectedDestination.origin ||
                effectiveDestination.pathname !== expectedDestination.pathname ||
                !matchesExpectedDestination(requestUrl, effectiveDestination)
            ) {
                return request;
            }

            const query = getQuery(requestUrl.searchParams);
            const siteId = typeof query.siteId === 'string' ? query.siteId : undefined;
            const errorContext = { client, provenance, schemaPath, ...(siteId ? { siteId } : {}) };
            const expand = getExpand(requestUrl.searchParams);

            try {
                const result = classifier({
                    client,
                    provenance,
                    clientBasePath,
                    schemaPath,
                    method: request.method,
                    destination: effectiveDestination.href,
                    request: request.clone(),
                    ...(siteId ? { siteId } : {}),
                    ...(expand ? { expand } : {}),
                    path: cloneRecord(params.path),
                    query,
                });
                if (result === false) return request;
                if (result !== true) {
                    reportError(onError, new TypeError('Classifier must return a boolean'), errorContext);
                    return request;
                }
            } catch (error) {
                reportError(onError, error, errorContext);
                return request;
            }

            const separator = requestUrl.search ? '&' : '?';
            const replacement = new Request(`${request.url}${separator}personalized=none`, request);
            preserveRequestExtensions(request, replacement);
            onPersonalization?.(id, 'automatic-none');
            return replacement;
        },
    };
}
