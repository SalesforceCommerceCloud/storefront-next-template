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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import { join, resolve, dirname } from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'child_process';
import prompts from 'prompts';
import trimExtensions from './extensibility/trim-extensions';
import { prepareForLocalDev } from './utils/local-dev-setup';

// The real template file — read once at import time using real node:fs (not the mocked fs-extra).
// Used to mock the fs.readFileSync call in tests and for the sync test at the bottom of this file.
const WORKSPACE_HBS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../template/pnpm-workspace.yaml.hbs');
const WORKSPACE_HBS_RAW = readFileSync(WORKSPACE_HBS_PATH, 'utf8');

// Mock external modules before importing the SUT
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock local-dev-setup module
vi.mock('./utils/local-dev-setup', () => ({
    prepareForLocalDev: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs-extra', () => ({
    __esModule: true,
    default: {
        existsSync: vi.fn(),
        rmSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        copySync: vi.fn(),
        copyFileSync: vi.fn(),
    },
}));
vi.mock('./extensibility/trim-extensions', () => ({
    __esModule: true,
    default: vi.fn(),
}));

// Create a flexible prompts mock that supports both direct mocking and inject-style behavior
let promptsInjectedValues: any[] = [];
let promptsCallCount = 0;

vi.mock('prompts', () => {
    return {
        default: Object.assign(
            vi.fn((options: any) => {
                // If we have injected values, use them in sequence
                if (promptsInjectedValues.length > 0 && promptsCallCount < promptsInjectedValues.length) {
                    const value = promptsInjectedValues[promptsCallCount];
                    promptsCallCount++;
                    // Return the value with the expected property name
                    if (options.name) {
                        return { [options.name]: value };
                    }
                    return value;
                }
                // Default fallback values
                return {
                    storefront: 'sfcc-storefront',
                    template: 'custom',
                    githubUrl: 'https://github.com/SalesforceCommerceCloud/storefront-next',
                    selectedExtensions: ['SFDC_EXT_STORE_LOCATOR'],
                    PUBLIC__app__commerce__api__clientId: '1234567890',
                    PUBLIC__app__commerce__api__organizationId: '0987654321',
                };
            }),
            {
                // Add inject method to simulate prompts.inject() behavior
                inject: (values: any[]) => {
                    promptsInjectedValues = values;
                    promptsCallCount = 0;
                },
            }
        ),
    };
});

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
}));

let createStorefront: (args?: any) => Promise<void>;
const exitMock = vi.fn();
// @ts-expect-error Needed for test hack
process.exit = exitMock;

