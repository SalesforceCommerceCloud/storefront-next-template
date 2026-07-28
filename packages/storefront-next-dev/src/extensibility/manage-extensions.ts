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
import prompts from 'prompts';
import path from 'path';
import fs from 'fs-extra';
import type { ExtensionMeta } from './extension-config';
import trimExtensions from './trim-extensions';
import os from 'os';
import { execSync } from 'child_process';
import { z } from 'zod';
import { getMissingDependencies, resolveDependentsForMultiple, type ExtensionConfig } from './dependency-utils';
import { logger } from '../logger';

const EXTENSIONS_DIR = ['src', 'extensions'];
const CONFIG_PATH = [...EXTENSIONS_DIR, 'config.json'];
const EXTENSION_FOLDERS = ['components', 'locales', 'hooks', 'routes'];

const consoleLog = (message: string, type: 'error' | 'success' | 'info') => {
    switch (type) {
        case 'error':
            logger.error(`❌ ${message}`);
            break;
        case 'success':
            logger.info(`✅ ${message}`);
            break;
        default:
            logger.info(message);
            break;
    }
};

/**
 * Get the path to the extension config file
 */
const getExtensionConfigPath = (projectDirectory: string) => {
    return path.join(projectDirectory, ...CONFIG_PATH);
};

/**
 * Check if the project directory contains the extensions directory and config.json file
 */
const getExtensionConfig = (projectDirectory: string): Record<string, ExtensionMeta> => {
    const extensionConfigPath = getExtensionConfigPath(projectDirectory);
    if (!fs.existsSync(extensionConfigPath)) {
        consoleLog(
            `Extension config file not found: ${extensionConfigPath}. Are you running this command in the correct project directory?`,
            'error'
        );
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(extensionConfigPath, 'utf8')).extensions;
};

/**
 * Common function to get the extension selection from the user
 * @param type 'multiselect' | 'select'
 * @param extensionConfig Record<string, ExtensionMeta>
 * @param message string
 * @param installedExtensions string[]
 * @param excludeExtensions string[] extensions to exclude from the list, so we can filter out extensions that are already installed
 * @returns string[]
 */
const getExtensionSelection = async (
    type: 'multiselect' | 'select',
    extensionConfig: Record<string, ExtensionMeta>,
    message: string,
    installedExtensions: string[],
    excludeExtensions: string[] = []
) => {
    consoleLog('\n', 'info');
    const { selectedExtensions } = await prompts({
        type,
        name: 'selectedExtensions',
        message,
        choices: installedExtensions
            .filter((extensionKey: string) => !excludeExtensions.includes(extensionKey))
            .map((extensionKey: string) => ({
                title: `${extensionConfig[extensionKey].name} - ${extensionConfig[extensionKey].description}`,
                value: extensionKey,
            })),
        instructions: false,
    });
    return type === 'multiselect' ? selectedExtensions : [selectedExtensions];
};

/**
 * Handle the uninstallation of extensions
 * @param extensionConfig Record<string, ExtensionMeta>
 * @param options {
    projectDirectory: string;
    extensions?: string[];
}
 * @returns void
 */
