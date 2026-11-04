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
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import type { PlayhouseCollection } from './playhouse';

function contained(base: string, candidate: string): boolean {
    const relative = path.relative(base, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function safeFile(root: string, relativePath: string, maxBytes?: number): Promise<string> {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..'))
        throw new Error(`Unsafe relative path: ${relativePath}`);
    const base = await realpath(root);
    const candidate = path.resolve(base, relativePath);
    if (!contained(base, candidate)) throw new Error(`Path escaped its root: ${relativePath}`);
    let current = base;
    for (const part of path.relative(base, candidate).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const info = await lstat(current);
        if (info.isSymbolicLink()) throw new Error(`Path must not contain a symlink: ${relativePath}`);
    }
    const info = await lstat(candidate);
    if (!info.isFile()) throw new Error(`Path is not a file: ${relativePath}`);
    if (maxBytes !== undefined && info.size > maxBytes)
        throw new Error(`File exceeds ${maxBytes} bytes: ${relativePath}`);
    return candidate;
}

/** Every file under `root`, as sorted POSIX paths relative to it. Symlinks are skipped. */
export async function listArchiveFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .slice()
        .sort();
}

async function exists(file: string): Promise<boolean> {
    try {
        await lstat(file);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

export class PlayhouseArtifactReader {
    readonly #pages: Map<string, PlayhouseCollection>;

    constructor(pages: readonly PlayhouseCollection[]) {
        this.#pages = new Map(pages.map((page) => [page.label, page]));
    }

    artifactNames(pageLabel: string): Promise<string[]> {
        return listArchiveFiles(this.#page(pageLabel).archiveDir);
    }

    async readJson<T>(pageLabel: string, artifactName: string, schema: z.ZodType<T>): Promise<T | undefined> {
        const text = await this.readText(pageLabel, artifactName);
        if (text === undefined) return undefined;
        const parsed = schema.safeParse(JSON.parse(text));
        if (!parsed.success) throw new Error(`${pageLabel}/${artifactName} is invalid: ${parsed.error.message}`);
        return parsed.data;
    }

    async readText(pageLabel: string, artifactName: string, maxBytes?: number): Promise<string | undefined> {
        const page = this.#page(pageLabel);
        if (!(await exists(path.join(page.archiveDir, artifactName)))) return undefined;
        return readFile(await safeFile(page.archiveDir, artifactName, maxBytes), 'utf8');
    }

    #page(label: string): PlayhouseCollection {
        const page = this.#pages.get(label);
        if (!page) throw new Error(`Unknown prepared page: ${label}`);
        return page;
    }
}