describe('create-storefront', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(async () => {
        originalEnv = { ...process.env };
        vi.clearAllMocks();
        vi.resetAllMocks();
        // Reset injected values
        promptsInjectedValues = [];
        promptsCallCount = 0;
        // Dynamically import after mocks are in place
        ({ createStorefront } = await import('./create-storefront'));
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should abort if git is not installed', async () => {
        // Arrange
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error('command not found: git');
        });

        await createStorefront().catch(() => {});

        expect(exitMock).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining(
                `git is not installed or found in your PATH. Install git before running this command`
            )
        );
    });

    it('should abort if storefront name is not provided', async () => {
        // Arrange
        vi.mocked(prompts as unknown as any).mockImplementation(() => {
            return { storefront: '' };
        });

        try {
            await createStorefront();
        } catch (e: any) {
            // because we mocked process.exit, the code will continue and the error will be caught by the try/catch block
            expect(e).toBeDefined();
        }
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Storefront name is required')
        );
        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should abort if user chooses a custom template but no URL was provided', async () => {
        // Arrange
        vi.mocked(prompts as unknown as any).mockImplementation(() => {
            return { template: 'custom', githubUrl: '' };
        });

        try {
            await createStorefront();
        } catch (e: any) {
            // because we mocked process.exit, the code will continue and the error will be caught by the try/catch block
            expect(e).toBeDefined();
        }
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Github URL is required')
        );
        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should clone the template into the storefront directory', async () => {
        // Arrange
        vi.mocked(execSync).mockImplementation(() => {
            return '';
        });
        vi.mocked(fs.existsSync).mockReturnValue(true as any);
        try {
            await createStorefront();
        } catch (e: any) {
            expect(e).toBeDefined();
        }
        // First call checks git is installed
        expect(execSync).toHaveBeenCalledWith('git --version', { stdio: 'ignore' });
        // Clone uses execFileSync with argument array to avoid shell injection
        expect(execFileSync).toHaveBeenCalledWith('git', [
            'clone',
            '--depth',
            '1',
            'https://github.com/SalesforceCommerceCloud/storefront-next',
            'sfcc-storefront',
        ]);
        expect(fs.rmSync).toHaveBeenCalledWith(join('sfcc-storefront', '.git'), { recursive: true, force: true });
    });

    it('should create storefront at outputDir/name when outputDir is provided', async () => {
        vi.mocked(execSync).mockImplementation(() => '');
        vi.mocked(fs.existsSync as any).mockImplementation((p: string) => {
            if (p.includes(join('src', 'extensions', 'config.json'))) return false;
            if (p.endsWith('.env.default')) return false;
            return true;
        });
        vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
            if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
            return '';
        });

        await createStorefront({
            name: 'my-storefront',
            template: 'https://example.com/storefront-template.git',
            outputDir: '/tmp',
        });

        expect(execFileSync).toHaveBeenCalledWith('git', [
            'clone',
            '--depth',
            '1',
            'https://example.com/storefront-template.git',
            join('/tmp', 'my-storefront'),
        ]);
        expect(fs.rmSync).toHaveBeenCalledWith(join('/tmp', 'my-storefront', '.git'), {
            recursive: true,
            force: true,
        });
    });

    it('should use provided name and template without prompting for them', async () => {
        vi.mocked(execSync).mockImplementation(() => {
            return '';
        });
        vi.mocked(fs.existsSync as any).mockImplementation((path: string) => {
            if (path.includes(join('src', 'extensions', 'config.json'))) return false;
            if (path.endsWith('.env.default')) return false;
            return true;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
            if (String(path).endsWith('config-meta.json')) {
                return JSON.stringify({ configs: [] });
            }
            return '';
        });

        await createStorefront({
            name: 'my-storefront',
            template: 'https://example.com/storefront-template.git',
        });

        expect(execFileSync).toHaveBeenCalledWith('git', [
            'clone',
            '--depth',
            '1',
            'https://example.com/storefront-template.git',
            'my-storefront',
        ]);
        expect(prompts).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'storefront' }));
        expect(prompts).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'template' }));
    });

    it('should pass --branch to git clone when templateBranch is provided', async () => {
        vi.mocked(fs.existsSync as any).mockImplementation((path: string) => {
            if (path.includes(join('src', 'extensions', 'config.json'))) return false;
            if (path.endsWith('.env.default')) return false;
            return true;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
            if (String(path).endsWith('config-meta.json')) {
                return JSON.stringify({ configs: [] });
            }
            return '';
        });

        await createStorefront({
            name: 'my-storefront',
            template: 'https://example.com/storefront-template.git',
            templateBranch: 'release-0.2.x',
        });

        expect(execFileSync).toHaveBeenCalledWith('git', [
            'clone',
            '--depth',
            '1',
            '--branch',
            'release-0.2.x',
            'https://example.com/storefront-template.git',
            'my-storefront',
        ]);
    });

    it('should abort if templateBranch is an empty string', async () => {
        await createStorefront({
            name: 'my-storefront',
            template: 'https://example.com/storefront-template.git',
            templateBranch: '',
        }).catch(() => {});

        expect(exitMock).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('--template-branch cannot be empty')
        );
    });

    it('should abort if templateBranch is a whitespace string', async () => {
        await createStorefront({
            name: 'my-storefront',
            template: 'https://example.com/storefront-template.git',
            templateBranch: '   ',
        }).catch(() => {});

        expect(exitMock).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('--template-branch cannot be empty')
        );
    });

    it('should configure extensions', async () => {
        // Arrange
        vi.mocked(fs.existsSync).mockReturnValue(true as any);
        vi.mocked(fs.readFileSync).mockReturnValue(
            JSON.stringify({
                extensions: {
                    SFDC_EXT_STORE_LOCATOR: {
                        name: 'Store Locator',
                        description: 'Enables a shopper to find a store based on a given location.',
                    },
                },
            })
        );
        try {
            await createStorefront({});
        } catch (e: any) {
            expect(e).toBeDefined();
        }
        expect(trimExtensions).toHaveBeenCalledWith(
            'sfcc-storefront',
            { SFDC_EXT_STORE_LOCATOR: true },
            {
                extensions: {
                    SFDC_EXT_STORE_LOCATOR: {
                        name: 'Store Locator',
                        description: 'Enables a shopper to find a store based on a given location.',
                    },
                },
            }
        );
    });

    it('should configure config overrides', async () => {
        // Arrange
        vi.mocked(fs.existsSync as any).mockImplementation((path: string) => {
            if (path.endsWith('config.json')) return false;
            return true;
        });
        vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
            if (path.endsWith('config-meta.json')) {
                return JSON.stringify({
                    configs: [
                        {
                            name: 'SLAS Client ID',
                            key: 'PUBLIC__app__commerce__api__clientId',
                        },
                        {
                            name: 'Organization ID',
                            key: 'PUBLIC__app__commerce__api__organizationId',
                        },
                    ],
                });
            } else if (path.endsWith('.env.default')) {
                return 'PUBLIC__app__commerce__api__clientId=0000000000';
            }
            return '';
        });
        await createStorefront();
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            join('sfcc-storefront', '.env'),
            'PUBLIC__app__commerce__api__clientId=1234567890'
        );
    });

    describe('extension dependencies (using prompts.inject simulation)', () => {
        const extensionConfigWithDependencies = {
            extensions: {
                SFDC_EXT_STORE_LOCATOR: {
                    name: 'Store Locator',
                    description: 'Enables a shopper to find a store based on a given location.',
                    dependencies: [],
                },
                SFDC_EXT_BOPIS: {
                    name: 'Buy Online Pickup In Store',
                    description:
                        'Enables a shopper to order online and pick up their order at a physical store. Requires the Store Locator extension to be installed.',
                    dependencies: ['SFDC_EXT_STORE_LOCATOR'],
                },
            },
        };

        it('should auto-add missing dependencies when extension with dependencies is selected', async () => {
            // Simulate user interaction: inject answers in sequence
            // 1. storefront name, 2. template selection, 3. github URL, 4. extension selection
            (prompts as any).inject([
                'my-storefront', // storefront name
                'custom', // template selection
                'https://github.com/SalesforceCommerceCloud/storefront-next', // github URL
                ['SFDC_EXT_BOPIS'], // Only BOPIS selected (not Store Locator)
            ]);

            vi.mocked(fs.existsSync).mockReturnValue(true as any);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(extensionConfigWithDependencies));

            try {
                await createStorefront({});
            } catch (e: any) {
                expect(e).toBeDefined();
            }

            // trimExtensions should be called with BOTH Store Locator and BOPIS enabled
            // because Store Locator was auto-added as a dependency
            expect(trimExtensions).toHaveBeenCalledWith(
                'my-storefront',
                { SFDC_EXT_STORE_LOCATOR: true, SFDC_EXT_BOPIS: true },
                { extensions: extensionConfigWithDependencies.extensions }
            );
        });

        it('should log warning when dependencies are auto-added', async () => {
            // Simulate user selecting only BOPIS
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'https://github.com/SalesforceCommerceCloud/storefront-next',
                ['SFDC_EXT_BOPIS'], // Only BOPIS selected
            ]);

            vi.mocked(fs.existsSync).mockReturnValue(true as any);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(extensionConfigWithDependencies));

            try {
                await createStorefront({});
            } catch {
                // Expected
            }

            // Should log a warning about the auto-added dependency
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('Store Locator')
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:warn]'),
                expect.stringContaining('automatically added')
            );
        });

        it('should include all dependencies when extension is selected along with its dependencies', async () => {
            // Simulate user selecting BOTH BOPIS and Store Locator
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'https://github.com/SalesforceCommerceCloud/storefront-next',
                ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_BOPIS'], // Both selected
            ]);

            vi.mocked(fs.existsSync).mockReturnValue(true as any);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(extensionConfigWithDependencies));

            try {
                await createStorefront({});
            } catch {
                // Expected
            }

            // trimExtensions should be called with both enabled (no auto-add needed)
            expect(trimExtensions).toHaveBeenCalledWith(
                'my-storefront',
                { SFDC_EXT_STORE_LOCATOR: true, SFDC_EXT_BOPIS: true },
                { extensions: extensionConfigWithDependencies.extensions }
            );
        });

        it('should abort if circular dependency is detected', async () => {
            const circularConfig = {
                extensions: {
                    SFDC_EXT_A: {
                        name: 'Extension A',
                        description: 'Extension A',
                        dependencies: ['SFDC_EXT_B'],
                    },
                    SFDC_EXT_B: {
                        name: 'Extension B',
                        description: 'Extension B',
                        dependencies: ['SFDC_EXT_A'],
                    },
                },
            };

            // Simulate user interaction
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'https://github.com/SalesforceCommerceCloud/storefront-next',
                ['SFDC_EXT_A'],
            ]);

            vi.mocked(fs.existsSync).mockReturnValue(true as any);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(circularConfig));

            try {
                await createStorefront({});
            } catch {
                // Expected
            }

            expect(exitMock).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining('Circular dependency detected')
            );
        });

        it('should handle 3-layer transitive dependency chain', async () => {
            // Test with a 3-layer chain: BOPIS -> Store Locator -> Base Maps
            const threeLayerConfig = {
                extensions: {
                    SFDC_EXT_BASE_MAPS: {
                        name: 'Base Maps',
                        description: 'Core mapping functionality',
                        dependencies: [],
                    },
                    SFDC_EXT_STORE_LOCATOR: {
                        name: 'Store Locator',
                        description: 'Enables a shopper to find a store based on a given location.',
                        dependencies: ['SFDC_EXT_BASE_MAPS'],
                    },
                    SFDC_EXT_BOPIS: {
                        name: 'Buy Online Pickup In Store',
                        description:
                            'Enables a shopper to order online and pick up their order at a physical store. Requires the Store Locator extension to be installed.',
                        dependencies: ['SFDC_EXT_STORE_LOCATOR'],
                    },
                },
            };

            // User only selects BOPIS
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'https://github.com/SalesforceCommerceCloud/storefront-next',
                ['SFDC_EXT_BOPIS'], // Only BOPIS selected
            ]);

            vi.mocked(fs.existsSync).mockReturnValue(true as any);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(threeLayerConfig));

            try {
                await createStorefront({});
            } catch {
                // Expected
            }

            // All three extensions should be enabled (transitive resolution)
            expect(trimExtensions).toHaveBeenCalledWith(
                'my-storefront',
                {
                    SFDC_EXT_BASE_MAPS: true,
                    SFDC_EXT_STORE_LOCATOR: true,
                    SFDC_EXT_BOPIS: true,
                },
                { extensions: threeLayerConfig.extensions }
            );
        });
    });

    describe('local development setup (file:// templates)', () => {
        beforeEach(() => {
            // Clear the localDevSetup mock before each test in this block
            vi.mocked(prepareForLocalDev).mockClear();
        });

        it('should call prepareForLocalDev when template starts with file://', async () => {
            // Simulate user selecting a file:// template
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'file:///Users/dev/monorepo/packages/template', // file:// URL
                [], // no extensions
            ]);

            vi.mocked(fs.existsSync).mockImplementation((path: any) => {
                if (path.endsWith('config.json')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ configs: [] }));

            try {
                await createStorefront({});
            } catch {
                // Expected due to mock limitations
            }

            // prepareForLocalDev should have been called
            // sourcePackagesDir is derived as path.dirname of the template path
            expect(prepareForLocalDev).toHaveBeenCalledWith({
                projectDirectory: 'my-storefront',
                sourcePackagesDir: '/Users/dev/monorepo/packages',
            });
        });

        it('should call prepareForLocalDev when localPackagesDir option is provided', async () => {
            // Simulate user selecting a regular GitHub template
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'https://github.com/SalesforceCommerceCloud/storefront-next',
                [], // no extensions
            ]);

            vi.mocked(fs.existsSync).mockImplementation((path: any) => {
                if (path.endsWith('config.json')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ configs: [] }));

            try {
                await createStorefront({
                    localPackagesDir: '/custom/packages/path',
                });
            } catch {
                // Expected due to mock limitations
            }

            // prepareForLocalDev should have been called with the provided path
            expect(prepareForLocalDev).toHaveBeenCalledWith({
                projectDirectory: 'my-storefront',
                sourcePackagesDir: '/custom/packages/path',
            });
        });

        it('should NOT call prepareForLocalDev for regular GitHub templates without localPackagesDir', async () => {
            // Simulate user selecting a regular GitHub template
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'https://github.com/SalesforceCommerceCloud/storefront-next',
                [], // no extensions
            ]);

            vi.mocked(fs.existsSync).mockImplementation((path: any) => {
                if (path.endsWith('config.json')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ configs: [] }));

            try {
                await createStorefront({});
            } catch {
                // Expected due to mock limitations
            }

            // prepareForLocalDev should NOT have been called
            expect(prepareForLocalDev).not.toHaveBeenCalled();
        });

        it('should derive sourcePackagesDir from file:// template path', async () => {
            // Simulate user selecting a file:// template from a deep path
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'file:///home/user/workspace/storefront-next/packages/template',
                [], // no extensions
            ]);

            vi.mocked(fs.existsSync).mockImplementation((path: any) => {
                if (path.endsWith('config.json')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ configs: [] }));

            try {
                await createStorefront({});
            } catch {
                // Expected due to mock limitations
            }

            // sourcePackagesDir should be the parent directory of the template
            expect(prepareForLocalDev).toHaveBeenCalledWith({
                projectDirectory: 'my-storefront',
                sourcePackagesDir: '/home/user/workspace/storefront-next/packages',
            });
        });

        it('should prefer localPackagesDir over derived path from file:// URL', async () => {
            // Simulate user selecting a file:// template but also providing localPackagesDir
            (prompts as any).inject([
                'my-storefront',
                'custom',
                'file:///Users/dev/template-solo-repo',
                [], // no extensions
            ]);

            vi.mocked(fs.existsSync).mockImplementation((path: any) => {
                if (path.endsWith('config.json')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ configs: [] }));

            try {
                await createStorefront({
                    localPackagesDir: '/override/packages/path',
                });
            } catch {
                // Expected due to mock limitations
            }

            // Should use the provided localPackagesDir, not the derived one
            expect(prepareForLocalDev).toHaveBeenCalledWith({
                projectDirectory: 'my-storefront',
                sourcePackagesDir: '/override/packages/path',
            });
        });
    });

    describe('non-git local directory copy', () => {
        it('should use fs.copySync instead of git clone for a non-git file:// path', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                // .git inside the source template does NOT exist → non-git directory
                if (String(p).endsWith('.git')) return false;
                // config.json and .env.default do not exist for this test
                if (String(p).includes('config.json') || String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'file:///local/non-git/template',
                defaults: true,
            });

            expect(fs.copySync).toHaveBeenCalledWith(
                resolve('/local/non-git/template'),
                'my-storefront',
                expect.objectContaining({ filter: expect.any(Function) })
            );
            expect(execFileSync).not.toHaveBeenCalledWith('git', expect.arrayContaining(['clone']));
        });

        it('should use git clone for a file:// path that IS a git repo', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                // .git inside source template EXISTS → git repo
                if (String(p) === join(resolve('/local/git/template'), '.git')) return true;
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes('config.json') || String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'file:///local/git/template',
                defaults: true,
            });

            expect(execFileSync).toHaveBeenCalledWith('git', [
                'clone',
                '--depth',
                '1',
                resolve('/local/git/template'),
                'my-storefront',
            ]);
            expect(fs.copySync).not.toHaveBeenCalled();
        });

        it('should treat a bare absolute path as a local path', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes('config.json') || String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: '/abs/path/to/template',
                defaults: true,
            });

            // Bare absolute path should trigger copySync (not a git repo)
            expect(fs.copySync).toHaveBeenCalledWith(
                resolve('/abs/path/to/template'),
                'my-storefront',
                expect.objectContaining({ filter: expect.any(Function) })
            );
        });
    });

    describe('standalone project setup (pnpm-workspace.yaml)', () => {
        it('should warn if the template is missing pnpm-workspace.yaml', async () => {
            vi.mocked(fs.existsSync as any).mockImplementation((p: string) => {
                const s = String(p);
                if (s.endsWith('pnpm-workspace.yaml')) return false;
                if (s.endsWith('pnpm-workspace.yaml.hbs')) return false;
                if (s.endsWith('.git')) return false;
                if (s.includes(join('src', 'extensions', 'config.json'))) return false;
                if (s.endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'https://example.com/template.git',
                defaults: true,
            });

            expect(console.warn).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('pnpm-workspace.yaml')
            );
        });
    });

    describe('template origin metadata (storefrontNext)', () => {
        it('should surface the template release label in the banner when present', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes('config.json')) return false;
                if (String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                // The generated project's package.json carries the stamp (it survives
                // the .git strip because it lives in the template's own package.json).
                if (String(p).endsWith('package.json')) {
                    return JSON.stringify({
                        name: 'my-storefront',
                        storefrontNext: {
                            templateRelease: 'June 2026',
                            templateVersion: '2026.6.0',
                            minSdkVersion: '1.1.0',
                        },
                    });
                }
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'https://example.com/template.git',
                defaults: true,
            });

            // Banner is logged via logger.info; assert the release label appears.
            expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('June 2026'));
            // No warning about missing origin metadata.
            expect(console.warn).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('storefrontNext'));
        });

        it('should warn when the template has no storefrontNext origin metadata', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes('config.json')) return false;
                if (String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                if (String(p).endsWith('package.json')) {
                    return JSON.stringify({ name: 'my-storefront' }); // no storefrontNext
                }
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'https://example.com/template.git',
                defaults: true,
            });

            expect(console.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('storefrontNext'));
        });
    });

    describe('--vertical flag', () => {
        // Shared mock setup: a remote clone with no extensions and an empty config-meta.
        const mockRemoteClone = () => {
            vi.mocked(execSync).mockImplementation(() => '');
            vi.mocked(fs.existsSync as any).mockImplementation((p: string) => {
                if (String(p).includes('config.json')) return false;
                if (String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                return '';
            });
        };

        it('should clone the fashion vertical repo without prompting when --vertical fashion is provided', async () => {
            mockRemoteClone();

            await createStorefront({ name: 'my-storefront', vertical: 'fashion', defaults: true });

            expect(execFileSync).toHaveBeenCalledWith('git', [
                'clone',
                '--depth',
                '1',
                'https://github.com/SalesforceCommerceCloud/storefront-next-template',
                'my-storefront',
            ]);
            expect(prompts).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'template' }));
        });

        it('should clone the cosmetic vertical repo without prompting when --vertical cosmetic is provided', async () => {
            mockRemoteClone();

            await createStorefront({ name: 'my-storefront', vertical: 'cosmetic', defaults: true });

            expect(execFileSync).toHaveBeenCalledWith('git', [
                'clone',
                '--depth',
                '1',
                'https://github.com/SalesforceCommerceCloud/storefront-next-beauty',
                'my-storefront',
            ]);
            expect(prompts).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'template' }));
        });

        it('should abort with a helpful message when an unknown vertical is provided', async () => {
            vi.mocked(execSync).mockImplementation(() => '');

            await createStorefront({ name: 'my-storefront', vertical: 'nope', defaults: true }).catch(() => {});

            expect(exitMock).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('[sfnext:error]'),
                expect.stringContaining('Unknown vertical "nope"')
            );
        });

        it('should default to the fashion vertical when --defaults is set with no template or vertical', async () => {
            mockRemoteClone();

            await createStorefront({ name: 'my-storefront', defaults: true });

            expect(execFileSync).toHaveBeenCalledWith('git', [
                'clone',
                '--depth',
                '1',
                'https://github.com/SalesforceCommerceCloud/storefront-next-template',
                'my-storefront',
            ]);
            expect(prompts).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'template' }));
        });

        it('should let --vertical take precedence over the --defaults fallback', async () => {
            mockRemoteClone();

            // cosmetic + defaults: the vertical must win over the fashion default fallback.
            await createStorefront({ name: 'my-storefront', vertical: 'cosmetic', defaults: true });

            expect(execFileSync).toHaveBeenCalledWith('git', [
                'clone',
                '--depth',
                '1',
                'https://github.com/SalesforceCommerceCloud/storefront-next-beauty',
                'my-storefront',
            ]);
            // The fashion default must never be cloned when a vertical is explicit.
            expect(execFileSync).not.toHaveBeenCalledWith(
                'git',
                expect.arrayContaining(['https://github.com/SalesforceCommerceCloud/storefront-next-template'])
            );
        });

        it('should let an explicit --template take precedence over the --defaults fallback', async () => {
            mockRemoteClone();

            // template + defaults: the explicit URL must win; the fashion default must not clone.
            await createStorefront({
                name: 'my-storefront',
                template: 'https://github.com/org/custom-template',
                defaults: true,
            });

            expect(execFileSync).toHaveBeenCalledWith('git', [
                'clone',
                '--depth',
                '1',
                'https://github.com/org/custom-template',
                'my-storefront',
            ]);
            expect(execFileSync).not.toHaveBeenCalledWith(
                'git',
                expect.arrayContaining(['https://github.com/SalesforceCommerceCloud/storefront-next-template'])
            );
        });
    });

    describe('--defaults flag', () => {
        it('should skip extension and config prompts when defaults is true', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes(join('src', 'extensions', 'config.json'))) return true;
                if (String(p).endsWith('.env.default')) return true;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).includes('config.json')) {
                    return JSON.stringify({
                        extensions: {
                            SFDC_EXT_STORE_LOCATOR: {
                                name: 'Store Locator',
                                description: 'Store Locator',
                                defaultOn: true,
                            },
                        },
                    });
                }
                if (String(p).endsWith('config-meta.json')) {
                    return JSON.stringify({
                        configs: [{ name: 'SLAS Client ID', key: 'PUBLIC__app__commerce__api__clientId' }],
                    });
                }
                if (String(p).endsWith('.env.default')) {
                    return 'PUBLIC__app__commerce__api__clientId=default-id';
                }
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'file:///local/template',
                defaults: true,
            });

            // No prompts should have been called for extensions or config keys
            expect(prompts).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'selectedExtensions' }));
            expect(prompts).not.toHaveBeenCalledWith(
                expect.objectContaining({ name: 'PUBLIC__app__commerce__api__clientId' })
            );
        });

        it('should use defaultOn values for extensions when defaults is true', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes(join('src', 'extensions', 'config.json'))) return true;
                if (String(p).endsWith('.env.default')) return false;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).includes('config.json')) {
                    return JSON.stringify({
                        extensions: {
                            SFDC_EXT_ENABLED: { name: 'Enabled Ext', description: 'x', defaultOn: true },
                            SFDC_EXT_DISABLED: { name: 'Disabled Ext', description: 'x', defaultOn: false },
                        },
                    });
                }
                if (String(p).endsWith('config-meta.json')) return JSON.stringify({ configs: [] });
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'file:///local/template',
                defaults: true,
            });

            // Only the defaultOn: true extension should be enabled
            expect(trimExtensions).toHaveBeenCalledWith(
                'my-storefront',
                { SFDC_EXT_ENABLED: true },
                expect.any(Object)
            );
        });

        it('should use .env.default values for config when defaults is true', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p: any) => {
                if (String(p).endsWith('.git')) return false;
                if (String(p).includes('config.json')) return false;
                if (String(p).endsWith('.env.default')) return true;
                return true;
            });
            vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
                if (String(p).endsWith('config-meta.json')) {
                    return JSON.stringify({
                        configs: [{ name: 'SLAS Client ID', key: 'PUBLIC__app__commerce__api__clientId' }],
                    });
                }
                if (String(p).endsWith('.env.default')) {
                    return 'PUBLIC__app__commerce__api__clientId=default-value';
                }
                return '';
            });

            await createStorefront({
                name: 'my-storefront',
                template: 'file:///local/template',
                defaults: true,
            });

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                join('my-storefront', '.env'),
                'PUBLIC__app__commerce__api__clientId=default-value'
            );
        });
    });
});

