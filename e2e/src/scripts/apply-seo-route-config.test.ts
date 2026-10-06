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

const SCRIPT_PATH = resolve(__dirname, 'apply-seo-route-config.ts');
const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('apply-seo-route-config', () => {
    test('updates the shared SEO route defaults in a flattened vertical', () => {
        const templatePath = mkdtempSync(resolve(tmpdir(), 'apply-seo-route-config-'));
        temporaryDirectories.push(templatePath);

        const scriptPath = resolve(templatePath, 'e2e/src/scripts/apply-seo-route-config.ts');
        mkdirSync(dirname(scriptPath), { recursive: true });
        copyFileSync(SCRIPT_PATH, scriptPath);
        writeFileSync(resolve(templatePath, 'config.server.ts'), "export {default} from './config.server.base';\n");
        writeFileSync(
            resolve(templatePath, 'config.server.base.ts'),
            `export const defaultSeoRoute = {
    product: { prefix: 'p' },
    category: { prefix: 'c', mode: 'id-suffix' },
    content: { prefix: 'cms' },
};
`
        );

        const result = spawnSync(process.execPath, ['--import=tsx', scriptPath, 'products', 'catalog', 'slug-path'], {
            encoding: 'utf8',
        });

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        expect(readFileSync(resolve(templatePath, 'config.server.base.ts'), 'utf8')).toContain(
            "product: { prefix: 'products' }"
        );
        expect(readFileSync(resolve(templatePath, 'config.server.base.ts'), 'utf8')).toContain(
            "category: { prefix: 'catalog', mode: 'slug-path' }"
        );
    });

    test('rejects unsafe prefixes without modifying config', () => {
        const templatePath = mkdtempSync(resolve(tmpdir(), 'apply-seo-route-config-'));
        temporaryDirectories.push(templatePath);

        const scriptPath = resolve(templatePath, 'e2e/src/scripts/apply-seo-route-config.ts');
        mkdirSync(dirname(scriptPath), { recursive: true });
        copyFileSync(SCRIPT_PATH, scriptPath);
        const configPath = resolve(templatePath, 'config.server.ts');
        const config = "product: { prefix: 'p' }, category: { prefix: 'c', mode: 'id-suffix' }\n";
        writeFileSync(configPath, config);

        const result = spawnSync(
            process.execPath,
            ['--import=tsx', scriptPath, '../products', 'catalog', 'slug-path'],
            {
                encoding: 'utf8',
            }
        );

        expect(result.status).toBe(1);
        expect(readFileSync(configPath, 'utf8')).toBe(config);
    });
});
