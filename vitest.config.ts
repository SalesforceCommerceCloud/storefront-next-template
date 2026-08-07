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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, configDefaults, coverageConfigDefaults } from 'vitest/config';
import viteConfig from './vite.config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig((configEnv) =>
    mergeConfig(
        viteConfig(configEnv),
        defineConfig({
            test: {
                alias: [
                    {
                        find: /^\/.*\.(svg|png|jpe?g|gif|webp|ico|avif|woff2?|ttf|eot)(\?.*)?$/,
                        replacement: resolve(__dirname, 'src/test-utils/__mocks__/asset-mock.ts'),
                    },
                    {
                        find: 'virtual:action-hooks',
                        replacement: resolve(__dirname, 'src/test-utils/__mocks__/virtual-action-hooks.ts'),
                    },
                ],
                globals: true,
                environment: 'jsdom',
                pool: 'threads',
                setupFiles: ['./vitest.setup.ts'],
                include: ['**/*.{test,spec}.{ts,tsx}'],
                exclude: [...configDefaults.exclude, '.storybook/**/*', 'e2e/**/*'],
                // Windows CI runners are noticeably slower than macOS/Linux for tests with
                // Suspense/lazy chunks. Bump the per-test timeout to absorb that variance
                // without forcing every flaky test to opt in individually.
                testTimeout: 15000,
                coverage: {
                    reporter: [...new Set([...coverageConfigDefaults.reporter, 'json', 'json-summary'])],
                    include: ['src/**/*.{ts,tsx}'],
                    exclude: [
                        'src/**/*.d.ts',
                        'src/components/ui/**/*',
                        'src/**/*.stories.{ts,tsx}',
                        'src/**/*-snapshot.tsx',
                        'src/**/mocks/**/*',
                        'src/**/__mocks__/**/*',
                        'src/**/__snapshots__/**/*',
                        'src/**/*.test.{ts,tsx}',
                        'src/test-utils/*',
                        'src/lib/test-utils/*',
                        'src/**/__tests__/*',
                        'src/lib/page-designer/static-registry.ts',
                    ],
                    reportOnFailure: true,
                    thresholds: { lines: 73, statements: 73, functions: 72, branches: 67 },
                },
            },
        })
    )
);