// --- Sync test: monorepo pnpm-workspace.yaml ↔ template pnpm-workspace.yaml.hbs ---
// This test uses real file I/O (node:fs, not the mocked fs-extra) and must be kept
// outside the mocked describe block.

/** Extract a scalar value from a YAML file: `key: value` → value (string or number) */
function extractScalar(content: string, key: string): string | undefined {
    const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim();
}

/** Extract a YAML list under a key: the `- item` lines immediately following `key:` */
function extractList(content: string, key: string): string[] {
    const keyIndex = content.indexOf(`${key}:`);
    if (keyIndex === -1) return [];
    const afterKey = content.slice(keyIndex + key.length + 1);
    const items: string[] = [];
    for (const line of afterKey.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ')) {
            // Strip inline comments and quotes from list items
            const raw = trimmed
                .slice(2)
                .split('#')[0]
                .trim()
                .replace(/^['"]|['"]$/g, '');
            items.push(raw);
        } else if (trimmed === '' || trimmed.startsWith('#')) {
            continue; // skip blank lines and comments between items
        } else if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed !== '') {
            break; // hit the next top-level key
        }
    }
    return items;
}

describe('pnpm-workspace.yaml supply chain settings parity', () => {
    // The monorepo workspace aggregates entries from all templates.
    // Each template's workspace must be a subset — every entry in a template
    // must also appear in the monorepo so that monorepo installs work correctly.
    it('template onlyBuiltDependencies and trustPolicyExclude are subsets of the monorepo', () => {
        const monorepoYamlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../pnpm-workspace.yaml');
        const monorepoContent = readFileSync(monorepoYamlPath, 'utf8');

        const subsetMessage = (key: string) =>
            [
                `Template has ${key} entries missing from the monorepo.`,
                `Add missing entries to the monorepo workspace:`,
                `  monorepo: ${monorepoYamlPath}`,
                `  template: ${WORKSPACE_HBS_PATH}`,
            ].join('\n');

        const monorepoBuilt = new Set(extractList(monorepoContent, 'onlyBuiltDependencies'));
        const templateBuilt = extractList(WORKSPACE_HBS_RAW, 'onlyBuiltDependencies');
        const missingBuilt = templateBuilt.filter((e) => !monorepoBuilt.has(e));
        expect(missingBuilt, subsetMessage('onlyBuiltDependencies')).toEqual([]);

        const monorepoExclude = new Set(extractList(monorepoContent, 'trustPolicyExclude'));
        const templateExclude = extractList(WORKSPACE_HBS_RAW, 'trustPolicyExclude');
        const missingExclude = templateExclude.filter((e) => !monorepoExclude.has(e));
        expect(missingExclude, subsetMessage('trustPolicyExclude')).toEqual([]);
    });

    it('monorepo and template have identical minimumReleaseAge and trustPolicy', () => {
        const monorepoYamlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../pnpm-workspace.yaml');
        const monorepoContent = readFileSync(monorepoYamlPath, 'utf8');

        const syncMessage = [
            'Update both files to keep them in sync:',
            `  monorepo: ${monorepoYamlPath}`,
            `  template: ${WORKSPACE_HBS_PATH}`,
        ].join('\n');

        const monorepoAge = extractScalar(monorepoContent, 'minimumReleaseAge');
        const templateAge = extractScalar(WORKSPACE_HBS_RAW, 'minimumReleaseAge');
        expect(monorepoAge, `minimumReleaseAge mismatch.\n${syncMessage}`).toEqual(templateAge);

        const monorepoPolicy = extractScalar(monorepoContent, 'trustPolicy');
        const templatePolicy = extractScalar(WORKSPACE_HBS_RAW, 'trustPolicy');
        expect(monorepoPolicy, `trustPolicy mismatch.\n${syncMessage}`).toEqual(templatePolicy);
    });
});

