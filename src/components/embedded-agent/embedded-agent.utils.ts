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

const logger = createLogger();

const EMBEDDED_WIDGET_CDN_BASE = 'https://cdn.search.cimulate.ai/inline-agent-widget';
const EMBEDDED_WIDGET_VERSION_PATTERN =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const DEFAULT_EMBEDDED_WIDGET_CDN_VERSION = '0.1.0';
export const DEFAULT_WIDGET_SCRIPT_SRC = `${EMBEDDED_WIDGET_CDN_BASE}/${DEFAULT_EMBEDDED_WIDGET_CDN_VERSION}/inline-agent-widget.umd.js`;

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
    cc_embeddedWidgetCdnVersion?: string;
    embeddedWidgetSourceUrl?: string;
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

export function resolveWidgetScriptSrc(
    config?: Pick<EmbeddedAgentConfig, 'cc_embeddedWidgetCdnVersion' | 'embeddedWidgetSourceUrl'> | null
): string {
    const configuredVersion = config?.cc_embeddedWidgetCdnVersion;
    const trimmedVersion = typeof configuredVersion === 'string' ? configuredVersion.trim() : '';
    const version = EMBEDDED_WIDGET_VERSION_PATTERN.test(trimmedVersion)
        ? trimmedVersion
        : DEFAULT_EMBEDDED_WIDGET_CDN_VERSION;
    const versionUrl = `${EMBEDDED_WIDGET_CDN_BASE}/${version}/inline-agent-widget.umd.js`;
    const source = config?.embeddedWidgetSourceUrl;
    if (typeof source === 'string' && source.trim()) {
        try {
            const url = new URL(source.trim());
            const sourceVersion = url.pathname.match(
                /^\/inline-agent-widget\/([^/]+)\/inline-agent-widget\.umd\.js$/
            )?.[1];
            if (
                url.protocol === 'https:' &&
                url.hostname === 'cdn.search.cimulate.ai' &&
                !url.port &&
                !url.username &&
                !url.password &&
                EMBEDDED_WIDGET_VERSION_PATTERN.test(sourceVersion || '') &&
                !url.search &&
                !url.hash
            ) {
                return url.href;
            }
        } catch {
            // Invalid overrides use the selected CDN version.
        }
        logger.error('Rejected untrusted embedded widget source URL; using selected CDN version');
        return versionUrl;
    }
    return versionUrl;
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
