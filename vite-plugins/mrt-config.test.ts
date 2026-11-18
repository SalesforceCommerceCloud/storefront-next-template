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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildMrtConfig, keepMatchingPatterns, readBundleDependencies } from './mrt-config';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('buildMrtConfig', () => {
    it('uses the streaming entry point in production', () => {
        const { ssrOnly } = buildMrtConfig(undefined, 'production');

        expect(ssrOnly).toContain('streamingHandler.{js,mjs,cjs}');
        expect(ssrOnly).not.toContain('ssr.{js,mjs,cjs}');
    });

    it('uses the ssr entry point when MRT_BUNDLE_TYPE=ssr', () => {
        vi.stubEnv('MRT_BUNDLE_TYPE', 'ssr');

        const { ssrOnly } = buildMrtConfig(undefined, 'production');

        expect(ssrOnly).toContain('ssr.{js,mjs,cjs}');
        expect(ssrOnly).not.toContain('streamingHandler.{js,mjs,cjs}');
    });

    it('prepends config.server.ts patterns to the defaults', () => {
        const config = buildMrtConfig({ ssrOnly: ['custom/**'], ssrShared: ['!client/skip/**'] }, 'production');

        expect(config.ssrOnly[0]).toBe('custom/**');
        expect(config.ssrOnly).toContain('server/**/*');
        expect(config.ssrShared[0]).toBe('!client/skip/**');
        expect(config.ssrShared).toContain('client/**/*');
    });

    it('defaults the Node version and maps ssrParameters to bundle config keys', () => {
        expect(buildMrtConfig(undefined, 'production').ssrParameters).toEqual({ SSRFunctionNodeVersion: '24.x' });
        expect(
            buildMrtConfig({ ssrParameters: { ssrFunctionNodeVersion: '22.x', envBasePath: '/base' } }, 'production')
                .ssrParameters
        ).toEqual({ SSRFunctionNodeVersion: '22.x', EnvBasePath: '/base' });
    });

    it('omits an empty envBasePath', () => {
        const { ssrParameters } = buildMrtConfig({ ssrParameters: { envBasePath: '' } }, 'production');

        expect(ssrParameters).not.toHaveProperty('EnvBasePath');
        expect(ssrParameters).not.toHaveProperty('envBasePath');
    });
});

describe('readBundleDependencies', () => {
    const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));

    it('merges declared dependencies with the installed SDK version', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'mrt-config-'));
        try {
            writeJson(join(dir, 'package.json'), {
                dependencies: { react: '^19.0.0', '@salesforce/storefront-next-dev': '^1.0.0' },
                devDependencies: { vitest: '^4.0.0' },
            });
            const sdkDir = join(dir, 'node_modules', '@salesforce', 'storefront-next-dev');
            mkdirSync(sdkDir, { recursive: true });
            writeJson(join(sdkDir, 'package.json'), { version: '1.2.3' });

            await expect(readBundleDependencies(dir)).resolves.toEqual({
                react: '^19.0.0',
                vitest: '^4.0.0',
                '@salesforce/storefront-next-dev': '1.2.3',
            });
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it('throws with the file path when the installed SDK package.json is unreadable', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'mrt-config-'));
        try {
            writeJson(join(dir, 'package.json'), { dependencies: { react: '^19.0.0' } });
            const sdkDir = join(dir, 'node_modules', '@salesforce', 'storefront-next-dev');
            mkdirSync(sdkDir, { recursive: true });
            writeFileSync(join(sdkDir, 'package.json'), '{ not json');

            await expect(readBundleDependencies(dir)).rejects.toThrow(/Failed to read .*storefront-next-dev/);
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it('falls back to declared dependencies when the SDK is not installed', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'mrt-config-'));
        try {
            writeJson(join(dir, 'package.json'), { dependencies: { react: '^19.0.0' } });

            await expect(readBundleDependencies(dir)).resolves.toEqual({ react: '^19.0.0' });
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

describe('keepMatchingPatterns', () => {
    it('drops patterns with no matching file and keeps negations', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'mrt-config-'));
        try {
            mkdirSync(join(dir, 'server'));
            writeFileSync(join(dir, 'server', 'index.mjs'), '');
            writeFileSync(join(dir, 'streamingHandler.mjs'), '');

            await expect(
                keepMatchingPatterns(['streamingHandler.{js,mjs,cjs}', 'server/**/*', '**/*.eot', '!static/**/*'], dir)
            ).resolves.toEqual(['streamingHandler.{js,mjs,cjs}', 'server/**/*', '!static/**/*']);
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});
