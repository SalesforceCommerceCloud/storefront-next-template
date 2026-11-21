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
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            'virtual:storefront-next/compiled-routes': resolve(
                fileURLToPath(new URL('.', import.meta.url)),
                'src/test-utils/__mocks__/compiled-routes.ts'
            ),
        },
    },
    test: {
        environment: 'node',
        include: ['src/lib/auth/auth-generation.browser-test.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
    },
});
