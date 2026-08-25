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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { buildTargetRegistry, transformTargets, collectUITargetIds, validateTargetRegistry } from './target-utils';
import { logger } from '../utils/logger';

describe('target-utils', () => {
    describe('transformTargetComponent', () => {
        // UITarget as part of the JSX return
        const code = `
            import React from "react";
            import { UITarget } from '@/targets/ui-target';
            export default function Test() {
                const testFunc =  async () => {
                return 'test';
                };
                return (
                <div>
                    <UITarget targetId="test.target" />
                </div>
                );
            }
            `;
        // UITarget as part of the variable declaration
        const codeWithJSXElementDeclaration = `
            import React from "react";
            import { UITarget } from '@/targets/ui-target';
            export default function Test() {
                const test = <div><UITarget targetId="test.target" /></div>;
                return (
                <div>{test}</div>
                );
            }
            `;
        // UITarget as a variable declaration
        const codeWithTargetComponentAsVariable = `
            import React from "react";
            import { UITarget } from '@/targets/ui-target';
            export default function Test() {
                const test = <UITarget targetId="test.target" />;
                return (
                <div>{test}</div>
                );
            }
            `;
        // UITarget as part of the JSXFragment
        const codeWithJSXElementReturn = `
            import React from "react";
            import { UITarget } from '@/targets/ui-target';
            export default function Test() {
                const content = <div>content</div>;
                return <>{content}<UITarget targetId="test.target" /></>;
            }
            `;
        // UITarget has no attribute (error condition)
        const codeWithTargetComponentWithoutAttr = `
            import React from "react";
            import { UITarget } from '@/targets/ui-target';
            export default function Test() {
                return (
                <div><UITarget /></div>
                );
            }
            `;
        // No UITarget present
        const codeWithoutTargetComponent = `
            import React from "react";
            export default function Test() {
                return (
                <div>test</div>
                );
            }
            `;
        // test data for multiple target components targeting a targetId
        const targetRegistry = {
            'test.target': [
                {
                    targetId: 'test.target',
                    path: 'extensions/foo1.tsx',
                    namespace: 'Bar',
                    componentName: 'Bar_Foo1',
                    order: 0,
                },
                {
                    targetId: 'test.target',
                    path: 'extensions/foo2.tsx',
                    namespace: 'Bar',
                    componentName: 'Bar_Foo2',
                    order: 1,
                },
                {
                    targetId: 'test.target',
                    path: 'extensions/foo3.tsx',
                    namespace: 'Bar',
                    componentName: 'Bar_Foo3',
                    order: 2,
                },
            ],
        };
        // test data for a single target component targeting a targetId
        const singleTargetRegistry = {
            'test.target': [
                {
                    targetId: 'test.target',
                    path: 'extensions/store-locator/components/single-comp.tsx',
                    namespace: 'Bar',
                    componentName: 'Bar_FooSingle',
                    order: 0,
                },
            ],
        };

        it('should replace a single <UITarget /> with the correct registered component', () => {
            const transformed = transformTargets(code, singleTargetRegistry, []);
            // Should import the registered component and replace the UITarget tag
            expect(transformed).toContain(
                `import Bar_FooSingle from '@/extensions/store-locator/components/single-comp';`
            );
            expect(transformed).not.toContain('UITarget');
            expect(transformed).toContain('<Bar_FooSingle />');
        });

        it('should replace UITarget with corresponding registry component in variable declaration', () => {
            const output = transformTargets(codeWithTargetComponentAsVariable, targetRegistry, []);
            expect(output).toContain('<Bar_Foo1 /><Bar_Foo2 /><Bar_Foo3 />');
            expect(output).not.toContain('UITarget');
            expect(output).toContain(`import Bar_Foo1 from '@/extensions/foo1';`);
            expect(output).toContain(`import Bar_Foo2 from '@/extensions/foo2';`);
            expect(output).toContain(`import Bar_Foo3 from '@/extensions/foo3';`);
        });

        it('should replace UITarget with corresponding registry component', () => {
            const output = transformTargets(code, targetRegistry, []);
            expect(output).toContain('<Bar_Foo1 /><Bar_Foo2 /><Bar_Foo3 />');
            expect(output).not.toContain('UITarget');
            expect(output).toContain("import Bar_Foo1 from '@/extensions/foo1';");
            expect(output).toContain("import Bar_Foo2 from '@/extensions/foo2';");
            expect(output).toContain("import Bar_Foo3 from '@/extensions/foo3';");
        });

        it('should replace UITarget with corresponding registry component in JSX element declaration', () => {
            const output = transformTargets(codeWithJSXElementDeclaration, targetRegistry, []);
            expect(output).toContain('<Bar_Foo1 /><Bar_Foo2 /><Bar_Foo3 />');
            expect(output).not.toContain('UITarget');
        });

        it('should replace UITarget with corresponding registry component in JSX element return', () => {
            const output = transformTargets(codeWithJSXElementReturn, targetRegistry, []);
            expect(output).toContain('<Bar_Foo1 /><Bar_Foo2 /><Bar_Foo3 />');
            expect(output).not.toContain('UITarget');
        });

        it('should not transform code without UITarget', () => {
            const output = transformTargets(codeWithoutTargetComponent, targetRegistry, []);
            expect(output).toBeNull();
        });

        it('should not transform UITarget without targetId attribute', () => {
            expect(() => transformTargets(codeWithTargetComponentWithoutAttr, targetRegistry, [])).toThrow(
                'UITarget must contain a targetId attribute'
            );
        });

        it('should remove UITarget if targetId not found in registry', () => {
            const codeMissingTarget = `
        export default function Test() {
          return (
            <div>
              <UITarget targetId="not.found" />
            </div>
          );
        }
      `;
            const output = transformTargets(codeMissingTarget, targetRegistry, []);
            expect(output).not.toContain('UITarget');
            expect(output).toContain('<div>');
            expect(output).toContain('</div>');
        });

        it('should keep children of UITarget if present and not replaced', () => {
            const codeWithChildren = `
        export default async function Test() {
          return (
            <UITarget targetId="not.found"><span>Hello</span></UITarget>
          );
        }
      `;
            const output = transformTargets(codeWithChildren, targetRegistry, []);
            expect(output).toContain('<span>Hello</span>');
            expect(output).not.toContain('UITarget');
        });

        it('should preserve wrapped children when UITarget is replaced', () => {
            const codeWithChildren = `
        export default async function Test() {
          return (
            <UITarget targetId="test.target"><span>Hello</span></UITarget>
          );
        }
      `;
            const output = transformTargets(codeWithChildren, targetRegistry, []);
            expect(output).toContain('<Bar_Foo1>');
            expect(output).toContain('<Bar_Foo2>');
            expect(output).toContain('<Bar_Foo3>');
            expect(output).toContain('<span>Hello</span>');
            expect(output).not.toContain('UITarget');
        });

        it('should preserve valid JSX when unresolved UITarget is inside prop expression', () => {
            const codeWithTargetInPropExpression = `
        import React from "react";
        import { UITarget } from '@/targets/ui-target';
        function Wrapper({ slot }) { return <div>{slot}</div>; }
        export default function Test() {
          return <Wrapper slot={<UITarget targetId="not.found" />} />;
        }
      `;
            const output = transformTargets(codeWithTargetInPropExpression, targetRegistry, []);
            expect(output).toContain('slot={<></>}');
            expect(output).not.toContain('UITarget');
        });
    });

    describe('injectTargetContextProviders', () => {
        const code = `
      import React from "react";
      import { UITargetProviders } from '@/targets/ui-target-providers';
      export default function Root({ children }) { 
        const test = () => {
          return 'test';
        }
        return <UITargetProviders>{children}</UITargetProviders>
      }
    `;

        const codeWithVariableDeclaration = `
            import React from "react";
            import { UITargetProviders } from '@/targets/ui-target-providers';
            export default function Root({ children }) { 
                const test = <UITargetProviders>{children}</UITargetProviders>;
                return {test}
            }
        `;

        const contextProviders = [
            {
                path: 'extensions/foo/providers/foo-provider.tsx',
                namespace: 'Foo',
                componentName: 'Foo_BarProvider',
                order: 0,
            },
            {
                path: 'extensions/bar/providers/bar-provider.tsx',
                namespace: 'Bar',
                componentName: 'Bar_BazProvider',
                order: 1,
            },
        ];

        it('should wrap ComposeProviders children in context providers', () => {
            const result = transformTargets(code, {}, contextProviders);
            expect(result).toContain('<Foo_BarProvider>');
            expect(result).toContain('<Bar_BazProvider>');
            // All providers and children are nested
            expect(result?.indexOf('<Foo_BarProvider>') ?? -1).toBeLessThan(result?.indexOf('<Bar_BazProvider>') ?? -1);
            expect(result).not.toContain('UITargetProviders');
        });

        it('should wrap UITargetProviders children in context providers in variable declaration', () => {
            const result = transformTargets(codeWithVariableDeclaration, {}, contextProviders);
            expect(result).toContain('<Foo_BarProvider>');
            expect(result).toContain('<Bar_BazProvider>');
            // All providers and children are nested
            expect(result?.indexOf('<Foo_BarProvider>') ?? -1).toBeLessThan(result?.indexOf('<Bar_BazProvider>') ?? -1);
            expect(result).not.toContain('UITargetProviders');
        });

        it('should remove UITargetProviders without ComposeProviders', () => {
            const result = transformTargets(code, {}, []);
            expect(result).not.toContain('UITargetProviders');
            expect(result).toContain('<>{children}</>');
        });

        it('should emit import statements for context providers', () => {
            const result = transformTargets(code, {}, contextProviders);
            expect(result).toContain("import Foo_BarProvider from '@/extensions/foo/providers/foo-provider';");
            expect(result).toContain("import Bar_BazProvider from '@/extensions/bar/providers/bar-provider';");
        });

        it('should not replace the ui-target-providers import via the UITarget block', () => {
            // Regression: 'UITargetProviders'.includes('UITarget') === true, and
            // '@/targets/ui-target-providers'.includes('@/targets/ui-target') === true.
            // The UITarget replacement block must not fire on a file that only uses UITargetProviders.
            const result = transformTargets(code, {}, contextProviders);
            // The providers import should be rewritten to context provider imports (correct path)
            expect(result).toContain('Foo_BarProvider');
            // It must NOT contain a bare ui-target import or ui-target-providers import — both replaced correctly
            expect(result).not.toContain("from '@/targets/ui-target-providers'");
            expect(result).not.toContain("from '@/targets/ui-target'");
        });
    });

    describe('buildTargetRegistry', () => {
        const extensionsRoot = join(__dirname, '__test-extensions__');
        const extensionDir = join(extensionsRoot, 'src', 'extensions', 'store-locator');
        const extensionConfigPath = join(extensionDir, 'target-config.json');
        beforeEach(() => {
            // Setup fake extension directory and config
            fs.ensureDirSync(extensionDir);
            const extensionConfig = {
                components: [
                    {
                        targetId: 'footer.ourcompany.start',
                        path: 'extensions/store-locator/components/footer/index.tsx',
                        order: 0,
                    },
                    {
                        targetId: 'footer.ourcompany.start',
                        path: 'extensions/multiship/components/footer/index.tsx',
                        order: 1,
                    },
                    {
                        targetId: 'header.before.cart',
                        path: 'extensions/store-locator/components/header/store-locator-badge.tsx',
                        order: 2,
                    },
                ],
                contextProviders: [
                    {
                        path: 'extensions/store-locator/providers/store-locator.tsx',
                        order: 1,
                    },
                ],
            };
            fs.writeJsonSync(extensionConfigPath, extensionConfig);
        });

        afterEach(() => {
            fs.removeSync(extensionsRoot);
        });

        it('should build componentRegistry and contextProviders from extensions', () => {
            const { componentRegistry, contextProviders } = buildTargetRegistry(join(extensionsRoot, 'src'));

            expect(componentRegistry['footer.ourcompany.start']).toHaveLength(2);
            expect(componentRegistry['footer.ourcompany.start'][0].targetId).toBe('footer.ourcompany.start');
            expect(componentRegistry['footer.ourcompany.start'][1].targetId).toBe('footer.ourcompany.start');
            expect(componentRegistry['header.before.cart'][0].order).toBe(2);

            expect(contextProviders).toHaveLength(1);
            expect(contextProviders[0].path).toBe('extensions/store-locator/providers/store-locator.tsx');

            // It generates proper componentName and namespace
            expect(componentRegistry['footer.ourcompany.start'][0].componentName).toMatch(/StoreLocator_Index/);
            expect(contextProviders[0].componentName).toMatch(/StoreLocator_StoreLocator/);
        });

        it('should sort components and contextProviders by order', () => {
            // Add a second contextProvider with lower order
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.contextProviders.push({
                path: 'extensions/store-locator/providers/zzz-provider.tsx',
                order: 0,
            });
            extensionConfig.contextProviders.push({
                path: 'extensions/store-locator/providers/yyy-provider.tsx',
                order: 3,
            });
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { contextProviders } = buildTargetRegistry(join(extensionsRoot, 'src'));
            expect(contextProviders[0].order).toBe(0);
            expect(contextProviders[1].order).toBe(1);
            expect(contextProviders[2].order).toBe(3);
            expect(contextProviders[0].path).toContain('zzz-provider.tsx');
            expect(contextProviders[1].path).toContain('store-locator.tsx');
            expect(contextProviders[2].path).toContain('yyy-provider.tsx');
        });

        it('should include a devOnly extension in non-production builds', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.devOnly = true;
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { componentRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'), { isProduction: false });
            expect(componentRegistry['footer.ourcompany.start']).toHaveLength(2);
        });

        it('should exclude a devOnly extension in production builds', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.devOnly = true;
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { componentRegistry, contextProviders } = buildTargetRegistry(join(extensionsRoot, 'src'), {
                isProduction: true,
            });
            expect(componentRegistry['footer.ourcompany.start']).toBeUndefined();
            expect(contextProviders).toHaveLength(0);
        });

        it('should build actionHookRegistry from extensions', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.actionHooks = [
                {
                    hookId: 'sfcc.checkout.shipping.afterMethodsFetch',
                    handler: 'extensions/store-locator/hooks/enrich-shipping.server.ts',
                    order: 0,
                },
                {
                    hookId: 'sfcc.checkout.addressVerification.afterSubmitShippingAddress',
                    handler: 'extensions/store-locator/hooks/validate-address.server.ts',
                    order: 1,
                },
            ];
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { actionHookRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'));

            expect(actionHookRegistry['sfcc.checkout.shipping.afterMethodsFetch']).toHaveLength(1);
            expect(actionHookRegistry['sfcc.checkout.shipping.afterMethodsFetch'][0].hookId).toBe(
                'sfcc.checkout.shipping.afterMethodsFetch'
            );
            expect(actionHookRegistry['sfcc.checkout.shipping.afterMethodsFetch'][0].path).toBe(
                'extensions/store-locator/hooks/enrich-shipping.server.ts'
            );
            expect(actionHookRegistry['sfcc.checkout.shipping.afterMethodsFetch'][0].handlerName).toMatch(
                /StoreLocator_EnrichShippingServer/
            );

            expect(actionHookRegistry['sfcc.checkout.addressVerification.afterSubmitShippingAddress']).toHaveLength(1);
        });

        it('should sort action hooks by order', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.actionHooks = [
                {
                    hookId: 'sfcc.checkout.fraud.afterSubmitContactInfo',
                    handler: 'extensions/store-locator/hooks/fraud-check-b.server.ts',
                    order: 10,
                },
                {
                    hookId: 'sfcc.checkout.fraud.afterSubmitContactInfo',
                    handler: 'extensions/store-locator/hooks/fraud-check-a.server.ts',
                    order: 0,
                },
            ];
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { actionHookRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'));

            const handlers = actionHookRegistry['sfcc.checkout.fraud.afterSubmitContactInfo'];
            expect(handlers).toHaveLength(2);
            expect(handlers[0].order).toBe(0);
            expect(handlers[1].order).toBe(10);
            expect(handlers[0].path).toContain('fraud-check-a');
            expect(handlers[1].path).toContain('fraud-check-b');
        });

        it('should return empty actionHookRegistry when none configured', () => {
            const { actionHookRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'));

            expect(Object.keys(actionHookRegistry)).toHaveLength(0);
        });

        it('should exclude action hooks from devOnly extensions in production', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.devOnly = true;
            extensionConfig.actionHooks = [
                {
                    hookId: 'sfcc.checkout.shipping.afterMethodsFetch',
                    handler: 'extensions/store-locator/hooks/enrich-shipping.server.ts',
                    order: 0,
                },
            ];
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { actionHookRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'), {
                isProduction: true,
            });

            expect(Object.keys(actionHookRegistry)).toHaveLength(0);
        });

        it('should warn when UITarget components share the same targetId and order', () => {
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            // The existing config already has two components targeting 'footer.ourcompany.start'
            // with orders 0 and 1 — change the second to 0 to trigger the warning
            extensionConfig.components[1].order = 0;
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            buildTargetRegistry(join(extensionsRoot, 'src'));

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UITarget "footer.ourcompany.start"'));
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('same order (0)'));
            warnSpy.mockRestore();
        });

        it('should warn when action hooks share the same hookId and order', () => {
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.actionHooks = [
                {
                    hookId: 'sfcc.checkout.fraud.afterSubmitContactInfo',
                    handler: 'extensions/store-locator/hooks/fraud-a.server.ts',
                    order: 0,
                },
                {
                    hookId: 'sfcc.checkout.fraud.afterSubmitContactInfo',
                    handler: 'extensions/store-locator/hooks/fraud-b.server.ts',
                    order: 0,
                },
            ];
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            buildTargetRegistry(join(extensionsRoot, 'src'));

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Action hook "sfcc.checkout.fraud.afterSubmitContactInfo"')
            );
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('same order (0)'));
            warnSpy.mockRestore();
        });

        it('should not warn when order values are distinct', () => {
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            buildTargetRegistry(join(extensionsRoot, 'src'));

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('should skip components with enabled === false', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.components[0].enabled = false;
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { componentRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'));
            expect(componentRegistry['footer.ourcompany.start']).toHaveLength(1);
            expect(componentRegistry['footer.ourcompany.start'][0].path).toContain('multiship');
        });

        it('should include components with enabled === true', () => {
            const extensionConfig = fs.readJsonSync(extensionConfigPath);
            extensionConfig.components[0].enabled = true;
            fs.writeJsonSync(extensionConfigPath, extensionConfig);

            const { componentRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'));
            expect(componentRegistry['footer.ourcompany.start']).toHaveLength(2);
        });

        it('should include components without an enabled field (backward compatible)', () => {
            const { componentRegistry } = buildTargetRegistry(join(extensionsRoot, 'src'));
            expect(componentRegistry['footer.ourcompany.start']).toHaveLength(2);
        });
    });

    describe('UITarget and UITargetProviders coexistence', () => {
        const codeWithBoth = `
            import React from "react";
            import { UITarget } from '@/targets/ui-target';
            import { UITargetProviders } from '@/targets/ui-target-providers';
            export default function Root({ children }) {
                return (
                    <UITargetProviders>
                        <div><UITarget targetId="test.target" /></div>
                        {children}
                    </UITargetProviders>
                );
            }
        `;

        const singleTargetRegistry = {
            'test.target': [
                {
                    targetId: 'test.target',
                    path: 'extensions/store-locator/components/single-comp.tsx',
                    namespace: 'Bar',
                    componentName: 'Bar_FooSingle',
                    order: 0,
                },
            ],
        };

        const contextProviders = [
            {
                path: 'extensions/foo/providers/foo-provider.tsx',
                namespace: 'Foo',
                componentName: 'Foo_BarProvider',
                order: 0,
            },
            {
                path: 'extensions/bar/providers/bar-provider.tsx',
                namespace: 'Bar',
                componentName: 'Bar_BazProvider',
                order: 1,
            },
        ];

        it('should emit both target-component and provider imports when both tags coexist', () => {
            // Regression: under the old .includes() logic, the UITarget block would match
            // '@/targets/ui-target-providers' as a substring of '@/targets/ui-target' and
            // clobber the providers import before the providers block could run.
            const result = transformTargets(codeWithBoth, singleTargetRegistry, contextProviders);

            // UITarget branch: extension component import injected
            expect(result).toContain("import Bar_FooSingle from '@/extensions/store-locator/components/single-comp';");
            // Providers branch: context provider imports injected (not clobbered)
            expect(result).toContain("import Foo_BarProvider from '@/extensions/foo/providers/foo-provider';");
            expect(result).toContain("import Bar_BazProvider from '@/extensions/bar/providers/bar-provider';");

            expect(result).not.toContain('UITarget');
            expect(result).not.toContain('UITargetProviders');
        });
    });

    describe('collectUITargetIds', () => {
        const testDir = join(__dirname, '__test-collect-targets__');

        beforeEach(() => {
            fs.ensureDirSync(testDir);
        });

        afterEach(() => {
            fs.removeSync(testDir);
        });

        it('should collect targetIds from tsx files', () => {
            fs.ensureDirSync(join(testDir, 'components'));
            fs.writeFileSync(
                join(testDir, 'components', 'page.tsx'),
                `<UITarget targetId="sfcc.header.before.cart" />\n<UITarget targetId="sfcc.footer.start" />`
            );

            const ids = collectUITargetIds(testDir);
            expect(ids).toContain('sfcc.header.before.cart');
            expect(ids).toContain('sfcc.footer.start');
            expect(ids.size).toBe(2);
        });

        it('should exclude the extensions directory', () => {
            fs.ensureDirSync(join(testDir, 'extensions', 'my-ext'));
            fs.writeFileSync(
                join(testDir, 'extensions', 'my-ext', 'comp.tsx'),
                `<UITarget targetId="should.not.be.found" />`
            );
            fs.ensureDirSync(join(testDir, 'components'));
            fs.writeFileSync(join(testDir, 'components', 'page.tsx'), `<UITarget targetId="valid.target" />`);

            const ids = collectUITargetIds(testDir);
            expect(ids).not.toContain('should.not.be.found');
            expect(ids).toContain('valid.target');
        });

        it('should return empty set when no targets found', () => {
            fs.writeFileSync(join(testDir, 'page.tsx'), `export default function Page() { return <div />; }`);

            const ids = collectUITargetIds(testDir);
            expect(ids.size).toBe(0);
        });

        it('should match single-quoted targetId attributes', () => {
            fs.ensureDirSync(join(testDir, 'components'));
            fs.writeFileSync(
                join(testDir, 'components', 'page.tsx'),
                `<UITarget targetId='sfcc.header.single.quote' />`
            );

            const ids = collectUITargetIds(testDir);
            expect(ids).toContain('sfcc.header.single.quote');
        });

        it('should not match targetId on non-UITarget components', () => {
            fs.ensureDirSync(join(testDir, 'components'));
            fs.writeFileSync(
                join(testDir, 'components', 'page.tsx'),
                `<SomeOther targetId="not.a.real.target" />\n<UITarget targetId="real.target" />`
            );

            const ids = collectUITargetIds(testDir);
            expect(ids).not.toContain('not.a.real.target');
            expect(ids).toContain('real.target');
            expect(ids.size).toBe(1);
        });

        it('should exclude test files', () => {
            fs.ensureDirSync(join(testDir, 'components'));
            fs.writeFileSync(join(testDir, 'components', 'page.tsx'), `<UITarget targetId="real.target" />`);
            fs.writeFileSync(join(testDir, 'components', 'page.test.tsx'), `<UITarget targetId="test.only.target" />`);

            const ids = collectUITargetIds(testDir);
            expect(ids).toContain('real.target');
            expect(ids).not.toContain('test.only.target');
            expect(ids.size).toBe(1);
        });
    });

    describe('validateTargetRegistry', () => {
        it('should return empty array when all targetIds are declared', () => {
            const registry = {
                'sfcc.header.before.cart': [
                    {
                        targetId: 'sfcc.header.before.cart',
                        path: 'extensions/foo/comp.tsx',
                        namespace: 'Foo',
                        componentName: 'Foo_Comp',
                        order: 0,
                    },
                ],
            };
            const declared = new Set(['sfcc.header.before.cart', 'sfcc.footer.start']);

            const orphaned = validateTargetRegistry(registry, declared);
            expect(orphaned).toHaveLength(0);
        });

        it('should return orphaned entries for undeclared targetIds', () => {
            const registry = {
                'sfcc.header.before.cart': [
                    {
                        targetId: 'sfcc.header.before.cart',
                        path: 'extensions/foo/comp.tsx',
                        namespace: 'Foo',
                        componentName: 'Foo_Comp',
                        order: 0,
                    },
                ],
                'sfcc.nonexistent.target': [
                    {
                        targetId: 'sfcc.nonexistent.target',
                        path: 'extensions/bar/widget.tsx',
                        namespace: 'Bar',
                        componentName: 'Bar_Widget',
                        order: 0,
                    },
                ],
            };
            const declared = new Set(['sfcc.header.before.cart']);

            const orphaned = validateTargetRegistry(registry, declared);
            expect(orphaned).toHaveLength(1);
            expect(orphaned[0].targetId).toBe('sfcc.nonexistent.target');
            expect(orphaned[0].extension).toBe('Bar');
            expect(orphaned[0].componentPath).toBe('extensions/bar/widget.tsx');
        });

        it('should report all components for a single orphaned targetId', () => {
            const registry = {
                'missing.target': [
                    {
                        targetId: 'missing.target',
                        path: 'extensions/a/comp.tsx',
                        namespace: 'A',
                        componentName: 'A_Comp',
                        order: 0,
                    },
                    {
                        targetId: 'missing.target',
                        path: 'extensions/b/comp.tsx',
                        namespace: 'B',
                        componentName: 'B_Comp',
                        order: 1,
                    },
                ],
            };
            const declared = new Set<string>();

            const orphaned = validateTargetRegistry(registry, declared);
            expect(orphaned).toHaveLength(2);
        });

        it('should return empty array for empty registry', () => {
            const orphaned = validateTargetRegistry({}, new Set(['some.target']));
            expect(orphaned).toHaveLength(0);
        });
    });
});
