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

const storefrontNextSdk = vi.hoisted(() => vi.fn((options: unknown) => options));

vi.mock('@salesforce/storefront-next-dev', () => ({ default: storefrontNextSdk }));

import { storefrontNext } from './storefront-next';

afterEach(() => {
    vi.unstubAllEnvs();
    storefrontNextSdk.mockClear();
});

describe('storefrontNext', () => {
    it('enables the embedded Page Designer preload manifest', () => {
        expect(storefrontNext()).toEqual({
            readableChunkNames: false,
            staticRegistry: {
                componentPath: 'src/components',
                registryPath: 'src/lib/page-designer/static-registry.ts',
                preloadManifest: true,
            },
        });
    });

    it.each([
        'BUNDLES_SIZE_CHECK',
        'BUNDLES_SIZE_ANALYZE',
    ])('enables readable chunk names for %s', (environmentVariable) => {
        vi.stubEnv(environmentVariable, 'true');

        storefrontNext();

        expect(storefrontNextSdk).toHaveBeenCalledWith(expect.objectContaining({ readableChunkNames: true }));
    });
});
