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
import type { Plugin } from 'vite';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { generate as _generate } from '@babel/generator';
import { deadCodeElimination, findReferencedIdentifiers } from 'babel-dead-code-elimination';
import {
    type ArrayPattern,
    isArrayPattern,
    isClassDeclaration,
    isExportSpecifier,
    isFunctionDeclaration,
    isIdentifier,
    isMemberExpression,
    isObjectPattern,
    isObjectProperty,
    isRestElement,
    isVariableDeclaration,
    type Node,
    type ObjectPattern,
} from '@babel/types';

// Handle CJS/ESM interop for babel packages (same pattern as target-utils.ts)
const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;
const generate = (_generate as unknown as { default: typeof _generate }).default || _generate;

/**
 * Names of exports to strip per environment.
 *
 * - `loader` is server-only → strip from the **client** build
 * - `clientLoader` is client-only → strip from the **server** build
 */
const STRIP_FROM_CLIENT = ['loader'] as const;
const STRIP_FROM_SERVER = ['clientLoader'] as const;

/**
 * Configuration options for the component loader strip plugin.
 */
export interface ComponentLoadersPluginConfig {
    /**
     * Path prefix (relative to project root) that limits which files are
     * processed. Only modules whose resolved id contains this path segment
     * will be transformed.
     *
     * @default 'src/components'
     */
    componentPath?: string;
}

/**
 * Determines which export names should be stripped for a given Vite environment.
 */
function getExportsToStrip(environmentName: string): ReadonlyArray<string> {
    // React Router / Vite convention: "client" for the browser bundle, "ssr" for the server bundle
    if (environmentName === 'client') {
        return STRIP_FROM_CLIENT;
    }
    if (environmentName === 'ssr') {
        return STRIP_FROM_SERVER;
    }
    return [];
}

/**
 * Returns `true` when the source code contains at least one of the given export names as a quick pre-check before
 * running the full AST transform.
 */
function hasExportCandidate(code: string, names: ReadonlyArray<string>): boolean {
    return names.some((name) => code.includes(name));
}

/**
 * Checks whether the AST contains at least one class declaration decorated with `@Component(…)`.
 */
export function hasComponentDecorator(ast: ReturnType<typeof parse>): boolean {
    let found = false;
    traverse(ast, {
        ClassDeclaration(path) {
            const decorators = path.node.decorators;
            if (!decorators) return;
            for (const decorator of decorators) {
                // @Component(…) → CallExpression with callee Identifier "Component"
                if (
                    decorator.expression.type === 'CallExpression' &&
                    isIdentifier(decorator.expression.callee) &&
                    decorator.expression.callee.name === 'Component'
                ) {
                    found = true;
                    path.stop();
                    return;
                }
            }
        },
    });
    return found;
}

/**
 * Strips the specified named exports from the given source code using a
 * Babel AST transform.
 *
 * The transform handles the following patterns:
 *
 * 1. `export const loader = …;`
 * 2. `export function loader(…) {…}`
 * 3. `export class Loader {…}`
 * 4. `export { loader }` / `export { foo as loader }`
 * 5. `export { loader } from './loaders'`
 *
 * Destructured exports (`export const { loader } = …` or
 * `export const [loader] = …`) cannot be safely removed and will
 * throw an error if encountered (matching React Router behaviour).
 *
 * After removing an export, the transform also:
 * - Removes top-level property assignments to the stripped export
 *   (e.g. `clientLoader.hydrate = true`)
 * - Removes any import declarations that become unused as a result
 *
 * @see {@link https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/vite/remove-exports.ts React Router remove-exports}
 * @returns The transformed source code, or `null` if nothing was changed.
 */
