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

import type {
    B2COperationLifecycleHook,
    B2COperationContext,
    B2COperationResult,
} from '@salesforce/b2c-tooling-sdk/cli';
import { resolveAuthStrategy } from '@salesforce/b2c-tooling-sdk';
import { createSlasClient } from '@salesforce/b2c-tooling-sdk/clients';

// Intentional coupling: this SDK package references a cartridge name and SLAS scope
// that are defined in the template. This is acceptable because app_storefrontnext_base
// is a framework-shipped cartridge (not a customer-defined one) and the SDK already
// manages its deployment lifecycle via setup-base-cartridge. If the framework ships
// additional cartridges with scope requirements in the future, consider inverting this:
// have each cartridge register a { cartridge, scope } descriptor in a config manifest
// (e.g. .sfnext-hooks.json) that the hook reads at runtime instead of hardcoding here.
const SFNEXT_BASE_CARTRIDGE = 'app_storefrontnext_base';
const SFNEXT_NOTIFY_SCOPE = 'c_sfnext_notify';

/**
 * Oclif b2c:operation-lifecycle hook.
 *
 * Registers a post-deploy provider that checks whether the `c_sfnext_notify`
 * SLAS scope is registered on the SLAS client after a `code:deploy` operation
 * that includes `app_storefrontnext_base`.
 *
 * The check requires the operation context to supply `metadata.clientId` (the
 * SLAS client ID to verify) along with the environment variables below. If any
 * prerequisite is absent the check is skipped silently — it never blocks a deploy.
 *
 * @env SFCC_SHORTCODE - SCAPI short code for the SLAS Admin API base URL (required for scope check)
 * @env SFCC_TENANT_ID - Tenant ID for the SLAS Admin API request (required for scope check)
 */
const hook: B2COperationLifecycleHook = function (_options) {
    return Promise.resolve({
        providers: [
            {
                name: 'sfnext-notify-scope-check',

                afterOperation: async (context: B2COperationContext, result: B2COperationResult) => {
                    // Only act on successful code:deploy operations.
                    if (context.operationType !== 'code:deploy' || !result.success) {
                        return;
                    }

                    // Check whether app_storefrontnext_base is among the deployed cartridges.
                    // The metadata cartridges field may contain string names or objects
                    // with a `name` property, depending on the command that invoked the hook.
                    const { cartridges } = context.metadata;
                    if (!Array.isArray(cartridges)) return;

                    const hasEmailCartridge = cartridges.some((c) => {
                        if (typeof c === 'string') return c === SFNEXT_BASE_CARTRIDGE;
                        if (typeof c === 'object' && c !== null && 'name' in c) {
                            return (c as { name: unknown }).name === SFNEXT_BASE_CARTRIDGE;
                        }
                        return false;
                    });

                    if (!hasEmailCartridge) return;

                    // Gather prerequisites for the SLAS scope check.
                    const shortCode = process.env.SFCC_SHORTCODE;
                    const tenantId = process.env.SFCC_TENANT_ID;
                    const { clientId } = context.metadata;
                    const oauthConfig = context.instance.auth.oauth;

                    if (
                        !shortCode ||
                        !tenantId ||
                        typeof clientId !== 'string' ||
                        !oauthConfig ||
                        !oauthConfig.clientId ||
                        !oauthConfig.clientSecret
                    ) {
                        this.debug(
                            'Email scope check skipped: missing SFCC_SHORTCODE, SFCC_TENANT_ID, ' +
                                'metadata.clientId, or OAuth client secret'
                        );
                        return;
                    }

                    try {
                        const auth = resolveAuthStrategy(
                            {
                                clientId: oauthConfig.clientId,
                                clientSecret: oauthConfig.clientSecret,
                            },
                            { allowedMethods: ['client-credentials'] }
                        );
                        const slasClient = createSlasClient({ shortCode }, auth);

                        const { data, error } = await slasClient.GET('/tenants/{tenantId}/clients/{clientId}', {
                            params: { path: { tenantId, clientId } },
                        });

                        if (error || !data) {
                            this.debug(`Email scope check skipped: SLAS GET failed for client "${clientId}"`);
                            return;
                        }

                        const rawScopes: unknown = data.scopes;
                        const scopes: string[] = Array.isArray(rawScopes)
                            ? (rawScopes as string[])
                            : typeof rawScopes === 'string'
                              ? rawScopes.split(/[\s|]+/).filter(Boolean)
                              : [];

                        if (!scopes.includes(SFNEXT_NOTIFY_SCOPE)) {
                            this.warn(
                                `The ${SFNEXT_BASE_CARTRIDGE} cartridge is deployed but the ${SFNEXT_NOTIFY_SCOPE} scope is not registered on your SLAS client.\n` +
                                    `Run: sfnext setup-base-cartridge --slas-client-id ${clientId}`
                            );
                        }
                    } catch (err) {
                        this.debug(`Email scope check failed: ${err instanceof Error ? err.message : String(err)}`);
                    }
                },
            },
        ],
    });
};

export default hook;
