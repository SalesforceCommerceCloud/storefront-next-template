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
export type ServerMode = 'development' | 'preview' | 'production';

/**
 * Feature flags for each server mode
 */
export interface ServerModeFeatures {
    /** Enable static file serving from build/client directory */
    enableStaticServing: boolean;

    /** Enable gzip/brotli compression middleware for responses */
    enableCompression: boolean;

    /** Enable HTTP request/response logging */
    enableLogging: boolean;

    /** Enable patching of asset URLs with bundle path (for CDN deployment) */
    enableAssetUrlPatching: boolean;
}

/**
 * Default feature configuration for each server mode
 */
export const ServerModeFeatureMap: Record<ServerMode, ServerModeFeatures> = {
    development: {
        enableStaticServing: false,
        enableCompression: false,
        enableLogging: true,
        enableAssetUrlPatching: false,
    },
    preview: {
        enableStaticServing: true,
        enableCompression: true,
        enableLogging: true,
        enableAssetUrlPatching: true,
    },
    production: {
        enableStaticServing: false,
        enableCompression: true,
        enableLogging: true,
        enableAssetUrlPatching: true,
    },
};
