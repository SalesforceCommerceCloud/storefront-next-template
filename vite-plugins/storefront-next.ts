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
import storefrontNextSdk from '@salesforce/storefront-next-dev';

/**
 * Storefront Next core plugin: extension transforms, target system, and the
 * Page Designer static registry generator.
 *
 * Env vars:
 * - BUNDLES_SIZE_CHECK: when truthy, enables readable chunk names for bundle inspection (any value)
 *   Example: BUNDLES_SIZE_CHECK=true
 * - BUNDLES_SIZE_ANALYZE: when truthy, enables readable chunk names for bundle inspection (any value)
 *   Example: BUNDLES_SIZE_ANALYZE=true
 */
export function storefrontNext() {
    const readableChunkNames = !!process.env.BUNDLES_SIZE_CHECK || !!process.env.BUNDLES_SIZE_ANALYZE;
    return storefrontNextSdk({
        readableChunkNames,
        staticRegistry: {
            componentPath: 'src/components',
            registryPath: 'src/lib/page-designer/static-registry.ts',
            preloadManifest: true,
        },
    });
}
