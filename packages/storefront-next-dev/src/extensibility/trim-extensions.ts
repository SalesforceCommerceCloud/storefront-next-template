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

/**
 * Utility to trim the directory to remove unused components and unused extensions.
 * This is used to reduce the size of the project by removing the code that is not part of the selected extensions.
 */
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import type ExtensionConfig from './extension-config';
import { isSupportedFileExtension } from './path-util';
import { logger } from '../logger';

type ExtensionsSelection = Record<string, boolean>;

const SINGLE_LINE_MARKER = '@sfdc-extension-line';
const BLOCK_MARKER_START = '@sfdc-extension-block-start';
const BLOCK_MARKER_END = '@sfdc-extension-block-end';
const FILE_MARKER = '@sfdc-extension-file';

export default async function trimExtensions(
    directory: string,
    selectedExtensions?: Partial<ExtensionsSelection>,
    extensionConfig?: typeof ExtensionConfig
): Promise<void> {
    const startTime = Date.now();

    // read available extensions from config file
    const configuredExtensions: Record<string, unknown> = extensionConfig?.extensions || {};
    const extensions: ExtensionsSelection = {};
    Object.keys(configuredExtensions).forEach((targetKey) => {
        extensions[targetKey] = Boolean(selectedExtensions?.[targetKey]) || false;
    });

    if (Object.keys(extensions).length === 0) {
        logger.debug('No targets found, skipping trim');
        return;
    }

    const processDirectory = (dir: string): void => {
        const files = fs.readdirSync(dir);
        files.forEach((file) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);

            if (!filePath.includes('node_modules')) {
                if (stats.isDirectory()) {
                    processDirectory(filePath);
                } else if (isSupportedFileExtension(file)) {
                    processFile(filePath, extensions);
                }
            }
        });
    };

    processDirectory(directory);
    if (extensionConfig?.extensions) {
        // Rewrite config.json BEFORE deleting any folders. `updateExtensionConfig` formats
        // with the consumer's Prettier and throws on a bad Prettier config/plugin (common on a
        // customer project with a custom setup). If that throw happened after the folders were
        // already removed, the project would be left half-trimmed — folders gone but config.json
        // still listing the removed extensions. Doing the (only) throwing step first means a
        // failure aborts before anything destructive; the two steps are independent.
        await updateExtensionConfig(directory, extensions);
        deleteExtensionFolders(directory, extensions, extensionConfig);
    }
    const endTime = Date.now();
    logger.debug(`Trim extensions took ${endTime - startTime}ms`);
}

/**
 * Update the extension config file to only include the selected extensions.
 * @param projectDirectory - The project directory
 * @param extensionSelections - The selected extensions
 */
async function updateExtensionConfig(projectDirectory: string, extensionSelections: ExtensionsSelection) {
    const extensionConfigPath = path.join(projectDirectory, 'src', 'extensions', 'config.json');
    const extensionConfig = JSON.parse(fs.readFileSync(extensionConfigPath, 'utf8'));
    Object.keys(extensionConfig.extensions).forEach((extensionKey: string) => {
        if (!extensionSelections[extensionKey]) {
            delete extensionConfig.extensions[extensionKey];
        }
    });
    // `JSON.stringify(…, null, 4)` always expands short arrays (e.g. a one-element
    // `dependencies`) onto multiple lines and omits a trailing newline, so the written
    // file fails the project's own `prettier --write` / `pnpm lint`. Run it through the
    // project's Prettier (same pattern as the static-registry plugin) so the generated
    // config.json is lint-clean in the artifact a customer receives (W-23074938).
    const json = JSON.stringify({ extensions: extensionConfig.extensions }, null, 4);
    fs.writeFileSync(extensionConfigPath, await formatWithProjectPrettier(json, extensionConfigPath), 'utf8');
}

