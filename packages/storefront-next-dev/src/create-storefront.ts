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
import { execFileSync, execSync } from 'child_process';
import { generateEnvFile } from './utils';
import { logger } from './logger';
import prompts from 'prompts';
import path from 'path';
import fs from 'fs-extra';
import { parseEnv } from 'node:util';
import trimExtensions from './extensibility/trim-extensions';
import {
    resolveDependenciesForMultiple,
    validateNoCycles,
    type ExtensionConfig,
} from './extensibility/dependency-utils';
import { prepareForLocalDev } from './utils/local-dev-setup';

const DEFAULT_STOREFRONT = 'sfcc-storefront';

// Per-vertical customer-facing template repositories. Each vertical is published to
// its own GitHub repo (not branches/tags of a shared repo), so the CLI clones one of
// these — or a custom URL the user supplies.
const STOREFRONT_FASHION_URL = 'https://github.com/SalesforceCommerceCloud/storefront-next-template';
const STOREFRONT_COSMETIC_URL = 'https://github.com/SalesforceCommerceCloud/storefront-next-beauty';
const STOREFRONT_FOUNDATIONS_URL = 'https://github.com/SalesforceCommerceCloud/storefront-next-foundations';

/**
 * Available storefront verticals, keyed by the value accepted by the `--vertical` flag.
 * `label` is the human-facing choice shown in the interactive prompt; `url` is the
 * published template repository cloned for that vertical. Extend this map to surface a
 * new vertical in both the prompt and the flag.
 */
const VERTICALS: Record<string, { label: string; url: string }> = {
    fashion: { label: 'Salesforce B2C Commerce Retail Storefront (Fashion)', url: STOREFRONT_FASHION_URL },
    cosmetic: { label: 'Salesforce B2C Commerce Beauty Storefront (Cosmetic)', url: STOREFRONT_COSMETIC_URL },
    foundations: {
        label: 'Salesforce B2C Commerce Foundations Storefront (Foundations)',
        url: STOREFRONT_FOUNDATIONS_URL,
    },
};

// The vertical used when `--defaults` is set but no template/vertical is specified.
const DEFAULT_VERTICAL = 'fashion';

const isLocalPath = (template: string): boolean =>
    template.startsWith('file://') ||
    template.startsWith('/') ||
    template.startsWith('./') ||
    template.startsWith('../');

