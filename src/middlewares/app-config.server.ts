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
import type { MiddlewareFunction } from 'react-router';
import config from '@/config/server';
import { appConfigContext, clientAppConfigContext } from '@salesforce/storefront-next-runtime/config';
import { extractClientConfig } from '@/lib/app-config-client';
import { getLogger } from '@/lib/logger.server';

/**
 * Client-safe view of `config.app`, computed once at module init. The strip is identical
 * on every request (the underlying `config.app` is a static module import that doesn't
 * mutate at runtime), so doing it per-request would allocate a fresh shallow copy every
 * render for no behavioral difference. The middleware below stashes this in
 * `clientAppConfigContext` so the root loader's return — the value React Router serializes
 * into the SSR hydration payload — can read it as a zero-cost lookup.
 */
const CLIENT_APP_CONFIG = extractClientConfig(config.app);

let validationRun = false;

/**
 * Validate required Commerce API configuration on first access
 */
function validateConfig(logger: ReturnType<typeof getLogger>): void {
    if (validationRun || process.env.NODE_ENV === 'test') {
        return;
    }

    logger.debug('AppConfig: validating configuration', {
        hasProxyHost: !!process.env.SCAPI_PROXY_HOST,
    });

    const required: Record<string, string> = {
        clientId: config.app.commerce.api.clientId,
        organizationId: config.app.commerce.api.organizationId,
    };

    // shortCode is only required when not using a proxy host override
    if (!process.env.SCAPI_PROXY_HOST) {
        required.shortCode = config.app.commerce.api.shortCode;
    }

    const missing = Object.entries(required)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        logger.error('AppConfig: missing required configuration', { missing });
        // Map config keys to env var names
        const envVarMap: Record<string, string> = {
            clientId: 'PUBLIC__app__commerce__api__clientId',
            organizationId: 'PUBLIC__app__commerce__api__organizationId',
            shortCode: 'PUBLIC__app__commerce__api__shortCode',
        };

        throw new Error(
            `Missing required Commerce API configuration: ${missing.join(', ')}\n\n` +
                `Set these environment variables in your MRT deployment or .env file:\n${missing
                    .map((key) => `  ${envVarMap[key]}=your-value`)
                    .join('\n')}\n\n` +
                `Example .env file:\n` +
                `PUBLIC__app__commerce__api__clientId=your-client-id\n` +
                `PUBLIC__app__commerce__api__organizationId=your-org-id\n` +
                `PUBLIC__app__commerce__api__shortCode=your-short-code\n\n` +
                `See docs/README-CONFIG.md for complete configuration documentation.`
        );
    }

    // Validate site context configuration
    const { sites } = config.app.commerce;

    if (!Array.isArray(sites) || sites.length === 0) {
        throw new Error(
            `Missing required site context configuration: commerce.sites\n\n` +
                `Set sites in your MRT deployment, .env file, or config.server.ts.\n` +
                `commerce.sites must be a non-empty array with at least one site definition.\n\n` +
                `Example .env file:\n` +
                `PUBLIC__app__commerce__sites=[{"id":"YourSiteId","defaultLocale":"en-GB","defaultCurrency":"GBP","supportedLocales":[{"id":"en-GB","preferredCurrency":"GBP"},{"id":"it-IT","preferredCurrency":"EUR"}],"supportedCurrencies":["EUR","GBP"]}]\n\n` +
                `Example config.server.ts:\n` +
                `commerce: {\n` +
                `  sites: [\n` +
                `    {\n` +
                `      id: 'YourSiteId',\n` +
                `      defaultLocale: 'en-US',\n` +
                `      defaultCurrency: 'USD',\n` +
                `      supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }],\n` +
                `      supportedCurrencies: ['USD'],\n` +
                `    },\n` +
                `  ],\n` +
                `}\n\n` +
                `See docs/README-MULTI-SITE.md for site context configuration documentation.`
        );
    }

    if (!config.app.defaultSiteId) {
        throw new Error(
            `Missing required configuration: defaultSiteId\n\n` +
                `Set defaultSiteId in your MRT deployment, .env file, or config.server.ts:\n` +
                `  PUBLIC__app__defaultSiteId=your-site-id\n\n` +
                `Example config.server.ts:\n` +
                `defaultSiteId: 'YourSiteId',\n\n` +
                `See docs/README-MULTI-SITE.md for site context configuration documentation.`
        );
    }

    // defaultSiteId needs to be part of sites list, otherwise, it is invalid
    const siteIds = sites.map((site: { id: string }) => site.id);
    if (!siteIds.includes(config.app.defaultSiteId)) {
        throw new Error(
            `Invalid configuration: defaultSiteId "${config.app.defaultSiteId}" does not match any site in commerce.sites.\n\n` +
                `Available site IDs: ${siteIds.join(', ')}\n\n` +
                `Set defaultSiteId to one of the configured site IDs in your MRT deployment, .env file, or config.server.ts:\n` +
                `  PUBLIC__app__defaultSiteId=${siteIds[0]}\n\n` +
                `See docs/README-MULTI-SITE.md for site context configuration documentation.`
        );
    }

    logger.info('AppConfig: validation succeeded');
    validationRun = true;
}

/**
 * Server middleware to ensure app config is in context before any other middleware runs
 * This MUST run first so that scapi.ts can access config during auth middleware
 *
 * Note: We reference config.app.cimulateAgent so the server bundle keeps it when tree-shaking.
 * Root and header read it via getConfig(context); the bundler does not trace that back to this module.
 */
export const appConfigMiddlewareServer: MiddlewareFunction<Response> = ({ context }, next) => {
    const logger = getLogger(context);
    logger.debug('AppConfig: middleware starting');
    validateConfig(logger);
    // Ensure cimulateAgent is not tree-shaken from the config (used by root.tsx and header for cimulate agent)
    void config.app.cimulateAgent;
    context.set(appConfigContext, config.app);
    context.set(clientAppConfigContext, CLIENT_APP_CONFIG);
    return next();
};
