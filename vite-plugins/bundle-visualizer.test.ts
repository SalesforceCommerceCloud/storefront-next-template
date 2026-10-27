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
import { afterEach, describe, expect, it, vi } from 'vitest';

const visualizer = vi.hoisted(() => vi.fn((options: unknown) => options));

vi.mock('rollup-plugin-visualizer', () => ({ visualizer }));
vi.mock('vite', () => ({
    perEnvironmentPlugin: (_name: string, factory: (env: { name: string }) => unknown) => factory,
}));

import { bundleVisualizer } from './bundle-visualizer';

const pluginFor = (name: string) => (bundleVisualizer() as unknown as (env: { name: string }) => unknown)({ name });

afterEach(() => {
    vi.unstubAllEnvs();
    visualizer.mockClear();
});

describe('bundleVisualizer', () => {
    it('stays off without BUNDLES_SIZE_ANALYZE', () => {
        vi.stubEnv('BUNDLES_SIZE_ANALYZE', '');

        expect(pluginFor('client')).toBeUndefined();
        expect(visualizer).not.toHaveBeenCalled();
    });

    it('writes the report and opens it by default', () => {
        vi.stubEnv('BUNDLES_SIZE_ANALYZE', 'true');

        pluginFor('client');

        expect(visualizer).toHaveBeenCalledWith({ filename: './build/client-bundle-size.html', open: true });
    });

    it('writes the report without opening it when BUNDLES_SIZE_OPEN is false', () => {
        vi.stubEnv('BUNDLES_SIZE_ANALYZE', 'true');
        vi.stubEnv('BUNDLES_SIZE_OPEN', 'false');

        pluginFor('ssr');

        expect(visualizer).toHaveBeenCalledWith({ filename: './build/ssr-bundle-size.html', open: false });
    });
});
