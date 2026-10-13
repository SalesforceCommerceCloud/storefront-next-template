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

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';

const SCRIPT_PATH = resolve(__dirname, 'apply-multi-site-config.ts');
const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('apply-multi-site-config', () => {
    test('patches the base config used by a flattened vertical overlay', () => {
        const templatePath = mkdtempSync(resolve(tmpdir(), 'apply-multi-site-config-'));
        temporaryDirectories.push(templatePath);

        const scriptPath = resolve(templatePath, 'e2e/src/scripts/apply-multi-site-config.ts');
        mkdirSync(dirname(scriptPath), { recursive: true });
        copyFileSync(SCRIPT_PATH, scriptPath);

        const overlayConfig = "import baseConfig from './config.server.base';\nexport default baseConfig;\n";
        writeFileSync(resolve(templatePath, 'config.server.ts'), overlayConfig);
        writeFileSync(
            resolve(templatePath, 'config.server.base.ts'),
            `export default defineConfig({
    app: {
            siteAliasMap: { RefArch: 'RefArch' },
            url: {
                prefix: '/:siteId/:localeId',
                excludeRoutes: ['/resource/**', '/action/**'],
            },
    },
});
`
        );

        const result = spawnSync(process.execPath, ['--import=tsx', scriptPath, 'prefix-locale-only'], {
            encoding: 'utf8',
        });

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('✅ Patched config.server.base.ts');
        expect(readFileSync(resolve(templatePath, 'config.server.ts'), 'utf8')).toBe(overlayConfig);
        expect(readFileSync(resolve(templatePath, 'config.server.base.ts'), 'utf8')).toContain("prefix: '/:localeId'");
    });

    test('names the base config when patching fails', () => {
        const templatePath = mkdtempSync(resolve(tmpdir(), 'apply-multi-site-config-'));
        temporaryDirectories.push(templatePath);

        const scriptPath = resolve(templatePath, 'e2e/src/scripts/apply-multi-site-config.ts');
        mkdirSync(dirname(scriptPath), { recursive: true });
        copyFileSync(SCRIPT_PATH, scriptPath);

        writeFileSync(resolve(templatePath, 'config.server.ts'), "export { default } from './config.server.base';\n");
        writeFileSync(resolve(templatePath, 'config.server.base.ts'), 'export default defineConfig({});\n');

        const result = spawnSync(process.execPath, ['--import=tsx', scriptPath, 'prefix-locale-only'], {
            encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('❌ Could not find the url: { ... } block in config.server.base.ts');
    });
});
