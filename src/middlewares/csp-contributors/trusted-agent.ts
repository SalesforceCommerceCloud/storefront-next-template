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

type TrustedAgentCspConfig = { enabled?: boolean } | undefined;

/**
 * CSP contributor for the trusted agent sign-in popup.
 *
 * The popup submits a same-origin form, then follows redirects to Account Manager and back through
 * the SLAS authorize endpoint. Chrome applies `form-action` to every hop of that redirect chain, so
 * when the agent already has an Account Manager session the SLAS host must be allowed or the popup
 * stays blank. Only the SLAS origin is added here. The Account Manager host differs per environment
 * and stays a merchant-configured `form-action` source.
 *
 * @param config - `features.trustedAgent`; the contributor is inactive unless `enabled` is true.
 * @param resolveSlasBaseUrl - Returns the SCAPI base URL (the shortCode host, or the proxy host when one is configured). Only called when trusted agent is enabled; boot validation calls `contribute` on inactive contributors too.
 */
export function createTrustedAgentCspContributor(
    config: TrustedAgentCspConfig,
    resolveSlasBaseUrl: () => string
): CspContributor {
    return {
        id: 'trusted-agent',
        isActive: () => config?.enabled === true,
        contribute: (): CspContribution =>
            config?.enabled === true ? { 'form-action': [new URL(resolveSlasBaseUrl()).origin] } : {},
    };
}
