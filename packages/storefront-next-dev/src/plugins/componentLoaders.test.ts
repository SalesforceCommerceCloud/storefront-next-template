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
import { parse } from '@babel/parser';
import { stripExports, hasComponentDecorator, componentLoadersPlugin } from './componentLoaders';

function parseCode(code: string) {
    return parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx', 'decorators'] });
}

describe('componentLoaders', () => {
    describe('hasComponentDecorator', () => {
        it('returns true for a class with @Component decorator', () => {
            const code = ['@Component("hero", { name: "Hero" })', 'export class HeroMetadata {}'].join('\n');
            expect(hasComponentDecorator(parseCode(code))).toBe(true);
        });

        it('returns false when @Component only appears in a comment', () => {
            const code = ['// This uses @Component("hero") pattern', 'export class HeroMetadata {}'].join('\n');
            expect(hasComponentDecorator(parseCode(code))).toBe(false);
        });

        it('returns false when @Component only appears in a string literal', () => {
            const code = 'const x = "@Component(test)";';
            expect(hasComponentDecorator(parseCode(code))).toBe(false);
        });

        it('returns false when there is no class at all', () => {
            const code = 'export default function Hero() { return null; }';
            expect(hasComponentDecorator(parseCode(code))).toBe(false);
        });

        it('returns false for a class without decorators', () => {
            const code = 'export class HeroMetadata {}';
            expect(hasComponentDecorator(parseCode(code))).toBe(false);
        });

        it('returns false for a class with a different decorator', () => {
            const code = ['@Injectable()', 'export class HeroService {}'].join('\n');
            expect(hasComponentDecorator(parseCode(code))).toBe(false);
        });

        it('returns true when @Component is one of multiple decorators', () => {
            const code = ['@Injectable()', '@Component("hero", { name: "Hero" })', 'export class HeroMetadata {}'].join(
                '\n'
            );
            expect(hasComponentDecorator(parseCode(code))).toBe(true);
        });
    });

    describe('stripExports', () => {
        describe('export const pattern', () => {
            it('strips `export const loader` when told to strip "loader"', () => {
                const code = [
                    'import { loader as loaders } from "./loaders";',
                    '',
                    'export default function MyComponent() { return null; }',
                    '',
                    '// eslint-disable-next-line react-refresh/only-export-components',
                    'export const loader = loaders.server;',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                // The import should also be removed since it is no longer referenced
                expect(result).not.toContain('import { loader as loaders }');
                // The default export should remain
                expect(result).toContain('export default function MyComponent');
            });

            it('strips `export const clientLoader` when told to strip "clientLoader"', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const clientLoader = () => ({ data: "client" });',
                ].join('\n');

                const result = stripExports(code, ['clientLoader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const clientLoader');
                expect(result).toContain('export default function MyComponent');
            });

            it('returns null when the export to strip is not present', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    'export const fallback = () => null;',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).toBeNull();
            });

            it('does not strip exports that are not in the strip list', () => {
                const code = [
                    'import { loader as loaders } from "./loaders";',
                    '',
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const loader = loaders.server;',
                    'export const fallback = () => null;',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                expect(result).toContain('export const fallback');
            });
        });

        describe('export function pattern', () => {
            it('strips `export function loader`', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export function loader(args) { return fetch("/api"); }',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export function loader');
                expect(result).toContain('export default function MyComponent');
            });
        });

        describe('export class pattern', () => {
            it('strips `export class loader`', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export class loader { static fetch() { return null; } }',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export class loader');
                expect(result).toContain('export default function MyComponent');
            });
        });

        describe('destructured export validation', () => {
            it('throws on `export const { loader } = …`', () => {
                const code = 'export const { loader, other } = getExports();';

                expect(() => stripExports(code, ['loader'])).toThrow('Cannot remove destructured export "loader"');
            });

            it('throws on `export const [loader] = …`', () => {
                const code = 'export const [loader, other] = getExports();';

                expect(() => stripExports(code, ['loader'])).toThrow('Cannot remove destructured export "loader"');
            });

            it('throws on nested destructured export `export const { nested: { loader } } = …`', () => {
                const code = 'export const { nested: { loader } } = getExports();';

                expect(() => stripExports(code, ['loader'])).toThrow('Cannot remove destructured export "loader"');
            });

            it('throws on rest element `export const { ...loader } = …`', () => {
                const code = 'export const { ...loader } = getExports();';

                expect(() => stripExports(code, ['loader'])).toThrow('Cannot remove destructured export "loader"');
            });

            it('does not throw when destructured export is not in strip list', () => {
                const code = 'export const { other } = getExports();';

                expect(() => stripExports(code, ['loader'])).not.toThrow();
            });
        });

        describe('property assignment cleanup', () => {
            it('removes `clientLoader.hydrate = true` after stripping clientLoader', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export function clientLoader() { return { data: "client" }; }',
                    'clientLoader.hydrate = true;',
                ].join('\n');

                const result = stripExports(code, ['clientLoader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export function clientLoader');
                expect(result).not.toContain('clientLoader.hydrate');
                expect(result).toContain('export default function MyComponent');
            });

            it('removes `loader.displayName = "…"` after stripping loader', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const loader = () => fetch("/api");',
                    'loader.displayName = "myLoader";',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                expect(result).not.toContain('loader.displayName');
            });

            it('does not remove property assignments to unrelated identifiers', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const loader = () => fetch("/api");',
                    'MyComponent.displayName = "MyComponent";',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).toContain('MyComponent.displayName');
            });
        });

        describe('re-export pattern', () => {
            it('strips `export { loader }` re-export', () => {
                const code = [
                    'import { myLoader } from "./loaders";',
                    '',
                    'export default function MyComponent() { return null; }',
                    '',
                    'export { myLoader as loader };',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export { myLoader as loader }');
                // The import should be removed as well since myLoader is no longer referenced
                expect(result).not.toContain('import { myLoader }');
            });

            it('strips `export { loader } from "./loaders"` source re-export', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export { loader } from "./loaders";',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export { loader }');
            });

            it('keeps other specifiers when stripping one from a multi-specifier export', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    'export { loader, fallback } from "./loaders";',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                // fallback should remain
                expect(result).toContain('fallback');
                expect(result).not.toMatch(/export\s*\{[^}]*loader[^}]*}/);
            });
        });

        describe('dead code elimination', () => {
            it('removes a helper function only used by the stripped export', () => {
                const code = [
                    'function fetchData() { return fetch("/api"); }',
                    '',
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const loader = () => fetchData();',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                expect(result).not.toContain('fetchData');
            });

            it('preserves a helper function still referenced elsewhere', () => {
                const code = [
                    'function fetchData() { return fetch("/api"); }',
                    '',
                    'export default function MyComponent() { return fetchData(); }',
                    '',
                    'export const loader = () => fetchData();',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                expect(result).toContain('fetchData');
            });

            it('transitively removes imports only used by the stripped export via a helper', () => {
                const code = [
                    'import { serverFetch } from "./server-utils";',
                    '',
                    'function fetchData() { return serverFetch("/api"); }',
                    '',
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const loader = () => fetchData();',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                expect(result).not.toContain('fetchData');
                expect(result).not.toContain('serverFetch');
                expect(result).not.toContain('./server-utils');
            });
        });

        describe('import cleanup', () => {
            it('preserves imports that are still referenced elsewhere', () => {
                const code = [
                    'import { loader as loaders } from "./loaders";',
                    '',
                    'export default function MyComponent() { return <div>{loaders.name}</div>; }',
                    '',
                    'export const loader = loaders.server;',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                // Import should remain because `loaders` is still used in the component
                expect(result).toContain('import { loader as loaders }');
            });

            it('removes the entire import when all specifiers become unused', () => {
                const code = [
                    'import { loader as loaders } from "./loaders";',
                    '',
                    'export default function MyComponent() { return null; }',
                    '',
                    'export const loader = loaders.server;',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('import');
                expect(result).not.toContain('./loaders');
            });

            it('keeps other specifiers in a multi-specifier import', () => {
                const code = [
                    'import { loader as loaders, someHelper } from "./loaders";',
                    '',
                    'export default function MyComponent() { return someHelper(); }',
                    '',
                    'export const loader = loaders.server;',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('export const loader');
                // someHelper is still used, so import should remain but without the loaders specifier
                expect(result).toContain('someHelper');
                // The local binding 'loaders' should be removed from the import specifiers
                // (note: './loaders' still appears as module source, so we check the specifier)
                expect(result).not.toMatch(/import\s*\{[^}]*loaders[^}]*}/);
            });
        });

        describe('eslint-disable comment cleanup', () => {
            it('removes eslint-disable-next-line comment above stripped export', () => {
                const code = [
                    'export default function MyComponent() { return null; }',
                    '',
                    '// eslint-disable-next-line react-refresh/only-export-components',
                    'export const loader = () => {};',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                expect(result).not.toContain('eslint-disable');
            });
        });

        describe('real-world component patterns', () => {
            it('handles the product-carousel index.tsx pattern', () => {
                const code = [
                    'import { AttributeDefinition, Component } from "@/lib/decorators";',
                    'import { loader as loaders } from "./loaders";',
                    '',
                    'export { default as ProductCarouselSkeleton } from "./skeleton";',
                    'export { default as Carousel } from "./carousel";',
                    '',
                    'import { ProductCarouselWithSuspense } from "./carousel";',
                    'export { ProductCarouselWithSuspense };',
                    '',
                    'export default ProductCarouselWithSuspense;',
                    '',
                    '@Component("productCarousel", {',
                    '    name: "Product Carousel",',
                    '})',
                    'export class ProductCarouselWithSuspenseMetadata {',
                    '    @AttributeDefinition()',
                    '    title?: string;',
                    '}',
                    '',
                    '// eslint-disable-next-line react-refresh/only-export-components',
                    'export const loader = loaders.server;',
                    '',
                    '// eslint-disable-next-line react-refresh/only-export-components',
                    'export { default as fallback } from "./skeleton";',
                ].join('\n');

                const result = stripExports(code, ['loader']);

                expect(result).not.toBeNull();
                // loader export should be stripped
                expect(result).not.toContain('export const loader');
                // loaders import should be stripped (only used by the loader export)
                expect(result).not.toContain('import { loader as loaders }');
                // Everything else should remain
                expect(result).toContain('export { default as ProductCarouselSkeleton }');
                expect(result).toContain('export { default as Carousel }');
                expect(result).toContain('export { ProductCarouselWithSuspense }');
                expect(result).toContain('export default ProductCarouselWithSuspense');
                expect(result).toContain('ProductCarouselWithSuspenseMetadata');
                expect(result).toContain('export { default as fallback }');
                // Decorators should still work
                expect(result).toContain('@Component');
                expect(result).toContain('@AttributeDefinition');
            });
        });
    });

    describe('componentLoadersPlugin', () => {
        /**
         * Simulates the Vite lifecycle by calling `configResolved` with the given mode before invoking `transform`.
         */
        function initPlugin(plugin: ReturnType<typeof componentLoadersPlugin>, mode = 'development') {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-function-type
            (plugin.configResolved as Function)({ mode } as any);
        }

        describe('plugin configuration', () => {
            it('has correct plugin name', () => {
                const plugin = componentLoadersPlugin();
                expect(plugin.name).toBe('storefrontnext:component-loaders');
            });

            it('enforces pre order', () => {
                const plugin = componentLoadersPlugin();
                expect(plugin.enforce).toBe('pre');
            });

            it('has a transform hook', () => {
                const plugin = componentLoadersPlugin();
                expect(plugin.transform).toBeDefined();
            });
        });

        describe('transform filtering', () => {
            function callTransform(
                plugin: ReturnType<typeof componentLoadersPlugin>,
                code: string,
                id: string,
                environmentName?: string
            ) {
                initPlugin(plugin, 'development');
                const context = {
                    environment: environmentName ? { name: environmentName } : undefined,
                };
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-function-type
                return (plugin.transform as Function).call(context, code, id);
            }

            it('skips files outside componentPath', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = 'export const loader = () => {};';

                const result = callTransform(plugin, code, '/project/src/lib/utils.ts', 'client');

                expect(result).toBeNull();
            });

            it('skips non-script files', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = 'export const loader = () => {};';

                const result = callTransform(plugin, code, '/project/src/components/hero/styles.css', 'client');

                expect(result).toBeNull();
            });

            it('skips test files', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = 'export const loader = () => {};';

                const result = callTransform(plugin, code, '/project/src/components/hero/index.test.tsx', 'client');

                expect(result).toBeNull();
            });

            it('skips story files', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = 'export const loader = () => {};';

                const result = callTransform(plugin, code, '/project/src/components/hero/hero.stories.tsx', 'client');

                expect(result).toBeNull();
            });

            it('skips when environment is not available', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = 'export const loader = () => {};';

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx');

                expect(result).toBeNull();
            });

            it('skips when code has no matching exports', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = 'export default function Hero() { return null; }';

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'client');

                expect(result).toBeNull();
            });

            it('skips when Vite mode is "test" (e.g. Vitest)', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                // Simulate Vitest setting mode to 'test'
                initPlugin(plugin, 'test');
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const loader = () => fetch("/api");',
                ].join('\n');

                const context = { environment: { name: 'client' } };
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-function-type
                const result = (plugin.transform as Function).call(
                    context,
                    code,
                    '/project/src/components/hero/index.tsx'
                );

                expect(result).toBeNull();
            });

            it('skips files without @Component decorator', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    'export const loader = () => fetch("/api");',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'client');

                expect(result).toBeNull();
            });

            it('processes files with @Component decorator', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const loader = () => fetch("/api");',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'client');

                expect(result).not.toBeNull();
                expect(result.code).not.toContain('export const loader');
            });
        });

        describe('environment-based stripping', () => {
            function callTransform(
                plugin: ReturnType<typeof componentLoadersPlugin>,
                code: string,
                id: string,
                environmentName: string
            ) {
                initPlugin(plugin, 'development');
                const context = {
                    environment: { name: environmentName },
                };
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-function-type
                return (plugin.transform as Function).call(context, code, id);
            }

            it('strips `loader` export in client environment', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const loader = () => fetch("/api");',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'client');

                expect(result).not.toBeNull();
                expect(result.code).not.toContain('export const loader');
                expect(result.code).toContain('export default function Hero');
            });

            it('preserves `loader` export in ssr environment', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const loader = () => fetch("/api");',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'ssr');

                // SSR should not strip `loader`, so result should be null (no change)
                expect(result).toBeNull();
            });

            it('strips `clientLoader` export in ssr environment', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const clientLoader = () => ({ data: "client" });',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'ssr');

                expect(result).not.toBeNull();
                expect(result.code).not.toContain('export const clientLoader');
                expect(result.code).toContain('export default function Hero');
            });

            it('preserves `clientLoader` export in client environment', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const clientLoader = () => ({ data: "client" });',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'client');

                // Client should not strip `clientLoader`, so result should be null (no change)
                expect(result).toBeNull();
            });

            it('returns null for unknown environments', () => {
                const plugin = componentLoadersPlugin({ componentPath: 'src/components' });
                const code = [
                    'export default function Hero() { return null; }',
                    '@Component("hero", { name: "Hero" })',
                    'export class HeroMetadata {}',
                    'export const loader = () => fetch("/api");',
                ].join('\n');

                const result = callTransform(plugin, code, '/project/src/components/hero/index.tsx', 'custom');

                expect(result).toBeNull();
            });
        });
    });
});
