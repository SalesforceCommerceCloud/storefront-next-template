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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { manageExtensions, createExtension, listExtensions } from './manage-extensions';
import { execSync } from 'child_process';
import prompts from 'prompts';
import trimExtensions from './trim-extensions';
import { createPathRegex, pathsEqual } from '../test-utils';

const SOURCE_GIT_URL = 'https://github.com/SalesforceCommerceCloud/storefront-next-template.git';
const MOCK_NOW = 1731273600000;

vi.mock('prompts', () => ({
    __esModule: true,
    default: vi.fn(() => {
        return {
            sourceGitUrl: SOURCE_GIT_URL,
        };
    }),
}));

vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

vi.mock('os', () => {
    const tmpdir = vi.fn(() => '/tmp');
    return {
        tmpdir,
        default: { tmpdir },
    };
});

vi.mock('./trim-extensions', () => ({
    default: vi.fn(),
}));

const consoleLog = vi.fn();
vi.spyOn(console, 'log').mockImplementation(consoleLog);
vi.spyOn(console, 'error').mockImplementation(consoleLog);

describe('manageExtensions', () => {
    const getExtensionConfigPath = (dir: string) => path.join(dir, 'src', 'extensions', 'config.json');

    beforeEach(() => {
        vi.clearAllMocks();
        // Sanity stub for fs
        const existngPaths = [
            getExtensionConfigPath('/test-project'),
            getExtensionConfigPath(path.join('/tmp', 'fake-temp-dir')),
            getExtensionConfigPath(path.join('/tmp', `sfnext-extensions-${MOCK_NOW}`)),
            path.join('/test-project', 'src', 'extensions', 'my-extension2'),
        ];
        vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => existngPaths.includes(filePath as string));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (
                filePath === getExtensionConfigPath('/test-project') ||
                filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)
            ) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            installationInstructions: 'instructions/install-store-locator.mdc',
                            uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
                            folder: 'store-locator',
                        },
                    },
                });
            }
            return '{}';
        });
        vi.spyOn(fs, 'mkdtempSync').mockReturnValue(`/tmp/sfnext-extensions-${MOCK_NOW}`);
        vi.spyOn(fs, 'readdirSync').mockImplementationOnce((dir, options) => {
            // Use pathsEqual for cross-platform path comparison
            if (pathsEqual(dir as string, '/test-project/src') && options?.recursive) {
                return ['index.tsx.original'] as any;
            }
            return ['index.tsx'] as any;
        });
        vi.spyOn(fs, 'readdirSync').mockReturnValue(['index.tsx'] as any);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '' as any);
        vi.spyOn(fs, 'copySync').mockImplementation(() => {});
        vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    });

    it('should abort if install and uninstall are both provided', async () => {
        await manageExtensions({ projectDirectory: '/test-project', install: true, uninstall: true });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Please select either install or uninstall, not both.')
        );
    });

    it('should ask for operation if not provided', async () => {
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            operation: 'uninstall',
        });
        await manageExtensions({ projectDirectory: '/test-project' });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Please select at least one extension to uninstall')
        );
    });

    /** Uninstall test cases starts here */
    it('should abort if no extension is installed', async () => {
        vi.spyOn(fs, 'readFileSync').mockReturnValue('{"extensions": {}}');
        await manageExtensions({ projectDirectory: '/test-project', uninstall: true });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('You have not installed any extensions yet.')
        );
    });

    it('should abort if no extension is selected', async () => {
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            operation: 'uninstall',
            selectedExtensions: null,
        });
        await manageExtensions({ projectDirectory: '/test-project', uninstall: true });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Please select at least one extension to uninstall.')
        );
    });

    it('should run uninstall based on -u flag', async () => {
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            operation: 'uninstall',
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            uninstall: true,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        expect(trimExtensions).toHaveBeenCalledWith(
            '/test-project',
            {},
            {
                extensions: {
                    SFDC_EXT_STORE_LOCATOR: {
                        name: 'Store Locator',
                        description: 'Enables a shopper to find a store based on a given location.',
                        installationInstructions: 'instructions/install-store-locator.mdc',
                        uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
                        folder: 'store-locator',
                    },
                },
            }
        );
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Extensions uninstalled.'));
    });

    it('should prompt and uninstall dependents when uninstalling a dependency', async () => {
        // Mock config where BOPIS depends on Store Locator
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                        SFDC_EXT_BOPIS: {
                            name: 'BOPIS',
                            description: 'Buy Online Pickup In Store',
                            folder: 'bopis',
                            dependencies: ['SFDC_EXT_STORE_LOCATOR'],
                        },
                    },
                });
            }
            return '{}';
        });
        // Completely reset and override prompts mock for this test
        (prompts as any).mockReset();
        (prompts as any).mockReturnValue({ confirmUninstall: true });
        await manageExtensions({
            projectDirectory: '/test-project',
            uninstall: true,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        // Should show dependent warning
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('will also uninstall the following dependent extensions')
        );
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('BOPIS'));
        // Should proceed with uninstall
        expect(trimExtensions).toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Extensions uninstalled.'));
    });

    it('should uninstall dependents without prompting when yes is true', async () => {
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                        SFDC_EXT_MULTISHIP: {
                            name: 'Multiship',
                            description: 'Ship items to multiple addresses.',
                            folder: 'multiship',
                            dependencies: [],
                        },
                        SFDC_EXT_BOPIS: {
                            name: 'BOPIS',
                            description: 'Buy Online Pickup In Store',
                            folder: 'bopis',
                            dependencies: ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP'],
                        },
                    },
                });
            }
            return '{}';
        });

        await manageExtensions({
            projectDirectory: '/test-project',
            uninstall: true,
            extensions: ['SFDC_EXT_MULTISHIP'],
            yes: true,
        });

        expect(prompts).not.toHaveBeenCalled();
        expect(fs.rmSync).toHaveBeenNthCalledWith(1, path.join('/test-project', 'src', 'extensions', 'bopis'), {
            recursive: true,
            force: true,
        });
        expect(fs.rmSync).toHaveBeenNthCalledWith(2, path.join('/test-project', 'src', 'extensions', 'multiship'), {
            recursive: true,
            force: true,
        });
        expect(trimExtensions).toHaveBeenCalledWith(
            '/test-project',
            { SFDC_EXT_STORE_LOCATOR: true },
            expect.anything()
        );
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Extensions uninstalled.'));
    });

    it('should abort uninstall when user declines dependent uninstall', async () => {
        // Mock config where BOPIS depends on Store Locator
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                        SFDC_EXT_BOPIS: {
                            name: 'BOPIS',
                            description: 'Buy Online Pickup In Store',
                            folder: 'bopis',
                            dependencies: ['SFDC_EXT_STORE_LOCATOR'],
                        },
                    },
                });
            }
            return '{}';
        });
        // Completely reset and override prompts mock for this test
        (prompts as any).mockReset();
        (prompts as any).mockReturnValue({ confirmUninstall: false });

        await manageExtensions({
            projectDirectory: '/test-project',
            uninstall: true,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        // Should show dependent warning
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('will also uninstall the following dependent extensions')
        );
        // Should abort
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Uninstallation aborted.'));
        expect(trimExtensions).not.toHaveBeenCalled();
    });

    /** Install test cases starts here */
    it('should abort if cursor-agent is not installed and extension contains LLM instructions', async () => {
        // Mock project config as empty (no extensions installed yet)
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({ extensions: {} });
            }
            if (filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            installationInstructions: 'instructions/install-store-locator.mdc',
                            uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                    },
                });
            }
            return '{}';
        });
        (execSync as any).mockImplementation((command: string) => {
            if (command.indexOf('cursor-agent -v') !== -1) {
                throw new Error('not installed');
            }
            return '';
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            sourceGitUrl: SOURCE_GIT_URL,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('This extension contains LLM instructions, please install cursor cli and try again')
        );
    });

    it('should abort if no extensions are found in the source project', async () => {
        vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            sourceGitUrl: SOURCE_GIT_URL,
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            sourceGitUrl: SOURCE_GIT_URL,
        });
        // Use regex to match both Unix (/) and Windows (\) path separators
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringMatching(
                createPathRegex(
                    'No extensions found in the source project, please check src/extensions/config.json exists'
                )
            )
        );
    });

    it('should abort if no extensions are selected', async () => {
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            operation: 'install',
            selectedExtensions: null,
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            sourceGitUrl: SOURCE_GIT_URL,
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Please select exactly one extension to install.')
        );
    });

    it('should run install based on -i flag', async () => {
        // Mock project config as empty (no extensions installed yet)
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({ extensions: {} });
            }
            if (filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            installationInstructions: 'instructions/install-store-locator.mdc',
                            uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                    },
                });
            }
            return '{}';
        });
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            operation: 'install',
        });
        (execSync as any).mockImplementation(() => {});
        await manageExtensions({
            projectDirectory: '/test-project',
            sourceGitUrl: SOURCE_GIT_URL,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        // verify the extension folder is copied to the project directory
        expect(fs.copySync).toHaveBeenCalledWith(
            path.join(`/tmp`, `sfnext-extensions-${MOCK_NOW}`, 'src', 'extensions', 'store-locator'),
            path.join(`/test-project`, 'src', 'extensions', 'store-locator')
        );
        // verify the cursor-agent command is executed
        expect(execSync).toHaveBeenCalledWith(
            `cursor-agent -p --force 'Execute the steps specified in the installation instructions file: instructions/install-store-locator.mdc' --output-format text`,
            { cwd: '/test-project', stdio: 'inherit' }
        );
        // Use pathsEqual for cross-platform path comparison
        const rmSyncCalls = (fs.rmSync as any).mock.calls;
        expect(rmSyncCalls.length).toBe(1);
        expect(pathsEqual(rmSyncCalls[0][0], `/tmp/sfnext-extensions-${MOCK_NOW}`)).toBe(true);
        expect(rmSyncCalls[0][1]).toEqual({ recursive: true, force: true });
        // verify success message is logged
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Store Locator was installed successfully.')
        );
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining(
                'The following files were modified. The original files are still available in the same location with the ".original" extension:'
            )
        );
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('- index.tsx'));
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Installation completed successfully.')
        );
    });

    it('should honor the defaultOn flag', async () => {
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            operation: 'install',
        });
        (execSync as any).mockImplementation(() => {});
        await manageExtensions({
            projectDirectory: '/test-project',
        });
    });

    it('should error and exit if error occurs during installation', async () => {
        // Mock project config as empty (no extensions installed yet)
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({ extensions: {} });
            }
            if (filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            installationInstructions: 'instructions/install-store-locator.mdc',
                            uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                    },
                });
            }
            return '{}';
        });
        (execSync as any).mockImplementation((command: string) => {
            if (command.includes('cursor-agent -p --force')) {
                throw new Error('error');
            }
            return '';
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            sourceGitUrl: SOURCE_GIT_URL,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Error installing Store Locator. error')
        );
    });

    it('should skip LLM instructions if no installation instructions are found', async () => {
        // Mock project config as empty, source config has extension without installation instructions
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({ extensions: {} });
            }
            if (filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            dependencies: [],
                        },
                    },
                });
            }
            return '{}';
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            sourceGitUrl: SOURCE_GIT_URL,
            extensions: ['SFDC_EXT_STORE_LOCATOR'],
        });
        expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining('cursor-agent -p --force'));
    });

    it('should prompt and install dependencies when installing extension with missing dependencies', async () => {
        // Mock project config as empty, source has BOPIS depending on Store Locator
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({ extensions: {} });
            }
            if (filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                        SFDC_EXT_BOPIS: {
                            name: 'BOPIS',
                            description: 'Buy Online Pickup In Store',
                            folder: 'bopis',
                            installationInstructions: 'instructions/install-bopis.mdc',
                            dependencies: ['SFDC_EXT_STORE_LOCATOR'],
                        },
                    },
                });
            }
            return '{}';
        });
        // Reset and mock prompts: first call for sourceGitUrl, second for confirmInstall
        (prompts as any).mockReset();
        let promptCallCount = 0;
        (prompts as any).mockImplementation(() => {
            promptCallCount++;
            if (promptCallCount === 1) return { sourceGitUrl: SOURCE_GIT_URL };
            return { confirmInstall: true };
        });
        (execSync as any).mockImplementation(() => {});
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            extensions: ['SFDC_EXT_BOPIS'],
        });
        // Should show dependency prompt
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('requires the following dependencies')
        );
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Store Locator'));
        // Should install both extensions (Store Locator first, then BOPIS)
        expect(fs.copySync).toHaveBeenCalledWith(
            path.join(`/tmp`, `sfnext-extensions-${MOCK_NOW}`, 'src', 'extensions', 'store-locator'),
            path.join(`/test-project`, 'src', 'extensions', 'store-locator')
        );
        expect(fs.copySync).toHaveBeenCalledWith(
            path.join(`/tmp`, `sfnext-extensions-${MOCK_NOW}`, 'src', 'extensions', 'bopis'),
            path.join(`/test-project`, 'src', 'extensions', 'bopis')
        );
    });

    it('should abort install when user declines dependency install', async () => {
        // Mock project config as empty, source has BOPIS depending on Store Locator
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === getExtensionConfigPath('/test-project')) {
                return JSON.stringify({ extensions: {} });
            }
            if (filePath === getExtensionConfigPath(`/tmp/sfnext-extensions-${MOCK_NOW}`)) {
                return JSON.stringify({
                    extensions: {
                        SFDC_EXT_STORE_LOCATOR: {
                            name: 'Store Locator',
                            description: 'Enables a shopper to find a store based on a given location.',
                            folder: 'store-locator',
                            dependencies: [],
                        },
                        SFDC_EXT_BOPIS: {
                            name: 'BOPIS',
                            description: 'Buy Online Pickup In Store',
                            folder: 'bopis',
                            dependencies: ['SFDC_EXT_STORE_LOCATOR'],
                        },
                    },
                });
            }
            return '{}';
        });
        // Reset and mock prompts: first call for sourceGitUrl, second for confirmInstall (declined)
        (prompts as any).mockReset();
        let promptCallCount = 0;
        (prompts as any).mockImplementation(() => {
            promptCallCount++;
            if (promptCallCount === 1) return { sourceGitUrl: SOURCE_GIT_URL };
            return { confirmInstall: false };
        });
        await manageExtensions({
            projectDirectory: '/test-project',
            install: true,
            extensions: ['SFDC_EXT_BOPIS'],
        });
        // Should show dependency prompt
        expect(console.log).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('requires the following dependencies')
        );
        // Should abort
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Installation aborted.'));
        // Should not copy any files
        expect(fs.copySync).not.toHaveBeenCalled();
    });

    it('should error and exit if no config is found', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
        await expect(manageExtensions({ projectDirectory: '/not-exist' })).rejects.toThrow('exit');
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Extension config file not found')
        );
        exitSpy.mockRestore();
    });

    it('should create an extension', async () => {
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            extensionName: 'My Extension',
        });
        (prompts as unknown as { mockResolvedValueOnce: (value: any) => void }).mockResolvedValueOnce({
            extensionDescription: 'My Extension description',
        });
        await createExtension({ projectDirectory: '/test-project', name: '', description: '' });
        expect(fs.mkdirSync).toHaveBeenCalledWith(
            path.join('/test-project', 'src', 'extensions', 'my-extension', 'components'),
            { recursive: true }
        );
        expect(fs.mkdirSync).toHaveBeenCalledWith(
            path.join('/test-project', 'src', 'extensions', 'my-extension', 'locales'),
            { recursive: true }
        );
        expect(fs.mkdirSync).toHaveBeenCalledWith(
            path.join('/test-project', 'src', 'extensions', 'my-extension', 'hooks'),
            { recursive: true }
        );
        expect(fs.mkdirSync).toHaveBeenCalledWith(
            path.join('/test-project', 'src', 'extensions', 'my-extension', 'routes'),
            { recursive: true }
        );
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join('/test-project', 'src', 'extensions', 'my-extension', 'README.md'),
            `# My Extension\n\nMy Extension description`
        );

        // Get the second call (config.json write)
        const configWriteCall = (fs.writeFileSync as any).mock.calls[1];
        expect(configWriteCall[0]).toBe(path.join('/test-project', 'src', 'extensions', 'config.json'));

        // Parse and verify the JSON structure
        const writtenConfig = JSON.parse(configWriteCall[1]);
        expect(writtenConfig.extensions.SFDC_EXT_MY_EXTENSION).toEqual({
            name: 'My Extension',
            description: 'My Extension description',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'my-extension',
            dependencies: [],
        });
    });

    it('should prevent invalid extension name', async () => {
        await createExtension({
            projectDirectory: '/test-project',
            name: 'My Extension$',
            description: 'My Extension description',
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining(
                'Extension name can only contain alphanumeric characters, spaces, dashes, or underscores'
            )
        );
    });

    it('should prevent extension name that already exists', async () => {
        await createExtension({
            projectDirectory: '/test-project',
            name: 'Store Locator',
            description: 'Store Locator description',
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Extension "Store Locator" already exists')
        );
    });

    it('should prevent extension directory that already exists', async () => {
        await createExtension({
            projectDirectory: '/test-project',
            name: 'My Extension2',
            description: 'My Extension description',
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('[sfnext:error]'),
            expect.stringContaining('Extension directory my-extension2 already exists')
        );
    });

    /** List extensions test cases starts here */
    it('should list installed extensions', () => {
        listExtensions({ projectDirectory: '/test-project' });
        expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Store Locator'));
    });
});
