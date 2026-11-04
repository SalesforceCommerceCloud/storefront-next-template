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
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard is always served by the Hono server (no static artifact).
// In dev, Vite serves the app and proxies /api to the Hono server; in prod,
// Hono serves the built assets from dist/audit/ui.
export default defineConfig({
    root: import.meta.dirname,
    plugins: [react()],
    resolve: {
        alias: [
            // design-system-react types its components under `components/<name>`,
            // but that path holds uncompiled JSX. Point it at the published ESM build.
            {
                find: /^@salesforce\/design-system-react\/components\/(.*)$/,
                replacement: '@salesforce/design-system-react/module/components/$1',
            },
        ],
    },
    build: {
        outDir: '../../../dist/audit/ui',
        emptyOutDir: true,
    },
    server: {
        port: 5174,
        proxy: {
            '/api': { target: 'http://localhost:8787', changeOrigin: true },
        },
    },
});