export function stripExports(
    code: string,
    exportsToStrip: ReadonlyArray<string>,
    preParsedAst?: ReturnType<typeof parse>
): string | null {
    const ast =
        preParsedAst ??
        parse(code, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx', 'decorators'],
        });

    let changed = false;

    // Snapshot referenced identifiers before any mutations so that `deadCodeElimination` can detect
    // newly-unreferenced bindings.
    const previouslyReferencedIdentifiers = findReferencedIdentifiers(ast);

    // Track local names of removed exports for property assignment cleanup (e.g. `clientLoader.hydrate = true`
    // after `export function clientLoader`)
    const removedExportLocalNames = new Set<string>();

    traverse(ast, {
        ExportNamedDeclaration(path) {
            const { declaration, specifiers } = path.node;

            // --- Pattern 1: export const <name> = … ---
            if (declaration && isVariableDeclaration(declaration)) {
                const remaining = declaration.declarations.filter((decl) => {
                    if (isIdentifier(decl.id) && exportsToStrip.includes(decl.id.name)) {
                        removedExportLocalNames.add(decl.id.name);
                        return false; // remove this declarator
                    }

                    // Destructured exports cannot be safely removed — throw
                    // (matching React Router behaviour)
                    if (isArrayPattern(decl.id) || isObjectPattern(decl.id)) {
                        validateDestructuredExports(decl.id, exportsToStrip);
                    }

                    return true;
                });

                if (remaining.length < declaration.declarations.length) {
                    changed = true;
                    if (remaining.length === 0) {
                        // Remove the eslint-disable comment on the line above if present
                        removeLeadingEslintDisableComment(path);
                        path.remove();
                    } else {
                        declaration.declarations = remaining;
                    }
                }
                return;
            }

            // --- Pattern 2: export function <name>() {} ---
            if (declaration && isFunctionDeclaration(declaration)) {
                if (declaration.id && exportsToStrip.includes(declaration.id.name)) {
                    changed = true;
                    removedExportLocalNames.add(declaration.id.name);
                    removeLeadingEslintDisableComment(path);
                    path.remove();
                    return;
                }
            }

            // --- Pattern 3: export class <name> {} ---
            if (declaration && isClassDeclaration(declaration)) {
                if (declaration.id && exportsToStrip.includes(declaration.id.name)) {
                    changed = true;
                    removedExportLocalNames.add(declaration.id.name);
                    removeLeadingEslintDisableComment(path);
                    path.remove();
                    return;
                }
            }

            // --- Pattern 4: export { loader } / export { foo as loader } ---
            // --- Pattern 5: export { loader } from './loaders' (re-export with source) ---
            if (specifiers.length > 0) {
                const remaining = specifiers.filter((spec) => {
                    if (isExportSpecifier(spec)) {
                        const exportedName = isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value;
                        if (exportsToStrip.includes(exportedName)) {
                            // Track for property assignment cleanup
                            // (e.g. `export { myFunc as loader }` → remove `loader.x = …`)
                            removedExportLocalNames.add(spec.local.name);
                            return false;
                        }
                    }
                    return true;
                });

                if (remaining.length < specifiers.length) {
                    changed = true;
                    if (remaining.length === 0) {
                        removeLeadingEslintDisableComment(path);
                        path.remove();
                    } else {
                        path.node.specifiers = remaining;
                    }
                }
            }
        },
    });

    // Second pass: remove top-level property assignments to stripped exports
    // (e.g. `clientLoader.hydrate = true`, `loader.displayName = "..."`)
    if (changed) {
        traverse(ast, {
            ExpressionStatement(path) {
                // Only handle top-level statements
                if (!path.parentPath?.isProgram()) {
                    return;
                }

                if (path.node.expression.type === 'AssignmentExpression') {
                    const left = path.node.expression.left;
                    if (
                        isMemberExpression(left) &&
                        isIdentifier(left.object) &&
                        (exportsToStrip.includes(left.object.name) || removedExportLocalNames.has(left.object.name))
                    ) {
                        removeLeadingEslintDisableComment(path);
                        path.remove();
                    }
                }
            },
        });
    }

    // Third pass: transitively remove all newly-unreferenced bindings (imports, helper functions, constants, etc.)
    // using the same library as React Router's remove-exports.
    if (changed) {
        deadCodeElimination(ast, previouslyReferencedIdentifiers);
    }

    if (!changed) {
        return null;
    }

    const output = generate(ast, { retainLines: true }, code);
    return output.code;
}

/**
 * Validates that no destructured export patterns contain names that should
 * be stripped. Destructured exports cannot be safely removed, so we throw
 * an error instead (matching React Router behaviour).
 */
