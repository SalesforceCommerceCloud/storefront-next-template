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
import { defineConfig, loadEnv, normalizePath } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import devtoolsJson from 'vite-plugin-devtools-json';

import { envValidation } from './vite-plugins/env-validation';
import { reactRouter } from './vite-plugins/react-router';
import { storefrontNext } from './vite-plugins/storefront-next';
import { bundlesize } from './vite-plugins/bundlesize';
import { bundleVisualizer } from './vite-plugins/bundle-visualizer';
import { hybridProxy } from './vite-plugins/hybrid-proxy';

const __dirname = dirname(fileURLToPath(import.meta.url));
const imageGalleryDirectory = `${normalizePath(resolve(__dirname, 'src/components/image-gallery'))}/`;

/** @see {@link https://vite.dev/config/} */
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, 'PUBLIC');

    return {
        envPrefix: ['VITE_', 'PUBLIC_', 'PUBLIC__'],
        define: {
            __DEV__: `${mode !== 'production'}`,
            __TEST__: `${mode === 'test'}`,
        },
        build: {
            sourcemap: true,
            rollupOptions: {
                external: ['_local'],
            },
        },
        environments: {
            client: {
                build: {
                    rollupOptions: {
                        output: {
                            // Keep gallery implementation modules at this boundary. Let Rollup place their dependencies
                            // with other consumers rather than pulling them all into image-gallery.
                            onlyExplicitManualChunks: true,
                            // Child product cards load their gallery after the card shell. Without an explicit boundary,
                            // Rollup hoists ImageGallery into the shared child-products chunk because the PDP also imports
                            // it. Keep that interaction code in its own shared chunk so the child-products shell stays
                            // within its budget while PDP consumers retain the same gallery implementation.
                            manualChunks(id) {
                                if (id.startsWith(imageGalleryDirectory)) {
                                    return 'image-gallery';
                                }
                            },
                        },
                    },
                },
            },
        },
        resolve: {
            alias: {
                '@/config/server': resolve(__dirname, './config.server.ts'),
                '@': resolve(__dirname, './src'),
                '@fonts': '/fonts',
            },
        },
        plugins: [
            envValidation(env, mode),
            reactRouter(mode),
            tailwindcss(),
            tsconfigPaths(),
            devtoolsJson(),
            storefrontNext(),
            bundlesize(),
            bundleVisualizer(),
            hybridProxy({ mode, env }),
        ],
    };
});
