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
import path from 'path';
import type ExtensionConfig from './extension-config';
import { isSupportedFileExtension } from './path-util';
import { logger } from '../logger';
import { formatFilesWithBundledBiome } from '../utils/format-with-project-biome';

type ExtensionsSelection = Record<string, boolean>;

const SINGLE_LINE_MARKER = '@sfdc-extension-line';
const BLOCK_MARKER_START = '@sfdc-extension-block-start';
const BLOCK_MARKER_END = '@sfdc-extension-block-end';
const FILE_MARKER = '@sfdc-extension-file';

// The body is synchronous now that config rewriting uses Biome via spawnSync, but the
// `Promise<void>` signature is a stable public contract awaited by create-storefront and
// manage-extensions — keep it async so callers don't have to change.
// oxlint-disable-next-line typescript/require-await -- intentional async public API (see above)
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

    const processDirectory = (dir: string): string[] => {
        const modifiedFiles: string[] = [];
        const files = fs.readdirSync(dir);
        files.forEach((file) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);

            if (!filePath.includes('node_modules')) {
                if (stats.isDirectory()) {
                    modifiedFiles.push(...processDirectory(filePath));
                } else if (isSupportedFileExtension(file)) {
                    if (processFile(filePath, extensions)) {
                        modifiedFiles.push(filePath);
                    }
                }
            }
        });
        return modifiedFiles;
    };

    const modifiedFiles = processDirectory(directory);
    if (extensionConfig?.extensions) {
        // Rewrite config.json BEFORE deleting any folders. `updateExtensionConfig` reads and
        // rewrites config.json; if it threw after the folders were already removed, the project
        // would be left half-trimmed — folders gone but config.json still listing the removed
        // extensions. Doing the (only) throwing step first means a failure aborts before
        // anything destructive; the two steps are independent.
        modifiedFiles.push(updateExtensionConfig(directory, extensions));
        deleteExtensionFolders(directory, extensions, extensionConfig);
    }
    formatFilesWithBundledBiome(
        directory,
        // Disabled extension folders are deleted after their files are trimmed. Do not pass
        // those now-missing paths to Biome along with the files that remain in the project.
        modifiedFiles.filter((filePath) => fs.existsSync(filePath))
    );
    const endTime = Date.now();
    logger.debug(`Trim extensions took ${endTime - startTime}ms`);
}

/**
 * Update the extension config file to only include the selected extensions.
 * @param projectDirectory - The project directory
 * @param extensionSelections - The selected extensions
 */
function updateExtensionConfig(projectDirectory: string, extensionSelections: ExtensionsSelection): string {
    const extensionConfigPath = path.join(projectDirectory, 'src', 'extensions', 'config.json');
    const extensionConfig = JSON.parse(fs.readFileSync(extensionConfigPath, 'utf8'));
    Object.keys(extensionConfig.extensions).forEach((extensionKey: string) => {
        if (!extensionSelections[extensionKey]) {
            delete extensionConfig.extensions[extensionKey];
        }
    });
    // Format this alongside the trimmed source files below. Keeping the content write separate
    // from formatting lets the SDK use its pinned Biome instead of executing a project's binary.
    const json = JSON.stringify({ extensions: extensionConfig.extensions }, null, 4);
    fs.writeFileSync(extensionConfigPath, json, 'utf8');
    return extensionConfigPath;
}

/**
 * Process a file to trim extension-specific code based on markers.
 * @param filePath - The file path to process
 * @param extensions - The extension selections
 */
function processFile(filePath: string, extensions: ExtensionsSelection): boolean {
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
            return false;
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
                    skippingBlock = blockMarkers.some(({ extension }) => extensions[extension] === false);
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
                    const closedDisabledBlock = extensions[startMarker.extension] === false;
                    skippingBlock = blockMarkers.some(
                        ({ extension: blockExtension }) => extensions[blockExtension] === false
                    );
                    if (closedDisabledBlock || skippingBlock) {
                        // Do not let a nested block change whether its disabled parent is skipped.
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
                return true;
            } catch (e: unknown) {
                const error = e as Error;
                logger.error(`Error updating file ${filePath}: ${error.message}`);
                throw e;
            }
        }
    }
    return false;
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
