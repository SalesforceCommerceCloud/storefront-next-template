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
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { transformTargetPlaceholderPlugin } from '@salesforce/storefront-next-dev';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dedicated Vite configuration for Storybook
 * This ensures Storybook uses its own config and doesn't inherit from the project's vite.config.ts
 */
export default defineConfig({
    plugins: [
        react({
            babel: {
                parserOpts: {
                    plugins: [['decorators', { decoratorsBeforeExport: true }]],
                },
            },
        }), // Include React plugin for JSX processing with decorator support
        tailwindcss(), // Include Tailwind CSS plugin
        tsconfigPaths(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Plugin type mismatch with Vite plugin types
        transformTargetPlaceholderPlugin() as any, // Transform target placeholders for extensibility
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../src'), // Proper path resolution for Storybook
            '@storybook/test-utils': path.resolve(__dirname, './test-utils'), // Storybook test utilities
            // Fonts alias — root-absolute path because fonts live in public/ (see vite.config.ts)
            '@fonts': '/fonts',
            // Ensure React 19 compatibility
            react: path.resolve(__dirname, '../node_modules/react'),
            'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
            'react/jsx-runtime': path.resolve(__dirname, '../node_modules/react/jsx-runtime'),
        },
    },
    define: {
        // Define global variables for Storybook
        __TEST__: 'false',
    },
    // Make PUBLIC_ prefixed env vars available in Storybook
    envPrefix: ['VITE_', 'PUBLIC_', 'PUBLIC__'],
    optimizeDeps: {
        // Include dependencies that Storybook needs
        include: ['react', 'react-dom', 'react-router', '@radix-ui/react-accordion'],
    },
    test: {
        alias: [
            {
                find: /^\/.*\.(svg|png|jpe?g|gif|webp|ico|avif|woff2?|ttf|eot)(\?.*)?$/,
                replacement: path.resolve(__dirname, '../src/test-utils/__mocks__/asset-mock.ts'),
            },
        ],
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*-snapshot.tsx'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov', 'json-summary'], // `json-summary` and `json` are required for the CI
            reportsDirectory: './.storybook/coverage/coverage-vitest',
            // Note: 'all' option removed in Vitest 4.x - coverage now only includes files loaded during test run
            // See: https://vitest.dev/guide/migration.html#removed-options-coverage-all-and-coverage-extensions
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
                '.storybook/tests/generated-stories/**/*',
                '.storybook/coverage/**/*',
            ],
            reportOnFailure: true,
            // Disable coverage thresholds for story tests for now
            thresholds: {},
        },
    },
});
