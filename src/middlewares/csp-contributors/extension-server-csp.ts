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

import {
    defaultCspDirectives,
    type CspDirectiveName,
    type CspDirectives,
    type SecurityConfig,
} from '@salesforce/storefront-next-runtime/security';
import { createLogger } from '@/lib/logger';
import { getDomain } from 'tldts';

const logger = createLogger();

/**
 * Host sources an extension may declare in `server-config.ts`. A leading
 * `*.` wildcard and `wss` are allowed. The CSP contributor API rejects both,
 * so these values are merged into the base directive map instead.
 *
 * `*` is only valid as the leftmost label (`*.example.com`). `ws://` is
 * rejected; local dev already adds `ws://localhost:*` in the SDK.
 */
const HOST = /^(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/;
const WILDCARD_HOST = /^\*\.(?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+$/;
const PORT = /^(?:\d{1,5}|\*)$/;

// Resource host lists an extension may extend. Directives that change page
// policy (default-src, form-action, base-uri, frame-ancestors) are not accepted.
const DIRECTIVES = new Set<CspDirectiveName>([
    'script-src',
    'style-src',
    'img-src',
    'frame-src',
    'connect-src',
    'worker-src',
]);

function isDirective(name: string): name is CspDirectiveName {
    return DIRECTIVES.has(name as CspDirectiveName);
}

/**
 * True for an https or wss host, including a leading `*.` wildcard and an optional port.
 * Rejects ws, keywords, paths, and bare or mid-host wildcards. A wildcard must sit above
 * a registrable domain (`*.example.co.uk`), not a public or private suffix (`*.co.uk`, `*.github.io`).
 */
function isHostSource(value: string): boolean {
    if (!value.startsWith('https://') && !value.startsWith('wss://')) return false;
    const rest = value.slice(value.indexOf('://') + 3);
    const colon = rest.lastIndexOf(':');
    const host = colon === -1 ? rest : rest.slice(0, colon);
    const port = colon === -1 ? undefined : rest.slice(colon + 1);
    if (port !== undefined && !PORT.test(port)) return false;
    if (HOST.test(host)) return true;
    return WILDCARD_HOST.test(host) && getDomain(host.slice(2), { allowPrivateDomains: true }) != null;
}

function collect(serverExtension: unknown): Map<CspDirectiveName, string[]> {
    const additions = new Map<CspDirectiveName, string[]>();
    if (!serverExtension || typeof serverExtension !== 'object') return additions;

    for (const [extension, extensionConfig] of Object.entries(serverExtension as Record<string, unknown>)) {
        if (!extensionConfig || typeof extensionConfig !== 'object') continue;
        const csp = (extensionConfig as { csp?: unknown }).csp;
        if (!csp || typeof csp !== 'object') continue;

        for (const [directive, sources] of Object.entries(csp as Record<string, unknown>)) {
            if (!isDirective(directive)) {
                logger.warn('Extension CSP ignored', { extension, directive, reason: 'unknown directive' });
                continue;
            }
            if (!Array.isArray(sources)) {
                logger.warn('Extension CSP ignored', { extension, directive, reason: 'not a list' });
                continue;
            }
            for (const source of sources) {
                if (typeof source !== 'string' || !isHostSource(source)) {
                    logger.warn('Extension CSP ignored', { extension, directive, reason: 'invalid host', source });
                    continue;
                }
                const list = additions.get(directive) ?? [];
                if (!list.includes(source)) list.push(source);
                additions.set(directive, list);
            }
        }
    }
    return additions;
}

function readList(directives: CspDirectives | undefined, name: CspDirectiveName): string[] | undefined {
    const sources = directives?.[name];
    return Array.isArray(sources) ? [...sources] : undefined;
}

function sourcesFor(directive: CspDirectiveName, customer: CspDirectives | undefined, built?: CspDirectives): string[] {
    const own =
        readList(built, directive) ?? readList(customer, directive) ?? readList(defaultCspDirectives, directive);
    // A new worker-src replaces the browser's use of script-src, so copy that list
    // after other extensions have already been merged into it.
    if (directive === 'worker-src' && !readList(built, 'worker-src') && !readList(customer, 'worker-src')) {
        return (
            readList(built, 'script-src') ??
            readList(customer, 'script-src') ??
            readList(defaultCspDirectives, 'script-src') ??
            []
        );
    }
    return own ?? [];
}

/**
 * Append CSP host sources declared by installed extensions onto the security
 * header config. Each extension may export:
 *
 * ```ts
 * export default {
 *   csp: {
 *     'script-src': ['https://*.example.com'],
 *     'connect-src': ['wss://*.example.com'],
 *   },
 * };
 * ```
 *
 * from `src/extensions/<app>/server-config.ts`. Unknown directives and values
 * that are not host sources are ignored, and each one is logged. Returns the
 * same config when no extension declares a usable source.
 */
export function mergeExtensionServerCsp(headers: SecurityConfig, serverExtension: unknown): SecurityConfig {
    if (headers.csp === false) return headers;
    const additions = collect(serverExtension);
    if (additions.size === 0) return headers;

    const customer = headers.csp?.directives;
    const directives: CspDirectives = { ...customer };
    const apply = (directive: CspDirectiveName, sources: string[]) => {
        const merged = sourcesFor(directive, customer, directives);
        for (const source of sources) {
            if (!merged.includes(source)) merged.push(source);
        }
        directives[directive] = merged;
    };
    for (const [directive, sources] of additions) {
        if (directive !== 'worker-src') apply(directive, sources);
    }
    const workerSources = additions.get('worker-src');
    if (workerSources) apply('worker-src', workerSources);

    return {
        ...headers,
        csp: {
            ...(headers.csp ?? {}),
            directives,
        },
    };
}
