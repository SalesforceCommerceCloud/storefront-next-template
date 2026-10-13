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
import { type MiddlewareFunction } from 'react-router';
import { createSecurityHeadersMiddleware } from '@salesforce/storefront-next-runtime/security';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { resolveShopperAgentConfig } from '@/components/cimulate';
import { createCimulateCspContributor } from './csp-contributors/cimulate.js';
import { createData360CspContributor } from './csp-contributors/data360.js';
// Imported via the `@/` alias (not a sibling-relative path) so a brand can override this contributor:
// the default is a no-op, and a brand that renders the boutique map ships its own always-active
// version permitting the OSM tile origin. A relative import would pin the default and leave those
// map tiles CSP-blocked.
import { createOpenStreetMapCspContributor } from '@/middlewares/csp-contributors/openstreetmap';

let middleware: MiddlewareFunction<Response> | null = null;

/**
 * Lazily-instantiated security headers middleware.
 *
 * Defers reading the resolved app config until the first request so env-var
 * overrides via `mergeEnvConfig` are picked up. Same pattern as
 * `i18nextMiddleware`.
 */
export const securityHeadersMiddleware: MiddlewareFunction<Response> = async (args, next) => {
    if (!middleware) {
        const config = getConfig(args.context);
        const contributors = [
            createCimulateCspContributor(resolveShopperAgentConfig(config)),
            createData360CspContributor(config.engagement?.adapters?.data360),
            createOpenStreetMapCspContributor(),
        ];
        middleware = createSecurityHeadersMiddleware(config.security?.headers ?? {}, contributors);
    }
    return middleware(args, next);
};