const handleUninstall = async (
    extensionConfig: Record<string, ExtensionMeta>,
    options: {
        projectDirectory: string;
        extensions?: string[];
    }
) => {
    let installedExtensions: string[] = Object.keys(extensionConfig);
    if (installedExtensions.length === 0) {
        consoleLog('\n You have not installed any extensions yet.', 'error');
        return;
    }
    const selectedExtensions = options.extensions
        ? options.extensions
        : await getExtensionSelection(
              'multiselect',
              extensionConfig,
              '🔌 Which extensions would you like to uninstall?',
              installedExtensions
          );
    if (selectedExtensions == null || selectedExtensions.length === 0) {
        consoleLog('\n Please select at least one extension to uninstall.', 'error');
        return;
    }

    // Resolve the full dependent chain (in reverse topological order - dependents first)
    const config: ExtensionConfig = { extensions: extensionConfig };
    const allToUninstall = resolveDependentsForMultiple(selectedExtensions, config);

    // Filter to only installed extensions (in case of stale config)
    const installedSet = new Set(installedExtensions);
    const extensionsToUninstall = allToUninstall.filter((key) => installedSet.has(key));

    // Find additional dependents that weren't originally selected
    const selectedSet = new Set(selectedExtensions);
    const additionalDependents = extensionsToUninstall.filter((key) => !selectedSet.has(key));

    // If there are additional dependents, prompt the user
    if (additionalDependents.length > 0) {
        consoleLog('\n', 'info');
        consoleLog(
            `Uninstalling the selected extension(s) will also uninstall the following dependent extensions:`,
            'info'
        );
        additionalDependents.forEach((depKey) => {
            const depExtension = extensionConfig[depKey];
            // Find which selected extension this depends on
            const dependsOn = selectedExtensions.find((selKey: string) => {
                const selExt = extensionConfig[selKey];
                return selExt && extensionConfig[depKey]?.dependencies?.includes(selKey);
            });
            const dependsOnName = dependsOn ? extensionConfig[dependsOn]?.name : 'selected extension';
            consoleLog(` • ${depExtension?.name || depKey} (depends on ${dependsOnName})`, 'info');
        });
        consoleLog('\n', 'info');

        const { confirmUninstall } = await prompts({
            type: 'confirm',
            name: 'confirmUninstall',
            message: `Uninstall all ${extensionsToUninstall.length} extensions?`,
            initial: true,
        });

        if (!confirmUninstall) {
            consoleLog('Uninstallation aborted.', 'info');
            return;
        }
    }

    // Uninstall in reverse topological order (dependents first, then dependencies)
    // delete the extension folders
    extensionsToUninstall.forEach((ext: string) => {
        if (extensionConfig[ext]?.folder) {
            fs.rmSync(path.join(options.projectDirectory, ...EXTENSIONS_DIR, extensionConfig[ext].folder), {
                recursive: true,
                force: true,
            });
        }
    });
    // trim the extensions in source project
    const extensionsToUninstallSet = new Set(extensionsToUninstall);
    installedExtensions = installedExtensions.filter((ext) => !extensionsToUninstallSet.has(ext));
    await trimExtensions(options.projectDirectory, Object.fromEntries(installedExtensions.map((ext) => [ext, true])), {
        extensions: extensionConfig,
    });
    consoleLog(' Extensions uninstalled.', 'success');
};

/**
 * Install a single extension (internal helper)
 * @returns true if installation succeeded, false otherwise
 */
const installSingleExtension = (
    extensionKey: string,
    srcExtensionConfig: Record<string, ExtensionMeta>,
    extensionConfig: Record<string, ExtensionMeta>,
    tmpDir: string,
    projectDirectory: string
): boolean => {
    const extension = srcExtensionConfig[extensionKey];

    const startTime = Date.now();
    // copy the extension folder to the project directory
    if (extension.folder) {
        fs.copySync(
            path.join(tmpDir, ...EXTENSIONS_DIR, extension.folder),
            path.join(projectDirectory, ...EXTENSIONS_DIR, extension.folder)
        );
    }
    if (extension.installationInstructions) {
        logger.info(`⏳ Installing ${extension.name}, this will take a few minutes...`);
        try {
            execSync(
                `cursor-agent -p --force 'Execute the steps specified in the installation instructions file: ${extension.installationInstructions}' --output-format text`,
                { cwd: projectDirectory, stdio: 'inherit' }
            );
        } catch (e) {
            consoleLog(`Error installing ${extension.name}. ${(e as Error).message}`, 'error');
            return false;
        }
    }
    // update config.json to include the installed extension
    extensionConfig[extensionKey] = extension;
    fs.writeFileSync(
        getExtensionConfigPath(projectDirectory),
        JSON.stringify({ extensions: extensionConfig }, null, 4)
    );
    consoleLog(`${extension.name} was installed successfully. (${Date.now() - startTime}ms)`, 'success');
    return true;
};

/**
 * Handle the installation of extensions
 * @param extensionConfig
 * @param options {
    sourceGithubUrl?: string;
    projectDirectory: string;
    extensions?: string[];
}
 * @returns
 */
