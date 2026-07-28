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
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { logger } from './logger';
import type { ProjectPackage, DependencyTree, DependencyRecord } from './types';

export const getDefaultBuildDir = (targetDir: string) => path.join(targetDir, 'build');

// Set default NODE_ENV if not specified
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Get current environment with default fallback
 */
export const getEnvironment = () => NODE_ENV;

/**
 * Check if running in production mode
 */
export const isProduction = () => NODE_ENV === 'production';

/**
 * Check if running in development mode
 */
export const isDevelopment = () => NODE_ENV === 'development';

/**
 * Get project package.json
 */
export const getProjectPkg = (projectDir: string): ProjectPackage => {
    const packagePath = path.join(projectDir, 'package.json');
    try {
        return fs.readJSONSync(packagePath);
    } catch {
        throw new Error(`Could not read project package at "${packagePath}"`);
    }
};

/**
 * Get MRT configuration with priority logic: .env -> package.json -> defaults
 *
 * Note: .env loading is handled once at startup in the oclif init hook (src/hooks/init.ts) before any command runs.
 */
export const getMrtConfig = (
    projectDir: string
): { defaultMrtProject: string; defaultMrtTarget: string | undefined } => {
    const pkg = getProjectPkg(projectDir);

    // Priority: .env -> package.json name
    const defaultMrtProject = process.env.MRT_PROJECT ?? pkg.name;

    // Fail fast if project cannot be determined
    if (!defaultMrtProject || defaultMrtProject.trim() === '') {
        throw new Error(
            "Project name couldn't be determined. Do one of these options:\n" +
                '  1. Set MRT_PROJECT in your .env file, or\n' +
                '  2. Ensure package.json has a valid "name" field.'
        );
    }

    // Priority: .env -> undefined (target is optional)
    const defaultMrtTarget = process.env.MRT_TARGET ?? undefined;

    logger.debug('MRT configuration resolved', {
        projectDir,
        envMrtProject: process.env.MRT_PROJECT,
        envMrtTarget: process.env.MRT_TARGET,
        packageName: pkg.name,
        resolvedProject: defaultMrtProject,
        resolvedTarget: defaultMrtTarget,
    });

    return { defaultMrtProject, defaultMrtTarget };
};

/**
 * Get project dependency tree (simplified version)
 */
export const getProjectDependencyTree = (projectDir: string): DependencyTree | null => {
    try {
        const tmpFile = path.join(os.tmpdir(), `npm-ls-${Date.now()}.json`);
        execSync(`npm ls --all --json > ${tmpFile}`, {
            stdio: 'ignore',
            cwd: projectDir,
        });
        const data = fs.readJSONSync(tmpFile);
        fs.unlinkSync(tmpFile);
        return data;
    } catch {
        // Don't prevent bundles from being pushed if this step fails
        return null;
    }
};

/**
 * Get PWA Kit dependencies from dependency tree
 */
export const getPwaKitDependencies = (dependencyTree: DependencyTree | null): DependencyRecord => {
    if (!dependencyTree) return {};

    const pwaKitDependencies = ['@salesforce/storefront-next-dev'];

    const result: DependencyRecord = {};

    const searchDeps = (tree: DependencyTree) => {
        if (tree.dependencies) {
            for (const [name, dep] of Object.entries(tree.dependencies)) {
                if (pwaKitDependencies.includes(name)) {
                    result[name] = dep.version || 'unknown';
                }
                if (dep.dependencies) {
                    searchDeps({ dependencies: dep.dependencies });
                }
            }
        }
    };

    searchDeps(dependencyTree);
    return result;
};

/**
 * Get default commit message from git
 */
export const getDefaultMessage = (projectDir: string): string => {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf8',
            cwd: projectDir,
        }).trim();
        const commit = execSync('git rev-parse --short HEAD', {
            encoding: 'utf8',
            cwd: projectDir,
        }).trim();
        return `${branch}: ${commit}`;
    } catch {
        logger.debug('Using default bundle message as no message was provided and not in a Git repo.');
        return 'PWA Kit Bundle';
    }
};

/**
 * Given a project directory and a record of config overrides, generate a new .env file with the overrides based on the .env.default file.
 * @param projectDir
 * @param configOverrides
 */
export const generateEnvFile = (projectDir: string, configOverrides: Record<string, string>) => {
    const envDefaultPath = path.join(projectDir, '.env.default');
    const envPath = path.join(projectDir, '.env');
    if (!fs.existsSync(envDefaultPath)) {
        // oxlint-disable-next-line no-console
        console.warn(`${envDefaultPath} not found`);
        return;
    }
    const envDefaultContent = fs.readFileSync(envDefaultPath, 'utf8');
    const envDefaultLines = envDefaultContent.split('\n');

    // Create new .env content by taking .env.default as the base and
    // overriding values when a matching key is supplied in configOverrides.
    const envOutputLines = envDefaultLines.map((line) => {
        // Preserve comments and blank lines as-is
        if (!line || line.trim().startsWith('#')) return line;

        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) return line;

        const key = line.slice(0, eqIndex);
        const originalValue = line.slice(eqIndex + 1);
        const override = Object.prototype.hasOwnProperty.call(configOverrides, key) ? configOverrides[key] : undefined;
        return `${key}=${override ?? originalValue}`;
    });

    // Write the generated content to .env (do not modify .env.default)
    fs.writeFileSync(envPath, envOutputLines.join('\n'));
};