// --- Security override placement: transitive remediation pins land on the right channel ---
// Transitive overrides live in two channels with two different jobs. The root
// pnpm-workspace.yaml `overrides:` is the only channel that affects this monorepo's committed
// lockfile (the per-template `pnpm.overrides` blocks are inert here — pnpm warns and ignores
// them). The template `pnpm.overrides` blocks become a customer's effective root overrides at
// generation time (the customer pnpm-workspace.yaml.hbs carries no overrides block).
//
// Whether a security override belongs in the template turns on how the vulnerable package
// reaches a customer's tree:
//   - Dev-reachable (e2e, build, lint tooling the template declares) → mirror to the templates,
//     so a generated project pins the same fixed version the monorepo validated. Same value in
//     all three channels.
//   - Runtime-reachable only via a published SDK (storefront-next-runtime → mrt-utilities →
//     aws-sdk) → root-only. The root pin's job is collapsing this monorepo's frozen lockfile
//     duplicate so the CI SCA scan reads clean; a customer's fresh install floats the SDK's own
//     dependency range up to the fixed version without a template override, and adding one would
//     leak an SDK-internal concern into customer-owned code. Matches path-to-regexp /
//     follow-redirects, the repo's existing runtime overrides.
//
// A pin on the wrong channel reintroduces the cleared advisory for customers (dev pin missing
// from the template) or ships dead, customer-confusing config (runtime pin mirrored).

