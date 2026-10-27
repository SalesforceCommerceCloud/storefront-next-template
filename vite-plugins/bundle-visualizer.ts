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
import { perEnvironmentPlugin } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

/**
 * Per-environment Rollup bundle visualizer. Outputs HTML reports under `./build/`.
 *
 * Env vars:
 * - BUNDLES_SIZE_ANALYZE: when truthy, generates the visualizer report and opens it (any value)
 *   Example: BUNDLES_SIZE_ANALYZE=true
 * - BUNDLES_SIZE_OPEN: set to `false` to generate the report without opening it in a browser
 *   Example: BUNDLES_SIZE_ANALYZE=true BUNDLES_SIZE_OPEN=false
 */
export function bundleVisualizer() {
    return perEnvironmentPlugin('bundle-visualizer', (env) => {
        if (!process.env.BUNDLES_SIZE_ANALYZE) return;
        return visualizer({
            filename: `./build/${env.name}-bundle-size.html`,
            open: process.env.BUNDLES_SIZE_OPEN !== 'false',
        });
    });
}
