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

import { describe, it, expect } from 'vitest';
import {
    resolveDependencies,
    getDependents,
    resolveDependents,
    validateNoCycles,
    getMissingDependencies,
    resolveDependenciesForMultiple,
    resolveDependentsForMultiple,
    type ExtensionConfig,
} from './dependency-utils';

// Test fixture: BOPIS depends on both Store Locator and Multiship.
const twoLayerConfig: ExtensionConfig = {
    extensions: {
        SFDC_EXT_STORE_LOCATOR: {
            name: 'Store Locator',
            description: 'Enables a shopper to find a store based on a given location.',
            installationInstructions: 'instructions/install-store-locator.mdc',
            uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
            folder: 'store-locator',
            dependencies: [],
        },
        SFDC_EXT_BOPIS: {
            name: 'Buy Online Pickup In Store',
            description:
                'Enables a shopper to order online and pick up their order at a physical store. Requires the Store Locator and Multiship extensions to be installed.',
            installationInstructions: 'instructions/install-buy-online-pickup-in-store.mdc',
            uninstallationInstructions: 'instructions/uninstall-buy-online-pickup-in-store.mdc',
            folder: 'bopis',
            dependencies: ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP'],
        },
        SFDC_EXT_MULTISHIP: {
            name: 'Multiship',
            description: 'Multiship allows a shopper to ship items in their order to multiple addresses.',
            installationInstructions: 'instructions/install-multiship.mdc',
            uninstallationInstructions: 'instructions/uninstall-multiship.mdc',
            folder: 'multiship',
            dependencies: [],
        },
    },
};

// Test fixture: Store Locator depends on Base Maps; BOPIS also depends on Multiship.
const threeLayerConfig: ExtensionConfig = {
    extensions: {
        SFDC_EXT_BASE_MAPS: {
            name: 'Base Maps',
            description: 'Provides core mapping functionality.',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'base-maps',
            dependencies: [],
        },
        SFDC_EXT_STORE_LOCATOR: {
            name: 'Store Locator',
            description: 'Enables a shopper to find a store based on a given location.',
            installationInstructions: 'instructions/install-store-locator.mdc',
            uninstallationInstructions: 'instructions/uninstall-store-locator.mdc',
            folder: 'store-locator',
            dependencies: ['SFDC_EXT_BASE_MAPS'],
        },
        SFDC_EXT_BOPIS: {
            name: 'Buy Online Pickup In Store',
            description:
                'Enables a shopper to order online and pick up their order at a physical store. Requires the Store Locator and Multiship extensions to be installed.',
            installationInstructions: 'instructions/install-buy-online-pickup-in-store.mdc',
            uninstallationInstructions: 'instructions/uninstall-buy-online-pickup-in-store.mdc',
            folder: 'bopis',
            dependencies: ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP'],
        },
        SFDC_EXT_MULTISHIP: {
            name: 'Multiship',
            description: 'Multiship allows a shopper to ship items in their order to multiple addresses.',
            installationInstructions: 'instructions/install-multiship.mdc',
            uninstallationInstructions: 'instructions/uninstall-multiship.mdc',
            folder: 'multiship',
            dependencies: [],
        },
    },
};

// Test fixture: diamond dependency pattern (A -> B -> D, A -> C -> D)
// This tests revisiting nodes during traversal
const diamondConfig: ExtensionConfig = {
    extensions: {
        SFDC_EXT_D: {
            name: 'Extension D',
            description: 'Base extension at bottom of diamond',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'd',
            dependencies: [],
        },
        SFDC_EXT_B: {
            name: 'Extension B',
            description: 'Left side of diamond, depends on D',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'b',
            dependencies: ['SFDC_EXT_D'],
        },
        SFDC_EXT_C: {
            name: 'Extension C',
            description: 'Right side of diamond, depends on D',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'c',
            dependencies: ['SFDC_EXT_D'],
        },
        SFDC_EXT_A: {
            name: 'Extension A',
            description: 'Top of diamond, depends on B and C',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'a',
            dependencies: ['SFDC_EXT_B', 'SFDC_EXT_C'],
        },
    },
};

// Test fixture: circular dependency (A -> B -> A)
const circularDirectConfig: ExtensionConfig = {
    extensions: {
        SFDC_EXT_A: {
            name: 'Extension A',
            description: 'Extension A',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'ext-a',
            dependencies: ['SFDC_EXT_B'],
        },
        SFDC_EXT_B: {
            name: 'Extension B',
            description: 'Extension B',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'ext-b',
            dependencies: ['SFDC_EXT_A'],
        },
    },
};

