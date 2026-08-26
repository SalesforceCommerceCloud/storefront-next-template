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
import { Project, ts, type Decorator } from 'ts-morph';
import {
    extractComponentInfo,
    hasNamedExport,
    hasFallbackExport,
    generateRegistryCode,
    type ComponentInfo,
} from './staticRegistry';

/**
 * Helper to create a ts-morph decorator from source code
 */
function getDecorator(source: string): Decorator {
    const project = new Project({
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
        },
    });
    const sf = project.createSourceFile('test.tsx', source, { overwrite: true });
    const cls = sf.getClasses()[0];
    const dec = cls.getDecorators()[0];
    return dec;
}

/**
 * Helper to create a ts-morph source file from source code
 */
function getSourceFile(source: string) {
    const project = new Project({
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
        },
    });
    return project.createSourceFile('test.tsx', source, { overwrite: true });
}

describe('extractComponentInfo', () => {
    const testCases = [
        {
            description: 'extracts basic component ID with default group',
            source: "@Component('hero')\nexport default class Hero {}",
            expected: { id: 'storefrontnext_base.hero', group: 'storefrontnext_base' },
        },
        {
            description: 'extracts custom group from metadata object',
            source: "@Component('hero', { group: 'custom_group' })\nexport default class Hero {}",
            expected: { id: 'custom_group.hero', group: 'custom_group' },
        },
        {
            description: 'handles single quotes in component ID',
            source: "@Component('product-carousel')\nexport default class ProductCarousel {}",
            expected: { id: 'storefrontnext_base.product-carousel', group: 'storefrontnext_base' },
        },
        {
            description: 'handles double quotes in component ID',
            source: '@Component("hero")\nexport default class Hero {}',
            expected: { id: 'storefrontnext_base.hero', group: 'storefrontnext_base' },
        },
        {
            description: 'handles template literals in component ID',
            source: '@Component(`hero`)\nexport default class Hero {}',
            expected: { id: 'storefrontnext_base.hero', group: 'storefrontnext_base' },
        },
        {
            description: 'handles nested group properties',
            source: "@Component('hero', { name: 'Hero Banner', group: 'layouts', description: 'A hero section' })\nexport default class Hero {}",
            expected: { id: 'layouts.hero', group: 'layouts' },
        },
        {
            description: 'returns null for decorator without call expression',
            source: '@SomeOtherDecorator\nexport default class Hero {}',
            expected: null,
        },
        {
            description: 'returns null for Component decorator without arguments',
            source: '@Component()\nexport default class Hero {}',
            expected: null,
        },
        {
            description: 'returns null for Component decorator with non-string argument',
            source: '@Component(123)\nexport default class Hero {}',
            expected: null,
        },
    ];

    it.each(testCases)('$description', ({ source, expected }) => {
        if (expected === null) {
            // For null cases, we expect the function to return null
            const decorator = getDecorator(source);
            const result = extractComponentInfo(decorator);
            expect(result).toBeNull();
        } else {
            const decorator = getDecorator(source);
            const result = extractComponentInfo(decorator);
            expect(result).toEqual(expected);
        }
    });
});

describe('hasNamedExport', () => {
    const testCases = [
        {
            description: 'detects function export',
            source: 'export function loader() { return {}; }',
            exportName: 'loader',
            expected: true,
        },
        {
            description: 'detects const export',
            source: 'export const clientLoader = () => {};',
            exportName: 'clientLoader',
            expected: true,
        },
        {
            description: 'detects arrow function export',
            source: 'export const fallback = () => <div>Loading...</div>;',
            exportName: 'fallback',
            expected: true,
        },
        {
            description: 'returns false for non-existent export',
            source: 'export function loader() { return {}; }',
            exportName: 'clientLoader',
            expected: false,
        },
        {
            description: 'returns false for non-exported function',
            source: 'function loader() { return {}; }',
            exportName: 'loader',
            expected: false,
        },
        {
            description: 'detects named export in export declaration',
            source: 'const loader = () => {}; export { loader };',
            exportName: 'loader',
            expected: true,
        },
        {
            description: 'detects renamed export in export declaration',
            source: 'const myLoader = () => {}; export { myLoader as loader };',
            exportName: 'loader',
            expected: true,
        },
        {
            description: 'handles multiple exports',
            source: `
                export function loader() { return {}; }
                export const clientLoader = () => {};
                function internalHelper() {}
            `,
            exportName: 'loader',
            expected: true,
        },
    ];

    it.each(testCases)('$description', ({ source, exportName, expected }) => {
        const sourceFile = getSourceFile(source);
        const result = hasNamedExport(sourceFile, exportName);
        expect(result).toBe(expected);
    });
});

describe('hasFallbackExport', () => {
    const testCases = [
        {
            description: 'detects named fallback export',
            source: 'export const fallback = () => <div>Loading...</div>;',
            expected: true,
        },
        {
            description: 'detects default export with fallback in name',
            source: 'export default function ProductCarouselFallback() { return <div>Loading...</div>; }',
            expected: true,
        },
        {
            description: 'returns false when no fallback export exists',
            source: 'export function loader() { return {}; }',
            expected: false,
        },
        {
            description: 'returns false for default export without fallback in name',
            source: 'export default function Hero() { return <div>Hero</div>; }',
            expected: false,
        },
    ];

    it.each(testCases)('$description', ({ source, expected }) => {
        const sourceFile = getSourceFile(source);
        const result = hasFallbackExport(sourceFile);
        expect(result).toBe(expected);
    });
});

