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

import type { CspContributor, CspContribution } from '@salesforce/storefront-next-runtime/security';
import { isEmbeddedAgentConfigured, resolveWidgetScriptSrc } from '@/components/embedded-agent';
import type { AppConfig } from '@/types/config';
import { toCspOrigin } from './to-csp-origin.js';

type EmbeddedAgentCspConfig = NonNullable<AppConfig['commerce']>['embeddedAgent'];

function origins(...urls: (string | undefined)[]): string[] {
    const out: string[] = [];
    for (const u of urls) {
        const o = u ? toCspOrigin(u) : null;
        if (o && !out.includes(o)) out.push(o);
    }
    return out;
}

/**
 * CSP contributor for the inline PDP `<inline-agent-widget>` custom element.
 * Self-hosted UMD contributes nothing (covered by `self`); CDN script URLs and
 * the `scrt2Url` MIAW endpoint contribute explicit origins.
 */
export function createEmbeddedAgentCspContributor(config: EmbeddedAgentCspConfig | undefined): CspContributor {
    return {
        id: 'embedded-agent',
        isActive: () => isEmbeddedAgentConfigured(config),
        contribute: (): CspContribution => {
            if (!isEmbeddedAgentConfigured(config)) return {};

            const scriptUrl = resolveWidgetScriptSrc(config);
            // Only contribute origins; same-origin `/inline-agent-widget.umd.js` resolves to a bare path.
            const scriptOrigins = scriptUrl.startsWith('/') ? [] : origins(scriptUrl);
            const connectSrc = origins(config.scrt2Url, ...(scriptOrigins.length ? [scriptUrl] : []));
            const frameSrc = origins(config.scrt2Url);

            const out: CspContribution = {};
            if (scriptOrigins.length) out['script-src'] = scriptOrigins;
            if (connectSrc.length) out['connect-src'] = connectSrc;
            if (frameSrc.length) out['frame-src'] = frameSrc;
            return out;
        },
    };
}