/** Read an override pin — `  'key': 'value'   # comment` — from a YAML overrides block. */
function extractOverridePin(yamlContent: string, key: string): string | undefined {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = yamlContent.match(new RegExp(`^\\s*'?${escaped}'?:\\s*(.+)$`, 'm'));
    return match?.[1]
        ?.split('#')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '');
}

describe('XML/URI security override placement', () => {
    const DEV_REACHABLE_OVERRIDES = ['@xmldom/xmldom', 'fast-uri'];
    const RUNTIME_REACHABLE_OVERRIDES = ['fast-xml-builder'];

    const here = dirname(fileURLToPath(import.meta.url));
    const monorepoYaml = readFileSync(resolve(here, '../../../pnpm-workspace.yaml'), 'utf8');
    const templatePkg = JSON.parse(readFileSync(resolve(here, '../../template/package.json'), 'utf8'));

    it('mirrors dev-reachable pins identically across the monorepo workspace and the template override block', () => {
        for (const pkg of DEV_REACHABLE_OVERRIDES) {
            const monorepoPin = extractOverridePin(monorepoYaml, pkg);
            const templatePin = templatePkg.pnpm?.overrides?.[pkg];

            expect(monorepoPin, `${pkg}: missing from monorepo pnpm-workspace.yaml overrides`).toBeDefined();
            expect(templatePin, `${pkg}: template pnpm.overrides drifted from the monorepo pin`).toBe(monorepoPin);
        }
    });

    it('keeps runtime-reachable pins root-only and out of the customer-facing template overrides', () => {
        for (const pkg of RUNTIME_REACHABLE_OVERRIDES) {
            expect(
                extractOverridePin(monorepoYaml, pkg),
                `${pkg}: missing from monorepo pnpm-workspace.yaml overrides`
            ).toBeDefined();
            expect(
                templatePkg.pnpm?.overrides?.[pkg],
                `${pkg}: runtime override leaked into template pnpm.overrides — keep it root-only`
            ).toBeUndefined();
        }
    });
});
