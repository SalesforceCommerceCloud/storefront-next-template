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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { createBundleCommand } from './create-bundle';

const { mockCreateBundle, mockCreateBundleV2, mockWriteFile, mockWriteJson } = vi.hoisted(() => ({
    mockCreateBundle: vi.fn(),
    mockCreateBundleV2: vi.fn(),
    mockWriteFile: vi.fn(),
    mockWriteJson: vi.fn(),
}));

vi.mock('fs-extra', () => ({
    default: {
        existsSync: vi.fn(() => true),
        ensureDir: vi.fn(),
        writeFile: mockWriteFile,
        writeJson: mockWriteJson,
    },
}));

vi.mock('../bundle', () => ({
    createBundle: mockCreateBundle,
    getBundleDependencies: vi.fn(() => ({ react: '19.0.0' })),
}));

vi.mock('@salesforce/b2c-tooling-sdk/operations/mrt', () => ({
    createBundleV2: mockCreateBundleV2,
}));

vi.mock('../config', () => ({
    buildMrtConfig: vi.fn(() =>
        Promise.resolve({
            ssrParameters: { ssrFunctionNodeVersion: '24.x', Custom: 'kept' },
            ssrOnly: ['ssr.js'],
            ssrShared: ['static/**/*'],
        })
    ),
}));

vi.mock('../utils', () => ({
    getDefaultBuildDir: vi.fn(() => '/test/project/build'),
    getMrtConfig: vi.fn(() => ({ defaultMrtProject: 'my-project' })),
    getDefaultMessage: vi.fn(() => 'main:abc123'),
}));

vi.mock('../logger', () => ({ logger: { info: vi.fn() } }));

describe('createBundleCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateBundle.mockResolvedValue({
            message: 'main:abc123',
            encoding: 'base64',
            data: Buffer.from('tar').toString('base64'),
            ssr_parameters: {},
            ssr_only: [],
            ssr_shared: [],
            bundle_metadata: {},
        });
        mockCreateBundleV2.mockResolvedValue({
            message: 'main:abc123',
            archive: Buffer.from('gzipped-tar'),
            rootDir: 'bld',
            configPath: '.mrt/config.json',
            matchMode: 'ignore_missing',
            config: { ssrOnly: [], ssrShared: [], ssrParameters: {} },
        });
    });

    it('creates a v1 bundle by default', async () => {
        await createBundleCommand({ projectDirectory: '/test/project', outputDirectory: '/out' });

        expect(mockCreateBundle).toHaveBeenCalledWith(expect.objectContaining({ projectSlug: 'my-project' }));
        expect(mockCreateBundleV2).not.toHaveBeenCalled();
        expect(mockWriteJson).toHaveBeenCalledWith(
            path.join('/out', 'bundle.json'),
            expect.objectContaining({ encoding: 'base64' }),
            { spaces: 2 }
        );
    });

    it('creates a v2 bundle with PascalCase SSR parameters when bundleVersion is 2', async () => {
        await createBundleCommand({ projectDirectory: '/test/project', outputDirectory: '/out', bundleVersion: '2' });

        expect(mockCreateBundle).not.toHaveBeenCalled();
        expect(mockCreateBundleV2).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'main:abc123',
                ssrParameters: { SSRFunctionNodeVersion: '24.x', Custom: 'kept' },
                ssrOnly: ['ssr.js'],
                ssrShared: ['static/**/*'],
                bundleMetadata: { dependencies: { react: '19.0.0' } },
                buildDirectory: '/test/project/build',
                projectDirectory: path.resolve('/test/project'),
                matchMode: 'ignore_missing',
            })
        );
    });

    it('writes the v2 archive as-is and records the v2 metadata', async () => {
        await createBundleCommand({ projectDirectory: '/test/project', outputDirectory: '/out', bundleVersion: '2' });

        expect(mockWriteFile).toHaveBeenCalledWith(path.join('/out', 'bundle.tgz'), Buffer.from('gzipped-tar'));
        expect(mockWriteJson).toHaveBeenCalledWith(
            path.join('/out', 'bundle.json'),
            expect.objectContaining({ root_dir: 'bld', config_path: '.mrt/config.json', match_mode: 'ignore_missing' }),
            { spaces: 2 }
        );
    });
});
