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
import type { AppConfig } from '@/types/config';
import { toCspOrigin } from './to-csp-origin.js';

type CimulateAgentConfig = AppConfig['cimulateAgent'];

const isEnabled = (e: string | boolean | undefined): boolean => e === true || e === 'true';

function origins(...urls: (string | undefined)[]): string[] {
    const out: string[] = [];
    for (const u of urls) {
        const o = u ? toCspOrigin(u) : null;
        if (o && !out.includes(o)) out.push(o);
    }
    return out;
}

/**
 * CSP contributor for the Commerce Client (Cimulate) messaging widget.
 * Boot-static: derives EXACT origins from the merchant's cimulateAgent config.
 * Inactive (contributes nothing) when Cimulate is disabled or unconfigured.
 */
export function createCimulateCspContributor(config: CimulateAgentConfig): CspContributor {
    return {
        id: 'cimulate',
        isActive: () => isEnabled(config?.enabled),
        contribute: (): CspContribution => {
            if (!isEnabled(config?.enabled)) return {};

            const widgetOrigin = origins(config?.commerceClientScriptSourceUrl);
            const scriptSrc = widgetOrigin;
            const connectSrc = origins(config?.scrt2Url, config?.commerceClientScriptSourceUrl);
            const imgSrc = origins(config?.commerceClientLogoUrl, config?.commerceClientScriptSourceUrl);
            const styleSrc = widgetOrigin;
            const fontSrc = widgetOrigin;
            const frameSrc = origins(config?.scrt2Url);

            const out: CspContribution = {};
            if (scriptSrc.length) out['script-src'] = scriptSrc;
            if (connectSrc.length) out['connect-src'] = connectSrc;
            if (imgSrc.length) out['img-src'] = imgSrc;
            if (styleSrc.length) out['style-src'] = styleSrc;
            if (fontSrc.length) out['font-src'] = fontSrc;
            if (frameSrc.length) out['frame-src'] = frameSrc;
            return out;
        },
    };
}
