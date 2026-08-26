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
import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, configDefaults, coverageConfigDefaults } from 'vitest/config';
import viteConfig from './vite.config';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A vertical's test files import their own vertical-relative `@/*` modules
// (e.g. `@/components/size-guide-drawer`), which only resolve under that
// vertical's OWN path mapping (see vite-plugins/vertical-resolvers.ts). The
// blanket `include` glob below collects every vertical's test files
// regardless of the active `VERTICAL` env var, so running under a different
// vertical hits the same "Failed to resolve import" error tsc would hit
// without the matching tsconfig exclude (see generate-vertical-tsconfig.mjs).
// Exclude every OTHER vertical's directory wholesale from collection.
// The mirrored, single-vertical customer package has no `src/verticals/`
// directory at all, so this is a no-op there.
const activeVertical = process.env.VERTICAL ?? 'fashion';
const verticalsDir = resolve(__dirname, 'src/verticals');
const hasVerticalsDir = (() => {
    try {
        return statSync(verticalsDir).isDirectory();
    } catch {
        return false;
    }
})();
const otherVerticalTestGlobs = hasVerticalsDir
    ? readdirSync(verticalsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name !== activeVertical)
          .map((entry) => `src/verticals/${entry.name}/**`)
    : [];

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
                // Windows CI has repeatedly segfaulted (exit 139) under the threads pool since
                // it was enabled (@W-23736599) — forks give each test file process isolation.
                pool: process.platform === 'win32' ? 'forks' : 'threads',
                setupFiles: ['./vitest.setup.ts'],
                include: ['**/*.{test,spec}.{ts,tsx}'],
                exclude: [...configDefaults.exclude, '.storybook/**/*', 'e2e/**/*', ...otherVerticalTestGlobs],
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
