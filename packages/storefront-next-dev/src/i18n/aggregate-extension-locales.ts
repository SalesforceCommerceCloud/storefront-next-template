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
import { readdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { GENERATED_EXTENSION_DIRS } from '../extensibility/constants.js';
import { logger } from '../logger.js';

/** Apache License 2.0 header text for generated files. Inlined to avoid path resolution issues in standalone projects. */
const APACHE_LICENSE_HEADER = [
    `Copyright ${new Date().getFullYear()} Salesforce, Inc.`,
    '',
    'Licensed under the Apache License, Version 2.0 (the "License");',
    'you may not use this file except in compliance with the License.',
    'You may obtain a copy of the License at',
    '',
    '    http://www.apache.org/licenses/LICENSE-2.0',
    '',
    'Unless required by applicable law or agreed to in writing, software',
    'distributed under the License is distributed on an "AS IS" BASIS,',
    'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
    'See the License for the specific language governing permissions and',
    'limitations under the License.',
].join('\n');

export interface Dirs {
    SRC_DIR: string;
    EXTENSIONS_DIR: string;
    OUTPUT_DIR: string;
}

export interface AggregateExtensionLocalesOptions {
    projectDirectory?: string;
    /** Override directory paths — used in tests. Takes precedence over projectDirectory. */
    dirs?: Dirs;
    /** Only include extensions selected for the generated storefront. */
    selectedExtensions?: Record<string, boolean>;
    /** Map extension folder names to their config keys for trim markers. */
    extensionKeys?: Record<string, string>;
    silent?: boolean;
}

export interface AggregateResult {
    generated: number;
    locales: Array<{ locale: string; extensionCount: number; filePath: string }>;
}

export function getDefaultDirs(projectDirectory: string) {
    const srcDir = join(projectDirectory, 'src');
    return {
        SRC_DIR: srcDir,
        EXTENSIONS_DIR: join(srcDir, 'extensions'),
        OUTPUT_DIR: join(srcDir, 'extensions', 'locales'),
    };
}

/** Convert kebab-case to PascalCase (e.g. `store-locator` → `StoreLocator`). */
export function toPascalCase(str: string): string {
    return str
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/** Convert kebab-case to camelCase for variable names (e.g. `store-locator` → `storeLocator`). */
export function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Scan main app and extension directories to find all available locale codes. */
export async function discoverLocales(dirs: { SRC_DIR: string; EXTENSIONS_DIR: string }): Promise<Set<string>> {
    const { SRC_DIR, EXTENSIONS_DIR } = dirs;
    const locales = new Set<string>();

    const mainLocalesPath = join(SRC_DIR, 'locales');
    if (existsSync(mainLocalesPath)) {
        try {
            const mainLocaleEntries = await readdir(mainLocalesPath, { withFileTypes: true });
            for (const entry of mainLocaleEntries) {
                if (entry.isDirectory()) {
                    locales.add(entry.name);
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }

    try {
        const extensions = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
        for (const extension of extensions) {
            // `locales` and `config` are generated barrel directories, not extensions.
            if (
                !extension.isDirectory() ||
                extension.name === GENERATED_EXTENSION_DIRS.locales ||
                extension.name === GENERATED_EXTENSION_DIRS.config
            )
                continue;

            const localesPath = join(EXTENSIONS_DIR, extension.name, 'locales');
            if (!existsSync(localesPath)) continue;

            const localeEntries = await readdir(localesPath, { withFileTypes: true });
            for (const localeEntry of localeEntries) {
                if (localeEntry.isDirectory()) {
                    locales.add(localeEntry.name);
                }
            }
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    return locales;
}

/** Find all extensions (NOT main app) that have a `translations.json` for the given locale. */
export async function findExtensionsWithLocale(
    locale: string,
    extensionsDir: string,
    selectedExtensions?: Record<string, boolean>
): Promise<Array<{ name: string; path: string }>> {
    const extensions: Array<{ name: string; path: string }> = [];

    try {
        const extensionEntries = await readdir(extensionsDir, { withFileTypes: true });
        for (const entry of extensionEntries) {
            // `locales` and `config` are generated barrel directories, not extensions.
            if (
                !entry.isDirectory() ||
                entry.name === GENERATED_EXTENSION_DIRS.locales ||
                entry.name === GENERATED_EXTENSION_DIRS.config
            )
                continue;

            if (selectedExtensions && selectedExtensions[entry.name] !== true) continue;

            const translationPath = join(extensionsDir, entry.name, 'locales', locale, 'translations.json');
            if (existsSync(translationPath)) {
                extensions.push({
                    name: entry.name,
                    path: `@/extensions/${entry.name}/locales/${locale}/translations.json`,
                });
            }
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    return extensions.sort((a, b) => a.name.localeCompare(b.name));
}

/** Generate the locale index file content that re-exports extension translations under `extPascalCase` namespaces. */
export function generateLocaleFile(
    extensions: Array<{ name: string; path: string }>,
    extensionKeys?: Record<string, string>
): string {
    const licenseLines = APACHE_LICENSE_HEADER.split('\n');
    const licenseHeader = `/**\n${licenseLines.map((line) => (line ? ` * ${line}` : ' *')).join('\n')}\n */`;

    const header = `${licenseHeader}

// NOTE: This file is auto-generated. Do not edit manually.
// Run 'pnpm locales:aggregate-extensions' to regenerate this file.

`;

    if (extensions.length === 0) {
        return `${header}// No extension translations found for this locale\nexport default {};\n`;
    }

    const imports = extensions
        .map((ext) => {
            const varName = `${toCamelCase(ext.name)}Translations`;
            const marker = extensionKeys?.[ext.name] ? `// @sfdc-extension-line ${extensionKeys[ext.name]}\n` : '';
            return `${marker}import ${varName} from '${ext.path}';`;
        })
        .join('\n');

    const exports = extensions
        .map((ext) => {
            const namespace = `ext${toPascalCase(ext.name)}`;
            const varName = `${toCamelCase(ext.name)}Translations`;
            const marker = extensionKeys?.[ext.name] ? `    // @sfdc-extension-line ${extensionKeys[ext.name]}\n` : '';
            return `${marker}    ${namespace}: ${varName},`;
        })
        .join('\n');

    return `${header}${imports}

// Namespace is based on the following convention: extPascalCase, and it's the pascal case of the folder name (e.g. store-locator -> extStoreLocator)
export default {
${exports}
};
`;
}

/**
 * Generate aggregation files for extension translations only.
 * Main app translations in `/src/locales/` are NOT aggregated — only per-extension `translations.json` files.
 */
export async function aggregateExtensionLocales(
    options: AggregateExtensionLocalesOptions = {}
): Promise<AggregateResult> {
    const { projectDirectory = process.cwd(), silent = false, selectedExtensions, extensionKeys } = options;
    const dirs = options.dirs ?? getDefaultDirs(projectDirectory);
    const { OUTPUT_DIR, EXTENSIONS_DIR } = dirs;

    const log = (message: string, ...args: unknown[]) => {
        if (!silent) logger.debug(message, ...args);
    };

    try {
        log('🔍 Scanning for extension translation files...');

        const locales = await discoverLocales(dirs);

        if (locales.size === 0) {
            log('📝 No locales found in extensions. Nothing to generate.');
            return { generated: 0, locales: [] };
        }

        log(`📝 Found ${locales.size} locale(s): ${Array.from(locales).join(', ')}`);

        await mkdir(OUTPUT_DIR, { recursive: true });

        const results: AggregateResult['locales'] = [];
        for (const locale of locales) {
            const extensions = await findExtensionsWithLocale(locale, EXTENSIONS_DIR, selectedExtensions);
            const content = generateLocaleFile(extensions, extensionKeys);

            const outputPath = join(OUTPUT_DIR, locale);
            await mkdir(outputPath, { recursive: true });

            const filePath = join(outputPath, 'index.ts');
            await writeFile(filePath, content, 'utf8');

            log(`✅ Generated: src/extensions/locales/${locale}/index.ts (${extensions.length} extension(s))`);
            results.push({ locale, extensionCount: extensions.length, filePath });
        }

        log('✨ Extension locale generation complete!');
        return { generated: results.length, locales: results };
    } catch (error) {
        if (!silent) logger.error(`❌ Error generating extension locales: ${String(error)}`);
        throw error;
    }
}
