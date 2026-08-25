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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
    toPascalCase,
    toCamelCase,
    discoverLocales,
    findExtensionsWithLocale,
    generateLocaleFile,
    aggregateExtensionLocales,
} from './aggregate-extension-locales';

interface TestDirs {
    SRC_DIR: string;
    EXTENSIONS_DIR: string;
    OUTPUT_DIR: string;
}

describe('aggregate-extension-locales', () => {
    describe('toPascalCase', () => {
        it('converts kebab-case to PascalCase', () => {
            expect(toPascalCase('store-locator')).toBe('StoreLocator');
            expect(toPascalCase('bopis')).toBe('Bopis');
            expect(toPascalCase('my-custom-extension')).toBe('MyCustomExtension');
        });

        it('handles single words', () => {
            expect(toPascalCase('extension')).toBe('Extension');
        });

        it('handles empty strings', () => {
            expect(toPascalCase('')).toBe('');
        });
    });

    describe('toCamelCase', () => {
        it('converts kebab-case to camelCase', () => {
            expect(toCamelCase('store-locator')).toBe('storeLocator');
            expect(toCamelCase('bopis')).toBe('bopis');
            expect(toCamelCase('my-custom-extension')).toBe('myCustomExtension');
        });

        it('handles single words', () => {
            expect(toCamelCase('extension')).toBe('extension');
        });

        it('handles empty strings', () => {
            expect(toCamelCase('')).toBe('');
        });
    });

    describe('generateLocaleFile', () => {
        it('generates empty file when no extensions', () => {
            const content = generateLocaleFile([]);
            expect(content).toContain('// No extension translations found for this locale');
            expect(content).toContain('export default {};');
        });

        it('generates file with single extension', () => {
            const extensions = [{ name: 'bopis', path: '@/extensions/bopis/locales/en-GB/translations.json' }];
            const content = generateLocaleFile(extensions);
            expect(content).toContain('import bopisTranslations from');
            expect(content).toContain("'@/extensions/bopis/locales/en-GB/translations.json'");
            expect(content).toContain('extBopis: bopisTranslations');
        });

        it('generates file with multiple extensions', () => {
            const extensions = [
                { name: 'bopis', path: '@/extensions/bopis/locales/en-GB/translations.json' },
                { name: 'store-locator', path: '@/extensions/store-locator/locales/en-GB/translations.json' },
            ];
            const content = generateLocaleFile(extensions);
            expect(content).toContain('import bopisTranslations from');
            expect(content).toContain('import storeLocatorTranslations from');
            expect(content).toContain('extBopis: bopisTranslations');
            expect(content).toContain('extStoreLocator: storeLocatorTranslations');
        });

        it('adds trim markers when extension config keys are provided', () => {
            const content = generateLocaleFile(
                [{ name: 'bopis', path: '@/extensions/bopis/locales/en-GB/translations.json' }],
                { bopis: 'SFDC_EXT_BOPIS' }
            );

            expect(content).toContain('// @sfdc-extension-line SFDC_EXT_BOPIS\nimport bopisTranslations');
            expect(content).toContain('    // @sfdc-extension-line SFDC_EXT_BOPIS\n    extBopis:');
        });

        it('includes license header and auto-generation warning', () => {
            const content = generateLocaleFile([]);
            expect(content).toContain('Copyright');
            expect(content).toContain('Salesforce, Inc.');
            expect(content).toContain('Licensed under the Apache License, Version 2.0');
            expect(content).toContain('http://www.apache.org/licenses/LICENSE-2.0');
            expect(content).toContain('// NOTE: This file is auto-generated. Do not edit manually.');
            expect(content).toContain("// Run 'pnpm locales:aggregate-extensions' to regenerate this file.");
        });
    });

    describe('Integration tests with filesystem', () => {
        let testDir: string;
        let dirs: TestDirs;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-locales-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            await mkdir(testDir, { recursive: true });
            dirs = {
                SRC_DIR: join(testDir, 'src'),
                EXTENSIONS_DIR: join(testDir, 'src', 'extensions'),
                OUTPUT_DIR: join(testDir, 'src', 'extensions', 'locales'),
            };
        });

        afterEach(async () => {
            try {
                await rm(testDir, { recursive: true, force: true });
            } catch (error) {
                console.error(error);
            }
        });

        describe('discoverLocales', () => {
            it('discovers locales from main app only', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.SRC_DIR, 'locales', 'es-MX'), { recursive: true });
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(2);
                expect(locales.has('en-US')).toBe(true);
                expect(locales.has('es-MX')).toBe(true);
            });

            it('discovers locales from extensions only', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'fr-FR'), { recursive: true });
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(2);
                expect(locales.has('en-US')).toBe(true);
                expect(locales.has('fr-FR')).toBe(true);
            });

            it('merges locales from both main app and extensions', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.SRC_DIR, 'locales', 'es-MX'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'fr-FR'), { recursive: true });
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(3);
            });

            it('returns empty set when no locales exist', async () => {
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(0);
            });

            it('ignores non-directory entries in locales folder', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.SRC_DIR, 'locales', 'index.ts'), 'export default {};');
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(1);
                expect(locales.has('index.ts')).toBe(false);
            });

            it('skips extensions without locales folder', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'no-locales-ext', 'components'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'has-locales', 'locales', 'en-US'), { recursive: true });
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(1);
                expect(locales.has('en-US')).toBe(true);
            });

            it('skips the output locales directory', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                const locales = await discoverLocales(dirs);
                expect(locales.size).toBe(1);
            });
        });

        describe('findExtensionsWithLocale', () => {
            it('finds extensions with translations for a locale', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'store-locator', 'locales', 'en-US'), { recursive: true });
                await writeFile(
                    join(dirs.EXTENSIONS_DIR, 'store-locator', 'locales', 'en-US', 'translations.json'),
                    '{}'
                );
                const extensions = await findExtensionsWithLocale('en-US', dirs.EXTENSIONS_DIR);
                expect(extensions).toHaveLength(2);
                expect(extensions[0].name).toBe('bopis');
                expect(extensions[1].name).toBe('store-locator');
            });

            it('skips extensions disabled in the generated storefront', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'store-locator', 'locales', 'en-US'), { recursive: true });
                await writeFile(
                    join(dirs.EXTENSIONS_DIR, 'store-locator', 'locales', 'en-US', 'translations.json'),
                    '{}'
                );

                const extensions = await findExtensionsWithLocale('en-US', dirs.EXTENSIONS_DIR, {
                    bopis: false,
                    'store-locator': true,
                });

                expect(extensions).toEqual([
                    { name: 'store-locator', path: '@/extensions/store-locator/locales/en-US/translations.json' },
                ]);
            });

            it('returns empty array when no extensions have the locale', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'), '{}');
                const extensions = await findExtensionsWithLocale('fr-FR', dirs.EXTENSIONS_DIR);
                expect(extensions).toHaveLength(0);
            });

            it('sorts extensions alphabetically', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'zebra', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'zebra', 'locales', 'en-US', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'apple', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'apple', 'locales', 'en-US', 'translations.json'), '{}');
                const extensions = await findExtensionsWithLocale('en-US', dirs.EXTENSIONS_DIR);
                expect(extensions[0].name).toBe('apple');
                expect(extensions[1].name).toBe('zebra');
            });

            it('skips the output locales directory', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'locales', 'en-US', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'), '{}');
                const extensions = await findExtensionsWithLocale('en-US', dirs.EXTENSIONS_DIR);
                expect(extensions).toHaveLength(1);
                expect(extensions[0].name).toBe('bopis');
            });

            it('includes correct import paths', async () => {
                await mkdir(join(dirs.EXTENSIONS_DIR, 'my-ext', 'locales', 'en-GB'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'my-ext', 'locales', 'en-GB', 'translations.json'), '{}');
                const extensions = await findExtensionsWithLocale('en-GB', dirs.EXTENSIONS_DIR);
                expect(extensions[0].path).toBe('@/extensions/my-ext/locales/en-GB/translations.json');
            });

            it('returns empty array when extensions directory does not exist', async () => {
                const extensions = await findExtensionsWithLocale('en-US', '/nonexistent/path');
                expect(extensions).toHaveLength(0);
            });
        });

        describe('aggregateExtensionLocales', () => {
            it('generates aggregation files for all discovered locales', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.SRC_DIR, 'locales', 'es-MX'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(
                    join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'),
                    '{"test": "value"}'
                );

                const result = await aggregateExtensionLocales({ dirs, silent: true });

                expect(result.generated).toBe(2);
                expect(result.locales).toHaveLength(2);

                const enUSContent = await readFile(join(dirs.OUTPUT_DIR, 'en-US', 'index.ts'), 'utf8');
                expect(enUSContent).toContain('import bopisTranslations');
                expect(enUSContent).toContain('extBopis: bopisTranslations');

                const esMXContent = await readFile(join(dirs.OUTPUT_DIR, 'es-MX', 'index.ts'), 'utf8');
                expect(esMXContent).toContain('// No extension translations found for this locale');
                expect(esMXContent).toContain('export default {};');
            });

            it('handles multiple extensions with different locale coverage', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.SRC_DIR, 'locales', 'es-MX'), { recursive: true });
                await mkdir(join(dirs.SRC_DIR, 'locales', 'fr-FR'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'ext-a', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'ext-a', 'locales', 'en-US', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'ext-a', 'locales', 'es-MX'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'ext-a', 'locales', 'es-MX', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'ext-b', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'ext-b', 'locales', 'en-US', 'translations.json'), '{}');

                // Extension C: has no locales folder at all
                await mkdir(join(dirs.EXTENSIONS_DIR, 'ext-c', 'components'), { recursive: true });

                const result = await aggregateExtensionLocales({ dirs, silent: true });
                expect(result.generated).toBe(3);

                const enUSContent = await readFile(join(dirs.OUTPUT_DIR, 'en-US', 'index.ts'), 'utf8');
                expect(enUSContent).toContain('extExtA');
                expect(enUSContent).toContain('extExtB');

                const esMXContent = await readFile(join(dirs.OUTPUT_DIR, 'es-MX', 'index.ts'), 'utf8');
                expect(esMXContent).toContain('extExtA');
                expect(esMXContent).not.toContain('extExtB');

                const frFRContent = await readFile(join(dirs.OUTPUT_DIR, 'fr-FR', 'index.ts'), 'utf8');
                expect(frFRContent).toContain('export default {};');
            });

            it('does not aggregate translations for disabled extensions', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'), '{}');
                await mkdir(join(dirs.EXTENSIONS_DIR, 'store-locator', 'locales', 'en-US'), { recursive: true });
                await writeFile(
                    join(dirs.EXTENSIONS_DIR, 'store-locator', 'locales', 'en-US', 'translations.json'),
                    '{}'
                );

                await aggregateExtensionLocales({
                    dirs,
                    selectedExtensions: { bopis: false, 'store-locator': true },
                    silent: true,
                });

                const content = await readFile(join(dirs.OUTPUT_DIR, 'en-US', 'index.ts'), 'utf8');
                expect(content).not.toContain('extBopis');
                expect(content).toContain('extStoreLocator');
            });

            it('returns correct result metadata', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await mkdir(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US'), { recursive: true });
                await writeFile(join(dirs.EXTENSIONS_DIR, 'bopis', 'locales', 'en-US', 'translations.json'), '{}');

                const result = await aggregateExtensionLocales({ dirs, silent: true });

                expect(result.generated).toBe(1);
                expect(result.locales[0].locale).toBe('en-US');
                expect(result.locales[0].extensionCount).toBe(1);
                expect(result.locales[0].filePath).toContain(`en-US${sep}index.ts`);
            });

            it('handles no locales scenario', async () => {
                const result = await aggregateExtensionLocales({ dirs, silent: true });
                expect(result.generated).toBe(0);
                expect(result.locales).toHaveLength(0);
            });

            it('creates output directory if it does not exist', async () => {
                await mkdir(join(dirs.SRC_DIR, 'locales', 'en-US'), { recursive: true });
                await aggregateExtensionLocales({ dirs, silent: true });
                const content = await readFile(join(dirs.OUTPUT_DIR, 'en-US', 'index.ts'), 'utf8');
                expect(content).toBeDefined();
            });
        });
    });
});