function validateDestructuredExports(id: ArrayPattern | ObjectPattern, exportsToStrip: ReadonlyArray<string>): void {
    if (isArrayPattern(id)) {
        for (const element of id.elements) {
            if (!element) continue;

            if (isIdentifier(element) && exportsToStrip.includes(element.name)) {
                throw new Error(`Cannot remove destructured export "${element.name}"`);
            }

            if (
                isRestElement(element) &&
                isIdentifier(element.argument) &&
                exportsToStrip.includes(element.argument.name)
            ) {
                throw new Error(`Cannot remove destructured export "${element.argument.name}"`);
            }

            if (isArrayPattern(element) || isObjectPattern(element)) {
                validateDestructuredExports(element, exportsToStrip);
            }
        }
    }

    if (isObjectPattern(id)) {
        for (const property of id.properties) {
            if (!property) continue;

            if (isObjectProperty(property) && isIdentifier(property.key)) {
                if (isIdentifier(property.value) && exportsToStrip.includes(property.value.name)) {
                    throw new Error(`Cannot remove destructured export "${property.value.name}"`);
                }

                if (isArrayPattern(property.value) || isObjectPattern(property.value)) {
                    validateDestructuredExports(property.value, exportsToStrip);
                }
            }

            if (
                isRestElement(property) &&
                isIdentifier(property.argument) &&
                exportsToStrip.includes(property.argument.name)
            ) {
                throw new Error(`Cannot remove destructured export "${property.argument.name}"`);
            }
        }
    }
}

/**
 * Removes a leading `// eslint-disable-next-line …` comment that sits on
 * the line immediately before the given path.
 */
function removeLeadingEslintDisableComment(path: { node: Node }): void {
    const leadingComments = path.node.leadingComments;
    if (!leadingComments || leadingComments.length === 0) return;

    const last = leadingComments[leadingComments.length - 1];
    if (last.type === 'CommentLine' && last.value.includes('eslint-disable')) {
        leadingComments.pop();
    }
}

/**
 * Vite plugin that strips environment-specific loader exports from
 * component modules.
 *
 * Following the React Router convention:
 * - `export const loader` → server-only, stripped from the **client** bundle
 * - `export const clientLoader` → client-only, stripped from the **server** bundle
 *
 * This ensures that server-only code (e.g. API calls, database access) is
 * never included in the client bundle, and vice versa.
 *
 * The plugin only processes files that:
 * 1. Are under the configured `componentPath` directory
 * 2. Contain a `@Component` decorator (i.e. are Page Designer components)
 * 3. Are not test or story files
 */
export function componentLoadersPlugin(config: ComponentLoadersPluginConfig = {}): Plugin {
    const { componentPath = 'src/components' } = config;

    let isTestMode = false;

    return {
        name: 'storefrontnext:component-loaders',
        // Run before other transforms so stripped exports and their imports are
        // never seen by downstream plugins (TypeScript, React Refresh, etc.),
        // ensuring clean tree-shaking of server/client-only code.
        enforce: 'pre',

        configResolved(resolvedConfig) {
            isTestMode = resolvedConfig.mode === 'test';
        },

        transform(code, id) {
            // Do not strip exports during test runs — tests need the full module surface.
            if (isTestMode) {
                return null;
            }

            // Only process TS/TSX files in the component directory
            if (!id.includes(componentPath)) {
                return null;
            }
            if (!/\.[mc]?[jt]sx?$/.test(id)) {
                return null;
            }
            // Skip test and story files
            if (/\.(test|spec|stories)\.[jt]sx?$/.test(id)) {
                return null;
            }

            // Access the Vite environment name (available in Vite 6+)
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            const environmentName: string | undefined = (this as any).environment?.name;
            if (!environmentName) {
                return null;
            }

            const exportsToStrip = getExportsToStrip(environmentName);
            if (exportsToStrip.length === 0) {
                return null;
            }

            // Quick string check before parsing the full AST
            if (!hasExportCandidate(code, exportsToStrip)) {
                return null;
            }

            // Parse once and reuse for both the `@Component` decorator check and stripping
            const ast = parse(code, {
                sourceType: 'module',
                plugins: ['typescript', 'jsx', 'decorators'],
            });

            // Only process Page Designer components (classes with `@Component` decorator)
            if (!hasComponentDecorator(ast)) {
                return null;
            }

            const transformed = stripExports(code, exportsToStrip, ast);
            if (!transformed) {
                return null;
            }

            return {
                code: transformed,
                map: null,
            };
        },
    };
}
