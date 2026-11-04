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
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PlayhouseArtifactReader } from './evidence';

async function reader(): Promise<{ archiveDir: string; playhouse: PlayhouseArtifactReader }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sfnext-evidence-'));
    const archiveDir = path.join(root, 'archive');
    await mkdir(path.join(archiveDir, 'abs'), { recursive: true });
    await mkdir(path.join(archiveDir, 'runs'));
    await writeFile(path.join(root, 'outside.json'), '{}');
    await writeFile(path.join(archiveDir, 'abs', 'file.json'), '{}');
    await writeFile(path.join(archiveDir, 'summary.json'), '{"value":"text"}');
    await writeFile(path.join(archiveDir, 'broken.json'), '{');
    await symlink(path.join(archiveDir, 'summary.json'), path.join(archiveDir, 'link.json'));
    const playhouse = new PlayhouseArtifactReader([
        { label: 'home', url: 'https://shop.test/', archiveDir, playhouseVersion: '1.0.0' },
    ]);
    return { archiveDir, playhouse };
}

describe('PlayhouseArtifactReader', () => {
    it('lists archive files as sorted POSIX paths, skipping symlinks', async () => {
        const { playhouse } = await reader();
        expect(await playhouse.artifactNames('home')).toEqual(['abs/file.json', 'broken.json', 'summary.json']);
    });

    it('reads text and schema-checked JSON, and undefined for a missing artifact', async () => {
        const { playhouse } = await reader();
        expect(await playhouse.readText('home', 'summary.json', 1024)).toBe('{"value":"text"}');
        expect(await playhouse.readJson('home', 'summary.json', z.object({ value: z.string() }))).toEqual({
            value: 'text',
        });
        expect(await playhouse.readJson('home', 'missing.json', z.object({}))).toBeUndefined();
    });

    it.each([
        ['an absolute path', '/abs/file.json', 'Unsafe relative path: /abs/file.json'],
        ['a parent path', '../outside.json', 'Unsafe relative path: ../outside.json'],
        ['a symlink', 'link.json', 'Path must not contain a symlink: link.json'],
        ['a directory', 'runs', 'Path is not a file: runs'],
        ['an artifact over its byte limit', 'summary.json', 'File exceeds 4 bytes: summary.json'],
    ])('rejects %s', async (_case, name, error) => {
        const { playhouse } = await reader();
        await expect(playhouse.readText('home', name, 4)).rejects.toThrow(error);
    });

    it('rejects a path through a file, which Windows reports as missing', async () => {
        const { playhouse } = await reader();
        const read = playhouse.readText('home', 'summary.json/inner', 4);
        if (process.platform === 'win32') await expect(read).resolves.toBeUndefined();
        else await expect(read).rejects.toThrow(/ENOTDIR/);
    });

    it('rejects invalid JSON, a schema mismatch and an unknown page', async () => {
        const { playhouse } = await reader();
        await expect(playhouse.readJson('home', 'broken.json', z.object({}))).rejects.toThrow(SyntaxError);
        await expect(playhouse.readJson('home', 'summary.json', z.object({ value: z.number() }))).rejects.toThrow(
            /^home\/summary\.json is invalid:/
        );
        await expect(playhouse.readText('plp', 'summary.json')).rejects.toThrow('Unknown prepared page: plp');
    });
});