describe('generateRegistryCode', () => {
    it('generates empty registry for no components', () => {
        const components: ComponentInfo[] = [];
        const result = generateRegistryCode(components, 'registry');

        expect(result).toContain('No components found with @Component decorators');
        expect(result).toContain('export function initializeRegistry(targetRegistry = registry): void {');
        expect(result).toContain('// No components found with @Component decorators');
        expect(result).toContain('export async function loadAndRegisterRegistryComponents(');
    });

    it('generates registrations in stable sorted order', () => {
        const components: ComponentInfo[] = [
            {
                id: 'storefrontnext_base.productCarousel',
                filePath: '/test/project/src/components/product-carousel/index.tsx',
                relativePath: '../components/product-carousel/index',
                hasLoader: false,
                hasClientLoader: false,
                hasFallback: false,
            },
            {
                id: 'storefrontnext_base.hero',
                filePath: '/test/project/src/components/hero/index.tsx',
                relativePath: '../components/hero/index',
                hasLoader: false,
                hasClientLoader: false,
                hasFallback: false,
            },
            {
                id: 'storefrontnext_base.heroAlt',
                filePath: '/test/project/src/components/hero-alt/index.tsx',
                relativePath: '../components/hero-alt/index',
                hasLoader: false,
                hasClientLoader: false,
                hasFallback: false,
            },
        ];

        const result = generateRegistryCode(components, 'registry');

        // Check header comment includes sorted component list (all components, including duplicates)
        expect(result).toContain(
            'Components registered: storefrontnext_base.hero, storefrontnext_base.heroAlt, storefrontnext_base.productCarousel'
        );

        const heroIndex = result.indexOf("() => import('../components/hero/index')");
        const heroAltIndex = result.indexOf("() => import('../components/hero-alt/index')");
        const carouselIndex = result.indexOf("() => import('../components/product-carousel/index')");

        expect(heroIndex).toBeGreaterThan(-1);
        expect(heroAltIndex).toBeGreaterThan(-1);
        expect(carouselIndex).toBeGreaterThan(-1);

        // Hero components should come before carousel (sorted by id)
        expect(heroIndex).toBeLessThan(carouselIndex);
        expect(heroAltIndex).toBeLessThan(carouselIndex);

        expect(result).toContain('targetRegistry.loadAndRegister(id)');
        expect(result).not.toContain("['storefrontnext_base.hero', () => import('../components/hero/index')]");
        expect(result).not.toContain('targetRegistry.registerComponent(');
        expect(result).toContain('await Promise.all(');

        // Within same id, should be sorted by relativePath (hero before hero-alt)
        expect(heroIndex).toBeLessThan(heroAltIndex);
    });

    it('keeps generation deterministic for identical component records', () => {
        const component: ComponentInfo = {
            id: 'storefrontnext_base.hero',
            filePath: '/test/project/src/components/hero/index.tsx',
            relativePath: '../components/hero/index',
            hasLoader: false,
            hasClientLoader: false,
            hasFallback: false,
        };

        expect(generateRegistryCode([component, { ...component }], 'registry')).toContain(
            'Components registered: storefrontnext_base.hero, storefrontnext_base.hero'
        );
    });

    it('includes loader names when components have loaders', () => {
        const components: ComponentInfo[] = [
            {
                id: 'storefrontnext_base.hero',
                filePath: '/test/project/src/components/hero/index.tsx',
                relativePath: '../components/hero/index',
                hasLoader: true,
                hasClientLoader: false,
                hasFallback: false,
            },
        ];

        const result = generateRegistryCode(components, 'registry');

        expect(result).toContain("targetRegistry.registerImporter('storefrontnext_base.hero'");
        expect(result).toContain("{ loader: 'loader' }");
    });

    it('includes client loader names when components have client loaders', () => {
        const components: ComponentInfo[] = [
            {
                id: 'storefrontnext_base.hero',
                filePath: '/test/project/src/components/hero/index.tsx',
                relativePath: '../components/hero/index',
                hasLoader: false,
                hasClientLoader: true,
                hasFallback: false,
            },
        ];

        const result = generateRegistryCode(components, 'registry');

        expect(result).toContain("targetRegistry.registerImporter('storefrontnext_base.hero'");
        expect(result).toContain("{ clientLoader: 'clientLoader' }");
    });

    it('includes both loader types when component has both', () => {
        const components: ComponentInfo[] = [
            {
                id: 'storefrontnext_base.hero',
                filePath: '/test/project/src/components/hero/index.tsx',
                relativePath: '../components/hero/index',
                hasLoader: true,
                hasClientLoader: true,
                hasFallback: false,
            },
        ];

        const result = generateRegistryCode(components, 'registry');

        expect(result).toContain("targetRegistry.registerImporter('storefrontnext_base.hero'");
        expect(result).toContain("{ loader: 'loader', clientLoader: 'clientLoader' }");
    });

    it('uses custom registry identifier', () => {
        const components: ComponentInfo[] = [
            {
                id: 'storefrontnext_base.hero',
                filePath: '/test/project/src/components/hero/index.tsx',
                relativePath: '../components/hero/index',
                hasLoader: false,
                hasClientLoader: false,
                hasFallback: false,
            },
        ];

        const result = generateRegistryCode(components, 'customRegistry');

        expect(result).toContain('export function initializeRegistry(targetRegistry = customRegistry): void {');
        expect(result).toContain('targetRegistry = customRegistry');
    });
});
