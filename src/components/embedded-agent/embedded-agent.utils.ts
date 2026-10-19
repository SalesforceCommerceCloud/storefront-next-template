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

import { createLogger } from '@/lib/logger';
import { resolveAssetUrl } from '@/lib/utils';

const logger = createLogger();

const TRUSTED_WIDGET_DOMAINS = ['cimulate.ai', 'sfcc-store-internal.net'];

/** Local self-hosted UMD under `public/`. Flip via `scriptSourceUrl` once CDN is live. */
export const DEFAULT_WIDGET_SCRIPT_SRC = '/inline-agent-widget.umd.js';

export const DEFAULT_CAPABILITIES_VERSION = '66';

/**
 * SF Next PDP path grammar: `/<site>/<locale>/p/<pid>` — but SEO slugs can produce
 * `/p/shoes/running/SKU-1`. Capture the FINAL path segment so slugged URLs work.
 */
export const DEFAULT_PRODUCT_ID_PATTERN = '/p/(?:[^?#]*/)?([^/?#]+)';

export interface EmbeddedAgentConfig {
    enabled: string | boolean;
    scrt2Url: string;
    orgId: string;
    esDeveloperName: string;
    placeholder?: string;
    persistSession?: boolean;
    enableLogging?: boolean;
    /** Overrides `DEFAULT_WIDGET_SCRIPT_SRC`. HTTPS + trusted-domain validated. */
    scriptSourceUrl?: string;
    capabilitiesVersion?: string;
    /** Query-string key the widget should read the product id from (e.g. "pid"). */
    productIdParam?: string;
    /** Overrides `DEFAULT_PRODUCT_ID_PATTERN`. Regex, capture group 1 = product id. */
    productIdPattern?: string;
}

export function isEmbeddedAgentEnabled(enabled: string | boolean | undefined): boolean {
    return enabled === true || enabled === 'true';
}

export function isEmbeddedAgentConfigured(
    config: EmbeddedAgentConfig | undefined | null
): config is EmbeddedAgentConfig {
    if (!config) return false;
    return (
        isEmbeddedAgentEnabled(config.enabled) &&
        typeof config.scrt2Url === 'string' &&
        config.scrt2Url.trim() !== '' &&
        typeof config.orgId === 'string' &&
        config.orgId.trim() !== '' &&
        typeof config.esDeveloperName === 'string' &&
        config.esDeveloperName.trim() !== ''
    );
}

export function isTrustedWidgetScriptUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        return TRUSTED_WIDGET_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
    } catch {
        return false;
    }
}

/**
 * Picks the UMD script URL. Same-origin default when unset or when an override
 * fails trust validation (log + fall back — a bad config must not break the PDP).
 * The self-host path is routed through `resolveAssetUrl` so MRT prepends the
 * `/mobify/bundle/<id>/client/` prefix; Vite dev returns the path as-is.
 */
export function resolveWidgetScriptSrc(config: Pick<EmbeddedAgentConfig, 'scriptSourceUrl'>): string {
    const override = config.scriptSourceUrl;
    if (!override) return resolveAssetUrl(DEFAULT_WIDGET_SCRIPT_SRC);
    if (isTrustedWidgetScriptUrl(override)) return override;
    logger.error('Rejected untrusted inline-agent-widget scriptSourceUrl; falling back to self-host', {
        url: override,
    });
    return resolveAssetUrl(DEFAULT_WIDGET_SCRIPT_SRC);
}

/** Dedupe + trim + cap. Mirrors `MAX_PDP_QUESTIONS` in the widget source. */
export const MAX_PDP_QUESTIONS = 5;

/**
 * SCAPI exposes `c_pdpQuestions` as a JSON-encoded string array. A bad publish
 * upstream must never break the PDP — return [] on any unusable input.
 */
export function parsePdpQuestions(raw: unknown, maxCount = MAX_PDP_QUESTIONS): string[] {
    if (!raw || typeof raw !== 'string') return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        logger.warn('Ignoring malformed c_pdpQuestions: not valid JSON', { raw, err });
        return [];
    }
    if (!Array.isArray(parsed)) {
        logger.warn('Ignoring malformed c_pdpQuestions: parsed value is not an array', { parsed });
        return [];
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of parsed) {
        if (typeof q !== 'string') continue;
        const trimmed = q.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
        if (out.length >= maxCount) break;
    }
    return out;
}

declare global {
    interface Window {
        InlineAgentWidget?: {
            defineElement?: () => void;
        };
    }
}