/**
 * Format generated JSON/JS so the written file matches what the project's
 * `prettier --write` / `pnpm lint` would produce.
 *
 * `trimExtensions` runs during `create-storefront`, BEFORE the generated project's
 * `pnpm install` — so the project's own Prettier is usually not on disk yet. We therefore
 * prefer the consumer's Prettier when it happens to be present (re-runs, manage-extensions
 * after install), but fall back to the SDK-bundled `prettier` (a hard dependency of this
 * package, pinned to the template's version) so formatting is deterministic and available
 * at generate time. Relying on the consumer's copy alone resolved only by accident in the
 * monorepo harness, where the generated dir is nested under the monorepo and `createRequire`
 * walks up to the monorepo's Prettier; a customer in a clean directory would get unformatted
 * output and fail lint on first run (W-23074938).
 *
 * NOTE: mirror of the helper in
 * packages/template/scripts/generate-eslint-config.js — kept separate because
 * the two live in different packages/module systems. Keep the parser/config-resolution
 * behavior in sync; the fallback chains INTENTIONALLY differ — this copy has a two-level
 * fallback (consumer Prettier → SDK-bundled `import('prettier')` → unformatted) because it
 * runs pre-install, while the generator copy has a single fallback (consumer Prettier →
 * unformatted). Don't "fix" that asymmetry or you reintroduce the pre-install bug (W-23074938).
 *
 * @param content - The serialized file content to format.
 * @param filePath - The file's path (drives parser selection + config resolution).
 * @returns The Prettier-formatted content. Returns the content unchanged only if no Prettier
 *   can be resolved at all; a genuine format/config error throws rather than silently shipping
 *   unformatted output.
 */
async function formatWithProjectPrettier(content: string, filePath: string): Promise<string> {
    let prettier;
    try {
        // Prefer the consumer's Prettier if already installed, so we match their exact
        // version/config; otherwise use the SDK-bundled copy (always available pre-install).
        const projectRequire = createRequire(filePath);
        prettier = projectRequire('prettier');
    } catch {
        try {
            prettier = (await import('prettier')).default;
        } catch {
            logger.warn('⚠️  Prettier could not be resolved; extension config.json will be written unformatted.');
            return content;
        }
    }
    try {
        // editorconfig: true matches the Prettier CLI default, so a consumer who sets
        // printWidth/tabWidth via .editorconfig gets the same output here as from their
        // own `prettier --write`.
        const config = await prettier.resolveConfig(filePath, { editorconfig: true });
        return await prettier.format(content, { ...config, filepath: filePath });
    } catch (error) {
        // A parse/config error (malformed .prettierrc, plugin incompatibility, …) is a real
        // bug — fail loudly instead of shipping a project that won't lint.
        throw new Error(`Prettier formatting failed for ${path.basename(filePath)}: ${(error as Error).message}`);
    }
}

/**
 * Process a file to trim extension-specific code based on markers.
 * @param filePath - The file path to process
 * @param extensions - The extension selections
 */
