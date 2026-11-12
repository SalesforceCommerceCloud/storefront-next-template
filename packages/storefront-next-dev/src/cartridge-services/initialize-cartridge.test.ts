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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { initializeNamedCartridge } from './initialize-cartridge';
import { CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_NAME } from '../config';

function listRelativeFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name))
        .map((absolute) => path.relative(dir, absolute).split(path.sep).join('/'))
        .sort();
}

describe('initializeNamedCartridge', () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-initialize-cartridge-'));
    });

    afterEach(() => {
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('scaffolds only identity files from an empty project with no base cartridge', async () => {
        const customName = 'app_storefrontnext_refarch';

        await initializeNamedCartridge(projectDir, customName);

        const customDir = path.join(projectDir, CARTRIDGES_BASE_DIR, customName);
        expect(listRelativeFiles(customDir)).toEqual(['.project', `cartridge/${customName}.properties`]);

        const projectXml = fs.readFileSync(path.join(customDir, '.project'), 'utf8');
        expect(projectXml).toContain(`<name>${customName}</name>`);

        const properties = fs.readFileSync(path.join(customDir, 'cartridge', `${customName}.properties`), 'utf8');
        expect(properties).toContain(`demandware.cartridges.${customName}.multipleLanguageStorefront=true`);
        expect(properties).not.toContain('.id=');
        expect(properties).not.toContain('.version=');
        expect(fs.existsSync(path.join(projectDir, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_NAME))).toBe(false);
    });

    it('does not copy an existing base cartridge when scaffolding a named cartridge', async () => {
        const customName = 'app_storefrontnext_beauty';
        const baseDir = path.join(projectDir, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_NAME);
        fs.mkdirSync(path.join(baseDir, 'cartridge'), { recursive: true });
        fs.writeFileSync(path.join(baseDir, 'sentinel.txt'), 'do-not-copy');

        await initializeNamedCartridge(projectDir, customName);

        const customDir = path.join(projectDir, CARTRIDGES_BASE_DIR, customName);
        expect(listRelativeFiles(customDir)).toEqual(['.project', `cartridge/${customName}.properties`]);
        expect(listRelativeFiles(baseDir)).toEqual(['sentinel.txt']);
        expect(fs.readFileSync(path.join(baseDir, 'sentinel.txt'), 'utf8')).toBe('do-not-copy');
    });

    it('does not overwrite an existing named cartridge', async () => {
        const customName = 'app_storefrontnext_refarch';
        const customDir = path.join(projectDir, CARTRIDGES_BASE_DIR, customName);
        fs.mkdirSync(path.join(customDir, 'cartridge'), { recursive: true });
        fs.writeFileSync(
            path.join(customDir, '.project'),
            '<projectDescription><name>keep</name></projectDescription>\n'
        );
        fs.writeFileSync(path.join(customDir, 'custom-note.txt'), 'keep me');
        fs.writeFileSync(path.join(customDir, 'hooks.json'), '{"hooks":[]}\n');

        await initializeNamedCartridge(projectDir, customName);

        expect(fs.readFileSync(path.join(customDir, '.project'), 'utf8')).toContain('<name>keep</name>');
        expect(fs.readFileSync(path.join(customDir, 'custom-note.txt'), 'utf8')).toBe('keep me');
        expect(fs.readFileSync(path.join(customDir, 'hooks.json'), 'utf8')).toBe('{"hooks":[]}\n');
        expect(listRelativeFiles(customDir)).toEqual(['.project', 'custom-note.txt', 'hooks.json']);
    });

    it('lets two named cartridges coexist without creating a base cartridge', async () => {
        await initializeNamedCartridge(projectDir, 'app_storefrontnext_refarch');
        await initializeNamedCartridge(projectDir, 'app_storefrontnext_beauty');

        expect(
            fs.existsSync(path.join(projectDir, CARTRIDGES_BASE_DIR, 'app_storefrontnext_refarch', '.project'))
        ).toBe(true);
        expect(fs.existsSync(path.join(projectDir, CARTRIDGES_BASE_DIR, 'app_storefrontnext_beauty', '.project'))).toBe(
            true
        );
        expect(fs.existsSync(path.join(projectDir, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_NAME))).toBe(false);
    });

    describe('rejects path-like cartridge names', () => {
        let existsSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            existsSpy = vi.spyOn(fs, 'existsSync');
        });

        afterEach(() => {
            existsSpy.mockRestore();
        });

        it.each([
            '',
            '.',
            '..',
            '../outside',
            '../../outside',
            'nested/name',
            'nested\\name',
            '/absolute',
            'C:\\outside',
            'C:outside',
            ' ',
            '\t \n',
            '\0',
        ])('rejects %j before probing the target or scaffolding', async (cartridgeName) => {
            await expect(initializeNamedCartridge(projectDir, cartridgeName)).rejects.toThrow('--cartridge-name');
            expect(existsSpy).not.toHaveBeenCalled();
            expect(fs.existsSync(path.join(projectDir, '.project'))).toBe(false);
        });

        it('rejects ".." even when that path exists so the early-return cannot bypass', async () => {
            fs.mkdirSync(path.join(projectDir, CARTRIDGES_BASE_DIR));
            existsSpy.mockClear();

            await expect(initializeNamedCartridge(projectDir, '..')).rejects.toThrow('--cartridge-name');
            expect(existsSpy).not.toHaveBeenCalled();
            expect(listRelativeFiles(projectDir)).toEqual([]);
        });
    });
});