// Test fixture: indirect circular dependency (A -> B -> C -> A)
const circularIndirectConfig: ExtensionConfig = {
    extensions: {
        SFDC_EXT_A: {
            name: 'Extension A',
            description: 'Extension A',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'ext-a',
            dependencies: ['SFDC_EXT_B'],
        },
        SFDC_EXT_B: {
            name: 'Extension B',
            description: 'Extension B',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'ext-b',
            dependencies: ['SFDC_EXT_C'],
        },
        SFDC_EXT_C: {
            name: 'Extension C',
            description: 'Extension C',
            installationInstructions: '',
            uninstallationInstructions: '',
            folder: 'ext-c',
            dependencies: ['SFDC_EXT_A'],
        },
    },
};

describe('dependency-utils', () => {
    describe('resolveDependencies', () => {
        it('returns only the extension itself when it has no dependencies', () => {
            const result = resolveDependencies('SFDC_EXT_STORE_LOCATOR', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_STORE_LOCATOR']);
        });

        it('resolves direct dependencies in bottom up order', () => {
            const result = resolveDependencies('SFDC_EXT_BOPIS', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP', 'SFDC_EXT_BOPIS']);
        });

        it('resolves nested and direct dependencies in bottom up order', () => {
            const result = resolveDependencies('SFDC_EXT_BOPIS', threeLayerConfig);
            expect(result).toEqual([
                'SFDC_EXT_BASE_MAPS',
                'SFDC_EXT_STORE_LOCATOR',
                'SFDC_EXT_MULTISHIP',
                'SFDC_EXT_BOPIS',
            ]);
        });

        it('returns empty array for non-existent extension', () => {
            const result = resolveDependencies('SFDC_EXT_NONEXISTENT', twoLayerConfig);
            expect(result).toEqual([]);
        });

        it('handles diamond dependency pattern without duplicates', () => {
            // A depends on B and C, both B and C depend on D
            // D should only appear once in the result
            const result = resolveDependencies('SFDC_EXT_A', diamondConfig);
            expect(result).toEqual(['SFDC_EXT_D', 'SFDC_EXT_B', 'SFDC_EXT_C', 'SFDC_EXT_A']);
            // Verify D only appears once
            expect(result.filter((r) => r === 'SFDC_EXT_D')).toHaveLength(1);
        });
    });

    describe('getDependents', () => {
        it('returns extensions that directly depend on the given extension', () => {
            const result = getDependents('SFDC_EXT_STORE_LOCATOR', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS']);
        });

        it('returns empty array when no extensions depend on the given extension', () => {
            const result = getDependents('SFDC_EXT_BOPIS', twoLayerConfig);
            expect(result).toEqual([]);
        });

        it('returns BOPIS as the dependent of Multiship', () => {
            const result = getDependents('SFDC_EXT_MULTISHIP', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS']);
        });
    });

    describe('getDependents', () => {
        it('returns multiple dependents in diamond pattern', () => {
            // D has both B and C depending on it
            const result = getDependents('SFDC_EXT_D', diamondConfig);
            expect(result).toContain('SFDC_EXT_B');
            expect(result).toContain('SFDC_EXT_C');
            expect(result).toHaveLength(2);
        });
    });

    describe('resolveDependents', () => {
        it('returns only the extension itself when nothing depends on it', () => {
            const result = resolveDependents('SFDC_EXT_BOPIS', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS']);
        });

        it('handles diamond pattern - resolves dependents without duplicates', () => {
            // When uninstalling D, need to uninstall B, C, and A first
            // A depends on B and C, both B and C depend on D
            const result = resolveDependents('SFDC_EXT_D', diamondConfig);
            // A should come before B and C (A is dependent of both)
            // B and C should come before D
            expect(result).toContain('SFDC_EXT_A');
            expect(result).toContain('SFDC_EXT_B');
            expect(result).toContain('SFDC_EXT_C');
            expect(result).toContain('SFDC_EXT_D');
            // Each should appear only once
            expect(result).toHaveLength(4);
            // D should be last (it's the one being uninstalled)
            expect(result[result.length - 1]).toBe('SFDC_EXT_D');
        });

        it('resolves single dependent in reverse bottom up order', () => {
            const result = resolveDependents('SFDC_EXT_STORE_LOCATOR', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS', 'SFDC_EXT_STORE_LOCATOR']);
        });

        it('uninstalls BOPIS before Multiship', () => {
            const result = resolveDependents('SFDC_EXT_MULTISHIP', twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS', 'SFDC_EXT_MULTISHIP']);
        });

        it('resolves transitive 3-layer dependent chain in reverse bottom up order', () => {
            const result = resolveDependents('SFDC_EXT_BASE_MAPS', threeLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS', 'SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_BASE_MAPS']);
        });
    });

    describe('validateNoCycles', () => {
        it('passes for valid config with no cycles', () => {
            expect(() => validateNoCycles(twoLayerConfig)).not.toThrow();
        });

        it('passes for valid 3-layer config with no cycles', () => {
            expect(() => validateNoCycles(threeLayerConfig)).not.toThrow();
        });

        it('throws for direct cycle (A -> B -> A)', () => {
            expect(() => validateNoCycles(circularDirectConfig)).toThrow('Circular dependency detected');
        });

        it('throws for indirect cycle (A -> B -> C -> A)', () => {
            expect(() => validateNoCycles(circularIndirectConfig)).toThrow('Circular dependency detected');
        });

        it('includes cycle path in error message', () => {
            try {
                validateNoCycles(circularDirectConfig);
                expect.fail('Should have thrown');
            } catch (e) {
                const message = (e as Error).message;
                expect(message).toContain('->');
                // Should contain the cycle path
                expect(message).toMatch(/SFDC_EXT_[AB].*->.*SFDC_EXT_[AB]/);
            }
        });
    });

    describe('getMissingDependencies', () => {
        it('returns empty when all dependencies are installed', () => {
            const installed = ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP', 'SFDC_EXT_BOPIS'];
            const result = getMissingDependencies('SFDC_EXT_BOPIS', installed, twoLayerConfig);
            expect(result).toEqual([]);
        });

        it('returns missing dependencies in bottom up order', () => {
            const installed: string[] = [];
            const result = getMissingDependencies('SFDC_EXT_BOPIS', installed, twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP', 'SFDC_EXT_BOPIS']);
        });

        it('returns only missing dependencies when some are installed', () => {
            const installed = ['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP'];
            const result = getMissingDependencies('SFDC_EXT_BOPIS', installed, twoLayerConfig);
            expect(result).toEqual(['SFDC_EXT_BOPIS']);
        });

        it('handles transitive chain with partial installation', () => {
            const installed = ['SFDC_EXT_BASE_MAPS'];
            const result = getMissingDependencies('SFDC_EXT_BOPIS', installed, threeLayerConfig);
            expect(result).toEqual(['SFDC_EXT_STORE_LOCATOR', 'SFDC_EXT_MULTISHIP', 'SFDC_EXT_BOPIS']);
        });
    });

    describe('resolveDependenciesForMultiple', () => {
        it('merges dependencies for multiple extensions', () => {
            const result = resolveDependenciesForMultiple(['SFDC_EXT_BOPIS', 'SFDC_EXT_MULTISHIP'], twoLayerConfig);
            expect(result).toContain('SFDC_EXT_STORE_LOCATOR');
            expect(result).toContain('SFDC_EXT_BOPIS');
            expect(result).toContain('SFDC_EXT_MULTISHIP');
        });

        it('deduplicates shared dependencies', () => {
            // Both extensions depend on the same things - should not duplicate
            const result = resolveDependenciesForMultiple(['SFDC_EXT_BOPIS'], twoLayerConfig);
            const uniqueResult = [...new Set(result)];
            expect(result).toEqual(uniqueResult);
        });

        it('maintains bottom up order', () => {
            const result = resolveDependenciesForMultiple(['SFDC_EXT_BOPIS'], threeLayerConfig);
            const baseMapsIndex = result.indexOf('SFDC_EXT_BASE_MAPS');
            const storeLocatorIndex = result.indexOf('SFDC_EXT_STORE_LOCATOR');
            const multishipIndex = result.indexOf('SFDC_EXT_MULTISHIP');
            const bopisIndex = result.indexOf('SFDC_EXT_BOPIS');

            expect(baseMapsIndex).toBeLessThan(storeLocatorIndex);
            expect(storeLocatorIndex).toBeLessThan(bopisIndex);
            expect(multishipIndex).toBeLessThan(bopisIndex);
        });
    });

    describe('resolveDependentsForMultiple', () => {
        it('merges dependents for multiple extensions', () => {
            const result = resolveDependentsForMultiple(['SFDC_EXT_STORE_LOCATOR'], twoLayerConfig);
            expect(result).toContain('SFDC_EXT_BOPIS');
            expect(result).toContain('SFDC_EXT_STORE_LOCATOR');
        });

        it('deduplicates shared dependents', () => {
            const result = resolveDependentsForMultiple(['SFDC_EXT_BASE_MAPS'], threeLayerConfig);
            const uniqueResult = [...new Set(result)];
            expect(result).toEqual(uniqueResult);
        });

        it('maintains reverse bottom up order (dependents first)', () => {
            const result = resolveDependentsForMultiple(['SFDC_EXT_BASE_MAPS'], threeLayerConfig);
            const baseMapsIndex = result.indexOf('SFDC_EXT_BASE_MAPS');
            const storeLocatorIndex = result.indexOf('SFDC_EXT_STORE_LOCATOR');
            const bopisIndex = result.indexOf('SFDC_EXT_BOPIS');

            // Dependents should come first (bottom up)
            expect(bopisIndex).toBeLessThan(storeLocatorIndex);
            expect(storeLocatorIndex).toBeLessThan(baseMapsIndex);
        });
    });
});