export const createStorefront = async (
    options: {
        localPackagesDir?: string;
        name?: string;
        template?: string;
        vertical?: string;
        templateBranch?: string;
        defaults?: boolean;
        outputDir?: string;
    } = {}
) => {
    // Check if git is available before proceeding
    try {
        execSync('git --version', { stdio: 'ignore' });
    } catch (e) {
        logger.error(
            `❌ git is not installed or found in your PATH. Install git before running this command: ${String(e)}`
        );
        process.exit(1);
    }

    // Use provided name or prompt for it
    let storefront = options.name;
    if (!storefront) {
        const response = await prompts({
            type: 'text',
            name: 'storefront',
            message: '🏪 What would you like to name your storefront?\n',
            initial: DEFAULT_STOREFRONT,
        });
        storefront = response.storefront;
    }
    if (!storefront) {
        logger.error('Storefront name is required.');
        process.exit(1);
    }
    logger.info('\n');

    const outputPath = options.outputDir ? path.join(options.outputDir, storefront) : storefront;

    // Resolve the template to clone in strict priority order — each branch only runs
    // when no higher-priority option already set `template`, so the order below is the
    // precedence (highest first):
    //   1. --template (explicit URL/path) always wins.
    //   2. --vertical maps to that vertical's published repo and skips the prompt.
    //   3. --defaults (with neither of the above) falls back to the default vertical
    //      so CI/automation never blocks on the interactive prompt.
    //   4. Otherwise prompt the user to pick a vertical or supply a custom URL.
    // The `else if` makes the precedence structural: --vertical wins over --defaults, and
    // --defaults can never override an explicit --template (the `!template` guard).
    let template = options.template;
    if (!template && options.vertical) {
        const vertical = VERTICALS[options.vertical];
        if (!vertical) {
            logger.error(
                `Unknown vertical "${options.vertical}". Available verticals: ${Object.keys(VERTICALS).join(', ')}.`
            );
            process.exit(1);
        }
        template = vertical.url;
    } else if (!template && options.defaults) {
        template = VERTICALS[DEFAULT_VERTICAL].url;
    }
    if (!template) {
        const response = await prompts({
            type: 'select',
            name: 'template',
            message: '📄 Which template would you like to use for your storefront?\n',
            choices: [
                ...Object.values(VERTICALS).map((vertical) => ({ title: vertical.label, value: vertical.url })),
                { title: 'A different template (I will provide the Github URL)', value: 'custom' },
            ],
        });
        template = response.template;
        logger.info('\n');
        if (template === 'custom') {
            const { githubUrl } = await prompts({
                type: 'text',
                name: 'githubUrl',
                message: '🌐 What is the Github URL for your template?\n',
            });
            if (!githubUrl) {
                logger.error('Github URL is required.');
                process.exit(1);
            }
            template = githubUrl;
        }
    }
    if (!template) {
        logger.error('Template is required.');
        process.exit(1);
    }
    if (options.templateBranch !== undefined && options.templateBranch.trim() === '') {
        logger.error('--template-branch cannot be empty.');
        process.exit(1);
    }
    // Clone or copy the template into the storefront directory
    if (isLocalPath(template)) {
        const resolvedPath = path.resolve(template.replace('file://', ''));
        if (fs.existsSync(path.join(resolvedPath, '.git'))) {
            // Local git repo: use git clone (shallow) as usual
            // (Use execFileSync instead of execSync to avoid shell injection — arguments are passed
            // directly to the git binary without going through a shell interpreter)
            const cloneArgs = ['clone', '--depth', '1'];
            if (options.templateBranch) cloneArgs.push('--branch', options.templateBranch);
            cloneArgs.push(resolvedPath, outputPath);
            execFileSync('git', cloneArgs);
        } else {
            // Local non-git directory: copy directly, excluding node_modules and .git
            fs.copySync(resolvedPath, outputPath, {
                filter: (src) => {
                    const rel = path.relative(resolvedPath, src);
                    return (
                        rel !== 'node_modules' &&
                        !rel.startsWith(`node_modules${path.sep}`) &&
                        rel !== '.git' &&
                        !rel.startsWith(`.git${path.sep}`)
                    );
                },
            });
        }
    } else {
        // Remote URL: use git clone
        // Use --depth 1 for shallow clone since we delete .git anyway - much faster!
        // (Use execFileSync instead of execSync to avoid shell injection — arguments are passed
        // directly to the git binary without going through a shell interpreter)
        const cloneArgs = ['clone', '--depth', '1'];
        if (options.templateBranch) cloneArgs.push('--branch', options.templateBranch);
        cloneArgs.push(template, outputPath);
        execFileSync('git', cloneArgs);
    }
    // remove the .git directory so it starts out as a local project
    const gitDir = path.join(outputPath, '.git');
    if (fs.existsSync(gitDir)) {
        fs.rmSync(gitDir, { recursive: true, force: true });
    }

    // The template records its own origin under `storefrontNext` in package.json
    // (templateRelease label + CalVer + min SDK). The release pipeline stamps real
    // values; on `main`/unreleased snapshots it's a placeholder. Surface the label
    // so customers know which template snapshot they generated from, and warn if the
    // field is missing entirely (e.g. an old or hand-rolled template).
    let templateRelease: string | undefined;
    const generatedPkgPath = path.join(outputPath, 'package.json');
    if (fs.existsSync(generatedPkgPath)) {
        try {
            const generatedPkg = JSON.parse(fs.readFileSync(generatedPkgPath, 'utf8'));
            templateRelease = generatedPkg?.storefrontNext?.templateRelease;
        } catch {
            // Unparseable package.json is surfaced later by pnpm install; don't block here.
        }
    }
    if (!templateRelease) {
        logger.warn(
            'This template is missing its "storefrontNext" origin metadata in package.json. ' +
                'You can still build and run it, but it won’t record which template release it came from.'
        );
    }

    const workspaceYamlPath = path.join(outputPath, 'pnpm-workspace.yaml');
    if (!fs.existsSync(workspaceYamlPath)) {
        logger.warn(
            `Template is missing pnpm-workspace.yaml at ${workspaceYamlPath}. ` +
                `The generated project may not work correctly without a workspace configuration.`
        );
    }

    // Hook: Prepare for local development if template is a local path
    // or if --local-packages-dir was provided
    if (isLocalPath(template) || options.localPackagesDir) {
        const templatePath = template.replace('file://', '');
        // Use provided localPackagesDir, or derive from template path
        const sourcePackagesDir = options.localPackagesDir || path.dirname(templatePath);
        await prepareForLocalDev({
            projectDirectory: outputPath,
            sourcePackagesDir,
            defaults: options.defaults,
        });
    }

    logger.info('\n');
    // configure extensions
    if (fs.existsSync(path.join(outputPath, 'src', 'extensions', 'config.json'))) {
        const extensionConfigText = fs.readFileSync(path.join(outputPath, 'src', 'extensions', 'config.json'), 'utf8');
        const extensionConfig: ExtensionConfig = JSON.parse(extensionConfigText);
        if (extensionConfig.extensions) {
            // Validate no circular dependencies before proceeding
            try {
                validateNoCycles(extensionConfig);
            } catch (e) {
                logger.error(`Extension configuration error: ${(e as Error).message}`);
                process.exit(1);
            }

            let selectedExtensions: string[];
            if (options.defaults) {
                selectedExtensions = Object.keys(extensionConfig.extensions).filter(
                    (ext) => extensionConfig.extensions[ext].defaultOn ?? true
                );
            } else {
                ({ selectedExtensions } = await prompts({
                    type: 'multiselect',
                    name: 'selectedExtensions',
                    message:
                        '🔌 Which extension would you like to enable? (Use arrow keys to select, space to toggle, and enter to confirm.)\n',
                    choices: Object.keys(extensionConfig.extensions).map((extension) => ({
                        title: `${extensionConfig.extensions[extension].name} - ${
                            extensionConfig.extensions[extension].description
                        }`,
                        value: extension,
                        selected: extensionConfig.extensions[extension].defaultOn ?? true,
                    })),
                    instructions: false,
                }));
            }

            // Resolve all dependencies for selected extensions
            const resolvedExtensions = resolveDependenciesForMultiple(selectedExtensions, extensionConfig);

            // Check if any dependencies were auto-added
            const selectedSet = new Set(selectedExtensions);
            const autoAdded = resolvedExtensions.filter((ext: string) => !selectedSet.has(ext));

            if (autoAdded.length > 0) {
                // Find which extensions required the auto-added dependencies
                for (const addedExt of autoAdded) {
                    const dependentExts = selectedExtensions.filter((selected: string) => {
                        const deps = extensionConfig.extensions[selected]?.dependencies || [];
                        return (
                            deps.includes(addedExt) ||
                            resolvedExtensions.indexOf(addedExt) < resolvedExtensions.indexOf(selected)
                        );
                    });
                    if (dependentExts.length > 0) {
                        const addedName = extensionConfig.extensions[addedExt]?.name || addedExt;
                        const dependentNames = dependentExts
                            .map((ext: string) => extensionConfig.extensions[ext]?.name || ext)
                            .join(', ');
                        logger.warn(
                            `${dependentNames} requires ${addedName}. ${addedName} has been automatically added.`
                        );
                    }
                }
            }

            const enabledExtensions = Object.fromEntries(resolvedExtensions.map((ext: string) => [ext, true]));
            await trimExtensions(outputPath, enabledExtensions, { extensions: extensionConfig.extensions });
        }
    }
    // interview for config overrides
    const configMetaPath = fs.existsSync(path.join(outputPath, 'config-meta.json'))
        ? path.join(outputPath, 'config-meta.json')
        : path.join(outputPath, 'src', 'config', 'config-meta.json');
    const configMeta = JSON.parse(fs.readFileSync(configMetaPath, 'utf8'));
    // Load default config values from .env.default if it exists
    const envDefaultPath = path.join(outputPath, '.env.default');
    let envDefaultValues: Record<string, string | undefined> = {};
    if (fs.existsSync(envDefaultPath)) {
        envDefaultValues = parseEnv(fs.readFileSync(envDefaultPath, 'utf8'));
    }
    logger.info('\n⚙️ We will now configure your storefront before it will be ready to run.\n');
    const configOverrides: Record<string, string> = {};
    for (const config of configMeta.configs) {
        if (options.defaults) {
            configOverrides[config.key] = envDefaultValues[config.key] ?? '';
        } else {
            const answer = await prompts({
                type: 'text',
                name: config.key,
                message: `What is the value for ${config.name}? (default: ${envDefaultValues[config.key] ?? ''})\n`,
                initial: envDefaultValues[config.key] ?? '',
            });
            configOverrides[config.key] = answer[config.key];
        }
    }
    // Generate the .env file based on the .env.default file and the config overrides from the extension config
    generateEnvFile(outputPath, configOverrides);
    // Print banner after setup is complete
    const installCmd = 'pnpm install';
    const originLine = templateRelease ? `\n        📦 Generated from template release: ${templateRelease}` : '';
    const BANNER = `
    ╔══════════════════════════════════════════════════════════════════╗
    ║                       CONGRATULATIONS                            ║
    ╚══════════════════════════════════════════════════════════════════╝

        🎉 Congratulations! Your storefront is ready to use! 🎉${originLine}
        What's next:
        - Navigate to the storefront directory: cd ${outputPath}
        - Install dependencies: ${installCmd}
        - Build the storefront: pnpm run build
        - Run the development server: pnpm run dev
    `;
    logger.info(BANNER);
};
