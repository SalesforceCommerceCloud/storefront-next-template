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

const LOCAL_BUNDLE_ID = 'local';
const BASE_PATH_PATTERN = /^\/[a-zA-Z0-9_.+$~"'@:-]{1,63}$/;

type BundleWindow = Window & {
    _BASE_PATH?: string;
    _BUNDLE_ID?: string;
    _BUNDLE_PATH?: string;
};

function getServerBasePath(): string {
    const basePath = process.env.MRT_ENV_BASE_PATH?.trim();
    if (!basePath) return '';

    if (!BASE_PATH_PATTERN.test(basePath)) {
        throw new Error(
            `Invalid base path: "${basePath}". ` +
                "Base path must be a single segment starting with '/' (e.g., '/site-a'), " +
                'contain only URL-safe characters, and be at most 63 characters after the leading slash.'
        );
    }

    return basePath;
}

/**
 * Return the runtime URL prefix for emitted client bundle resources.
 *
 * In the browser, the Managed Runtime-aware Scripts integration injects the
 * authoritative bundle path. During SSR, the path is derived from
 * `MRT_ENV_BASE_PATH` and `BUNDLE_ID`. Local development and preview default to
 * the `local` bundle ID.
 */
export function getClientBundlePath(): string {
    const browserWindow = typeof window === 'undefined' ? undefined : (window as BundleWindow);
    if (browserWindow?._BUNDLE_PATH) {
        return browserWindow._BUNDLE_PATH.endsWith('/') ? browserWindow._BUNDLE_PATH : `${browserWindow._BUNDLE_PATH}/`;
    }

    const basePath = browserWindow ? (browserWindow._BASE_PATH ?? '') : getServerBasePath();
    const bundleId = (browserWindow ? browserWindow._BUNDLE_ID : process.env.BUNDLE_ID) || LOCAL_BUNDLE_ID;
    return `${basePath}/mobify/bundle/${bundleId}/client/`;
}