const handleInstall = async (
    extensionConfig: Record<string, ExtensionMeta>,
    options: {
        sourceGitUrl?: string;
        projectDirectory: string;
        extensions?: string[];
    }
) => {
    const { sourceGitUrl } = await prompts({
        type: 'text',
        name: 'sourceGitUrl',
        message: '🌐 What is the Git URL for the extensions project?',
        initial: options.sourceGitUrl,
    });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `sfnext-extensions-${Date.now()}`));
    execSync(`git clone ${sourceGitUrl} ${tmpDir}`);
    const srcExtensionConfig = getExtensionConfig(tmpDir);
    if (srcExtensionConfig == null || Object.keys(srcExtensionConfig).length === 0) {
        consoleLog(
            `No extensions found in the source project, please check ${path.join(...CONFIG_PATH)} exists in ${sourceGitUrl} and contains at least one extension.`,
            'error'
        );
        return;
    }
    const selectedExtensions = options.extensions
        ? options.extensions
        : await getExtensionSelection(
              'select',
              srcExtensionConfig,
              '🔌 Which extension would you like to install?',
              Object.keys(srcExtensionConfig),
              Object.keys(extensionConfig)
          );
    if (selectedExtensions == null || selectedExtensions.length !== 1 || selectedExtensions[0] == null) {
        consoleLog('Please select exactly one extension to install.', 'error');
        return;
    }

    const extensionKey = selectedExtensions[0];
    const extension = srcExtensionConfig[extensionKey];

    // Check if cursor cli is installed (needed for any extension with installation instructions)
    const hasInstructionsInChain = Object.values(srcExtensionConfig).some((ext) => ext.installationInstructions);
    if (hasInstructionsInChain) {
        try {
            execSync('cursor-agent -v', { stdio: 'ignore' });
            // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
            consoleLog(
                'This extension contains LLM instructions, please install cursor cli and try again. (https://cursor.com/docs/cli/overview)',
                'error'
            );
            return;
        }
    }

    // Resolve dependencies using the source config (which has full dependency information)
    const srcConfig: ExtensionConfig = { extensions: srcExtensionConfig };
    const installedExtensions = Object.keys(extensionConfig);
    const missingDeps = getMissingDependencies(extensionKey, installedExtensions, srcConfig);

    // The missingDeps includes the requested extension itself at the end (topological order)
    // We need to present the dependencies (all except the last item) to the user
    const dependenciesToInstall = missingDeps.slice(0, -1);

    let hasError = false;
    try {
        // If there are missing dependencies, prompt the user
        if (dependenciesToInstall.length > 0) {
            consoleLog('\n', 'info');
            consoleLog(`Installing ${extension.name} requires the following dependencies:`, 'info');
            dependenciesToInstall.forEach((depKey) => {
                const depExtension = srcExtensionConfig[depKey];
                consoleLog(` • ${depExtension?.name || depKey} (not installed)`, 'info');
            });
            consoleLog('\n', 'info');

            const estimatedMinutes = missingDeps.length * 5; // ~5 minutes per extension
            const { confirmInstall } = await prompts({
                type: 'confirm',
                name: 'confirmInstall',
                message: `Install all ${missingDeps.length} extensions? (~${estimatedMinutes} minutes total)`,
                initial: true,
            });

            if (!confirmInstall) {
                consoleLog('Installation aborted.', 'info');
                return;
            }
        }

        // Install extensions in topological order (dependencies first)
        for (const depKey of missingDeps) {
            const success = installSingleExtension(
                depKey,
                srcExtensionConfig,
                extensionConfig,
                tmpDir,
                options.projectDirectory
            );
            if (!success) {
                hasError = true;
                // Continue with remaining extensions - partial installs are allowed
                // Already-installed dependencies remain in config.json
            }
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // find all the .original files recursively and report them
    const originalFiles = fs
        .readdirSync(path.join(options.projectDirectory, 'src'), { recursive: true })
        .filter((file: string | Buffer<ArrayBufferLike>) => file.toString().endsWith('.original'));
    if (originalFiles.length > 0) {
        consoleLog(
            '\n📄 The following files were modified. The original files are still available in the same location with the ".original" extension:',
            'info'
        );
        originalFiles.forEach((file: string | Buffer<ArrayBufferLike>) => {
            consoleLog(`- ${file.toString().replace('.original', '')}`, 'info');
        });
    }
    if (!hasError) {
        consoleLog('\n🚀 Installation completed successfully.', 'info');
    }
};

export const manageExtensions = async (options: {
    projectDirectory: string;
    install?: boolean;
    uninstall?: boolean;
    extensions?: string[];
    sourceGitUrl?: string;
}) => {
    if (options.install && options.uninstall) {
        consoleLog('Please select either install or uninstall, not both.', 'error');
        return;
    }
    // Initialize operation based on options or user input
    let operation: string | undefined = options.install ? 'install' : options.uninstall ? 'uninstall' : undefined;
    const extensionConfig: Record<string, ExtensionMeta> = getExtensionConfig(options.projectDirectory);

    if (operation == null) {
        const value = await prompts({
            type: 'select',
            name: 'operation',
            message: '🤔 What would you like to do?',
            choices: [
                { title: 'Install extensions', value: 'install' },
                { title: 'Uninstall extensions', value: 'uninstall' },
            ],
        });
        operation = value.operation;
    }
    if (operation === 'uninstall') {
        await handleUninstall(extensionConfig, options);
    } else {
        await handleInstall(extensionConfig, options);
    }
};

const getExtensionMarker = (val: string) => {
    return `SFDC_EXT_${val.toUpperCase().replaceAll(' ', '_').replaceAll('-', '_')}`;
};

const getExtensionFolderName = (val: string) => {
    return val.toLowerCase().replaceAll(' ', '-').trim();
};

const getExtensionNameSchema = (projectDirectory: string, extensionConfig: Record<string, ExtensionMeta>) => {
    return z
        .object({
            name: z.string().regex(/^[a-zA-Z0-9 _-]+$/, {
                message: 'Extension name can only contain alphanumeric characters, spaces, dashes, or underscores',
            }),
        })
        .superRefine((data: { name: string }, ctx: z.RefinementCtx) => {
            if (extensionConfig[getExtensionMarker(data.name)]) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Extension "${data.name}" already exists`,
                });
            }
            if (fs.existsSync(path.join(projectDirectory, ...EXTENSIONS_DIR, getExtensionFolderName(data.name)))) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Extension directory ${getExtensionFolderName(data.name)} already exists`,
                });
            }
        });
};