function processFile(filePath: string, extensions: ExtensionsSelection): void {
    const source = fs.readFileSync(filePath, 'utf-8');

    // If the file is guarded by a file-level marker and the extension is disabled, remove the file entirely
    if (source.includes(FILE_MARKER)) {
        // find() always returns a line since the if condition ensures marker exists, and FILE_MARKER has no newlines
        const markerLine = source.split('\n').find((line) => line.includes(FILE_MARKER)) as string;
        const extMatch = Object.keys(extensions).find((ext) => markerLine.includes(ext));
        if (!extMatch) {
            logger.warn(`File ${filePath} is marked with ${markerLine} but it does not match any known extensions`);
        } else if (extensions[extMatch] === false) {
            try {
                fs.unlinkSync(filePath);
                logger.debug(`Deleted file ${filePath}`);
            } catch (e: unknown) {
                const error = e as Error;
                logger.error(`Error deleting file ${filePath}: ${error.message}`);
                throw e;
            }
            return;
        }
    }

    // extensions will always have keys since trimExtensions validates this before calling processFile
    const extKeys = Object.keys(extensions);
    const extensionRegex = new RegExp(extKeys.join('|'), 'g');
    if (extensionRegex.test(source)) {
        const lines = source.split('\n');
        const newLines: string[] = [];
        const blockMarkers: { extension: string; line: number }[] = [];
        let skippingBlock = false;
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            if (line.includes(SINGLE_LINE_MARKER)) {
                const matchingExtension = Object.keys(extensions).find((extension) => line.includes(extension));
                if (matchingExtension && extensions[matchingExtension] === false) {
                    // Skip the marker line and the next line (the actual code line)
                    i += 2;
                    continue;
                }
            } else if (line.includes(BLOCK_MARKER_START)) {
                const matchingExtension = Object.keys(extensions).find((extension) => line.includes(extension));
                if (matchingExtension) {
                    blockMarkers.push({ extension: matchingExtension, line: i });
                    skippingBlock = extensions[matchingExtension] === false;
                } else {
                    logger.warn(`Unknown marker found in ${filePath} at line ${i}: \n${line}`);
                }
            } else if (line.includes(BLOCK_MARKER_END)) {
                const matchingExtension = Object.keys(extensions).find((extension) => line.includes(extension));
                if (matchingExtension) {
                    const extension = Object.keys(extensions).find((p) => line.includes(p));
                    if (blockMarkers.length === 0) {
                        throw new Error(
                            `Block marker mismatch in ${filePath}, encountered end marker ${extension} without a matching start marker at line ${i}:\n${lines[i]}`
                        );
                    }
                    const startMarker = blockMarkers.pop() as { extension: string; line: number };
                    if (!extension || startMarker.extension !== extension) {
                        throw new Error(
                            `Block marker mismatch in ${filePath}, expected end marker for ${startMarker.extension} but got ${extension} at line ${i}:\n${lines[i]}`
                        );
                    }
                    if (extensions[extension] === false) {
                        // Skip the entire block (marker lines are already skipped by skippingBlock)
                        skippingBlock = false;
                        i++;
                        continue;
                    }
                }
            }
            if (!skippingBlock) {
                newLines.push(line);
            }
            i++;
        }

        if (blockMarkers.length > 0) {
            throw new Error(
                `Unclosed end marker found in ${filePath}: ${blockMarkers[blockMarkers.length - 1].extension}`
            );
        }

        // Only write if content changed
        const newSource = newLines.join('\n');
        if (newSource !== source) {
            try {
                fs.writeFileSync(filePath, newSource);
                logger.debug(`Updated file ${filePath}`);
            } catch (e: unknown) {
                const error = e as Error;
                logger.error(`Error updating file ${filePath}: ${error.message}`);
                throw e;
            }
        }
    }
}

/**
 * Delete extension folders for disabled extensions.
 * @param projectRoot - The project root directory
 * @param extensions - The extension selections
 * @param extensionConfig - The extension configuration
 */
function deleteExtensionFolders(
    projectRoot: string,
    extensions: ExtensionsSelection,
    extensionConfig: typeof ExtensionConfig & { extensions: Record<string, unknown> }
): void {
    const extensionsDir = path.join(projectRoot, 'src', 'extensions');
    if (!fs.existsSync(extensionsDir)) {
        return;
    }

    const configuredExtensions = extensionConfig.extensions;
    const disabledExtensions = Object.keys(extensions).filter((ext) => extensions[ext] === false);

    disabledExtensions.forEach((extKey) => {
        const extensionMeta = configuredExtensions[extKey] as { folder?: string } | undefined;
        if (extensionMeta?.folder) {
            const extensionFolderPath = path.join(extensionsDir, extensionMeta.folder);
            if (fs.existsSync(extensionFolderPath)) {
                try {
                    fs.rmSync(extensionFolderPath, { recursive: true, force: true });
                    logger.debug(`Deleted extension folder: ${extensionFolderPath}`);
                } catch (err: unknown) {
                    const error = err as Error & { code?: string };
                    if (error.code === 'EPERM') {
                        logger.error(
                            `Permission denied - cannot delete ${extensionFolderPath}. You may need to run with sudo or check permissions.`
                        );
                    } else {
                        logger.error(`Error deleting ${extensionFolderPath}: ${error.message}`);
                    }
                }
            }
        }
    });
}
