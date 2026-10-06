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
const TRUSTED_SUFFIX = 'my.salesforce.com';

function normalizeExactHost(value: string | undefined): string | null {
    if (!value?.trim() || value.includes('://') || /[/?#@:*]/.test(value)) return null;
    const hostname = value.trim().toLowerCase();
    const labels = hostname.split('.');
    return labels.every(
        (label) =>
            label.length > 0 &&
            label.length <= 63 &&
            /^[a-z0-9-]+$/.test(label) &&
            !label.startsWith('-') &&
            !label.endsWith('-')
    )
        ? hostname
        : null;
}

export function normalizeSalesforceMyDomain(value: string | undefined, allowedHost?: string): string | null {
    if (!value?.trim()) return null;

    const candidate = value.trim();
    if (candidate.endsWith('.')) return null;
    const candidateHost = candidate.includes('://') ? candidate.slice(candidate.indexOf('://') + 3) : candidate;
    const rawHostname = candidateHost.split(/[/?#]/, 1)[0].split('@').at(-1)?.split(':', 1)[0] ?? '';
    if (rawHostname.includes('%') || [...rawHostname].some((character) => (character.codePointAt(0) ?? 0) > 0x7f)) {
        return null;
    }

    let url: URL;
    try {
        url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    } catch {
        return null;
    }

    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        url.hostname.endsWith('.') ||
        url.hostname.includes(':') ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
    ) {
        return null;
    }

    const hostname = url.hostname.toLowerCase();
    const exactAllowedHost = normalizeExactHost(allowedHost);
    if (!hostname.endsWith(`.${TRUSTED_SUFFIX}`) && hostname !== exactAllowedHost) return null;
    const labels = hostname.split('.');
    if (
        labels.some(
            (label) =>
                label.length === 0 ||
                label.length > 63 ||
                !/^[a-z0-9-]+$/.test(label) ||
                label.startsWith('-') ||
                label.endsWith('-')
        )
    ) {
        return null;
    }
    return url.origin;
}

export function getTokenBridgeUrl(value: string | undefined, allowedHost?: string): string | null {
    const origin = normalizeSalesforceMyDomain(value, allowedHost);
    return origin ? new URL('/agent/identity/bridge', origin).toString() : null;
}
