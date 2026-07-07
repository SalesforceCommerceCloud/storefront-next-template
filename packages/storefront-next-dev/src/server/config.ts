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
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { importTypescript } from './ts-import';

/**
 * Server configuration extracted from environment variables
 */
export interface ServerConfig {
    commerce: {
        api: {
            shortCode: string;
            organizationId: string;
            clientId: string;
            proxy: string;
            proxyHost?: string;
        };
    };
}

/**
 * This is a temporary function before we move the config implementation from
 * the template to the SDK.
 *
 * @ TODO: Remove this function after we move the config implementation from
 * the template to the SDK.
 *
 */
export function loadConfigFromEnv(): ServerConfig {
    const shortCode = process.env.PUBLIC__app__commerce__api__shortCode;
    const organizationId = process.env.PUBLIC__app__commerce__api__organizationId;
    const clientId = process.env.PUBLIC__app__commerce__api__clientId;
    const proxy = process.env.PUBLIC__app__commerce__api__proxy || '/mobify/proxy/api';
    const proxyHost = process.env.SCAPI_PROXY_HOST;

    if (!shortCode && !proxyHost) {
        throw new Error(
            'Missing PUBLIC__app__commerce__api__shortCode environment variable.\n' +
                'Please set it in your .env file or environment.'
        );
    }

    if (!organizationId) {
        throw new Error(
            'Missing PUBLIC__app__commerce__api__organizationId environment variable.\n' +
                'Please set it in your .env file or environment.'
        );
    }

    if (!clientId) {
        throw new Error(
            'Missing PUBLIC__app__commerce__api__clientId environment variable.\n' +
                'Please set it in your .env file or environment.'
        );
    }

    return {
        commerce: {
            api: {
                shortCode: shortCode || '',
                organizationId,
                clientId,
                proxy,
                proxyHost,
            },
        },
    };
}

/**
 * Load storefront-next project configuration from config.server.ts.
 * Requires projectDirectory to be provided.
 *
 * @param projectDirectory - Project directory to load config.server.ts from
 * @throws Error if config.server.ts is not found or invalid
 */
export async function loadProjectConfig(projectDirectory: string): Promise<ServerConfig> {
    const configPath = resolve(projectDirectory, 'config.server.ts');
    const tsconfigPath = resolve(projectDirectory, 'tsconfig.json');

    if (!existsSync(configPath)) {
        throw new Error(
            `config.server.ts not found at ${configPath}.\n` +
                'Please ensure config.server.ts exists in your project root.'
        );
    }

    interface LoadedConfig {
        default?: {
            app?: {
                commerce?: {
                    api?: {
                        shortCode?: string;
                        organizationId?: string;
                        clientId?: string;
                        proxy?: string;
                    };
                };
            };
        };
    }

    const loaded = await importTypescript<LoadedConfig>(configPath, {
        projectDirectory,
        tsconfigPath,
    });

    // Extract commerce API config from the loaded config
    const config = loaded.default;
    if (!config?.app?.commerce?.api) {
        throw new Error(
            `Invalid config.server.ts: missing app.commerce.api configuration.\n` +
                'Please ensure your config.server.ts has the commerce API configuration.'
        );
    }

    const api = config.app.commerce.api;
    const proxyHost = process.env.SCAPI_PROXY_HOST;

    // Validate required fields (shortCode not required when proxyHost is set)
    if (!api.shortCode && !proxyHost) {
        throw new Error('Missing shortCode in config.server.ts commerce.api configuration');
    }
    if (!api.organizationId) {
        throw new Error('Missing organizationId in config.server.ts commerce.api configuration');
    }
    if (!api.clientId) {
        throw new Error('Missing clientId in config.server.ts commerce.api configuration');
    }
    return {
        commerce: {
            api: {
                shortCode: api.shortCode || '',
                organizationId: api.organizationId,
                clientId: api.clientId,
                proxy: api.proxy || '/mobify/proxy/api',
                proxyHost,
            },
        },
    };
}