export const listExtensions = (options: { projectDirectory: string }) => {
    const extensionConfig: Record<string, ExtensionMeta> = getExtensionConfig(options.projectDirectory);
    consoleLog('The following extensions are installed:', 'info');
    Object.keys(extensionConfig).forEach((key) => {
        consoleLog(`- ${extensionConfig[key].name}: ${extensionConfig[key].description}`, 'info');
    });
};

export const createExtension = async (options: { projectDirectory: string; name: string; description: string }) => {
    const { projectDirectory, name, description } = options;
    const extensionConfig: Record<string, ExtensionMeta> = getExtensionConfig(projectDirectory);
    let extensionName = name;
    let extensionDescription = description;
    if (extensionName == null || extensionName.trim() === '') {
        const value = await prompts({
            type: 'text',
            name: 'extensionName',
            message: 'What would you like to name the extension? (e.g., "My Extension")',
        });
        extensionName = value.extensionName;
    }
    const extensionNameSchema = getExtensionNameSchema(projectDirectory, extensionConfig);
    const result = extensionNameSchema.safeParse({ name: extensionName });
    if (!result.success) {
        const firstIssueMessage = result.error.issues?.[0]?.message;
        consoleLog(firstIssueMessage, 'error');
        return;
    }
    if (extensionDescription == null || extensionDescription.trim() === '') {
        const value = await prompts({
            type: 'text',
            name: 'extensionDescription',
            message: 'How would you describe the extension?',
        });
        extensionDescription = value.extensionDescription;
    }
    const folderName = getExtensionFolderName(extensionName);
    // create the extension directory and a read me file
    const extensionFolderPath = path.join(projectDirectory, ...EXTENSIONS_DIR, folderName);
    fs.mkdirSync(extensionFolderPath, { recursive: true });
    EXTENSION_FOLDERS.forEach((folder) => {
        fs.mkdirSync(path.join(extensionFolderPath, folder), { recursive: true });
    });
    fs.writeFileSync(path.join(extensionFolderPath, 'README.md'), `# ${extensionName}\n\n${extensionDescription}`);
    // update the extension config.json file
    const marker = getExtensionMarker(extensionName);
    extensionConfig[marker] = {
        name: extensionName,
        description: extensionDescription,
        installationInstructions: '',
        uninstallationInstructions: '',
        folder: folderName,
        dependencies: [],
    };
    fs.writeFileSync(
        path.join(projectDirectory, ...CONFIG_PATH),
        JSON.stringify({ extensions: extensionConfig }, null, 4)
    );
    consoleLog(`Extension "${extensionName}" scaffolding was created successfully.`, 'success');
};
