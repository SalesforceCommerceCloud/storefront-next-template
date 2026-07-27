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

import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger';

/** This module's own path — the resolution root for the SDK-bundled Biome fallback. */
const HERE = fileURLToPath(import.meta.url);

/**
 * Format generated file content with the *consuming project's* Biome so the written file
 * matches what the project's own `biome format` / `pnpm lint:fix` would produce.
 *
 * The SDK generates two kinds of files into a customer project — the extension `config.json`
 * (`trim-extensions.ts`) and the static component registry (`staticRegistry.ts`). Both must
 * be emitted in the exact byte shape the project's formatter produces, or the generated file
 * fails `pnpm lint` on a fresh project / churns on every `biome format --write` (W-23074938).
 *
 * Biome is preferred from the target file's own location — i.e. the consuming project's
 * `node_modules` — so it's the project's Biome version whose output is matched. When that
 * isn't installed yet (e.g. `create-storefront` runs `trim-extensions` BEFORE the generated
 * project's first `pnpm install`), we fall back to the SDK-bundled `@biomejs/biome` (a hard
 * dependency of this package, pinned to the template's version). Either way the file's
 * committed `biome.json` governs the output: Biome discovers its config by walking up from
 * the working directory, so we spawn it with `cwd` set to the file's directory and pass the
 * file's basename via `--stdin-file-path` (which drives both parser selection and formatting).
 *
 * Returns the content unchanged when no Biome can be resolved at all or the format fails, so
 * generation never breaks over formatting. A genuine format error is logged but non-fatal —
 * an unformatted-but-valid file is recoverable by the customer running `biome format --write`.
 *
 * @param content - The serialized file content to format.
 * @param filePath - The file's path (drives parser selection + config resolution + cwd).
 * @returns The Biome-formatted content, or the original content if Biome is unavailable.
 */
export function formatWithProjectBiome(content: string, filePath: string): string {
    const biomeBin = resolveBiomeBin(filePath);
    if (!biomeBin) {
        logger.warn(`⚠️  Biome could not be resolved; ${basename(filePath)} will be written unformatted.`);
        return content;
    }

    // Biome resolves biome.json by walking up from cwd, so run it from the file's directory
    // and identify the file by basename for parser selection.
    const result = spawnSync(process.execPath, [biomeBin, 'format', `--stdin-file-path=${basename(filePath)}`], {
        cwd: dirname(filePath),
        input: content,
        encoding: 'utf8',
    });

    if (result.status !== 0 || typeof result.stdout !== 'string') {
        const detail = result.stderr?.trim() || `exit code ${result.status}`;
        logger.warn(`⚠️  Skipping Biome formatting for ${basename(filePath)}: ${detail}`);
        return content;
    }

    return result.stdout;
}

/**
 * Format every file Biome recognizes under `directory` in place with the consuming project's
 * Biome, so generated files (e.g. cartridge metadata JSON) match `biome format` / `pnpm lint:fix`.
 *
 * Unlike {@link formatWithProjectBiome} (single file via stdin), this runs `biome format --write`
 * against the directory so Biome discovers the project's `biome.json` by walking up from it and
 * applies the project's formatting to the written files directly.
 *
 * Fail-safe: when Biome can't be resolved or the run fails, the files are left as written (valid,
 * just unformatted) and a warning is logged — generation never breaks over formatting.
 *
 * @param directory - Directory whose Biome-recognized files should be formatted in place.
 */
export function formatDirectoryWithProjectBiome(directory: string): void {
    // Resolve Biome as if from a file inside the directory, so a node_modules directly under
    // `directory` is on the resolution path (createRequire resolves relative to the file's dir).
    const biomeBin = resolveBiomeBin(join(directory, 'biome-resolution-root.js'));
    if (!biomeBin) {
        logger.warn(`⚠️  Biome could not be resolved; generated files in ${directory} were left unformatted.`);
        return;
    }

    // `--write` formats in place; Biome resolves biome.json by walking up from cwd, so run it
    // from the target directory. It exits non-zero if a file can't be fixed, which we treat as
    // non-fatal — the files are still valid, just not reformatted.
    const result = spawnSync(process.execPath, [biomeBin, 'format', '--write', '.'], {
        cwd: directory,
        encoding: 'utf8',
    });

    if (result.status !== 0) {
        const detail = result.stderr?.trim() || `exit code ${result.status}`;
        logger.warn(`⚠️  Some generated files in ${directory} could not be formatted by Biome: ${detail}`);
        return;
    }

    logger.debug(`✅ Formatted generated files in ${directory} with Biome`);
}

/**
 * Resolve a Biome CLI binary path, preferring the consuming project's install and falling back
 * to the SDK-bundled copy (available pre-install). Returns null when neither resolves.
 */
function resolveBiomeBin(filePath: string): string | null {
    // Prefer the project's own @biomejs/biome (resolved from the target file's location);
    // fall back to this SDK package's bundled copy when the project isn't installed yet.
    for (const fromPath of [filePath, HERE]) {
        try {
            const req = createRequire(fromPath);
            const biomePkgJson = req.resolve('@biomejs/biome/package.json');
            const { bin } = req(biomePkgJson) as { bin: { biome: string } };
            return join(dirname(biomePkgJson), bin.biome);
        } catch {
            // Try the next resolution root.
        }
    }
    return null;
}
