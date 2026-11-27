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
/**
 * Normalize a file path to use forward slashes.
 * On Windows, Node APIs return backslash-separated paths, but ESM import
 * specifiers and Vite module IDs require forward slashes.
 */
export function toPosixPath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Get the Commerce Cloud API URL from a short code
 */
export function getCommerceCloudApiUrl(shortCode: string, proxyHost?: string): string {
    return proxyHost || `https://${shortCode}.api.commercecloud.salesforce.com`;
}

/**
 * Get the configurable base path for the application.
 * Reads from MRT_ENV_BASE_PATH environment variable.
 *
 * The base path is used for CDN routing to the correct MRT environment.
 * It is prepended to page routes and /mobify/bundle/ assets.
 *
 * Validation rules:
 * - Must be a single path segment starting with '/'
 * - Max 63 characters after the leading slash
 * - Only URL-safe characters allowed
 * - Returns empty string if not set
 *
 * @returns The sanitized base path (e.g., '/site-a' or '')
 *
 * @example
 * // No base path configured
 * getBasePath() // → ''
 *
 * // With base path '/storefront'
 * getBasePath() // → '/storefront'
 *
 * // Automatically sanitizes
 * // MRT_ENV_BASE_PATH='storefront/' → '/storefront'
 */
export function getBasePath(): string {
    const basePath = process.env.MRT_ENV_BASE_PATH?.trim();

    // Return empty string if not set or empty
    if (!basePath) {
        return '';
    }

    // Base path prefix must be a single path segment starting with '/', max 63 chars,
    // using only URL-safe characters (alphanumeric, hyphens, underscores, dots, and other safe symbols)
    // This aligns with the regex used by MRT
    if (!/^\/[a-zA-Z0-9_.+$~"'@:-]{1,63}$/.test(basePath)) {
        throw new Error(
            `Invalid base path: "${basePath}". ` +
                "Base path must be a single segment starting with '/' (e.g., '/site-a'), " +
                'contain only URL-safe characters, and be at most 63 characters after the leading slash.'
        );
    }

    return basePath;
}

/**
 * Get the bundle path for static assets
 */
export function getBundlePath(bundleId: string): string {
    const basePath = getBasePath();
    return `${basePath}/mobify/bundle/${bundleId}/client/`;
}
