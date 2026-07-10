#!/usr/bin/env node
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
import { readdir, readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { join, extname, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { Project, Node, type SourceFile, type PropertyDeclaration, type Decorator, type Expression } from 'ts-morph';
import { filePathToRoute } from './react-router-config.js';
import { logger } from '../logger';

// Re-export `filePathToRoute`
export { filePathToRoute };

const SKIP_DIRECTORIES = ['build', 'dist', 'node_modules', '.git', '.next', 'coverage'];

const DEFAULT_COMPONENT_GROUP = 'storefrontnext_base';
const ARCH_TYPE_HEADLESS = 'headless';

type AttributeType =
    | 'string'
    | 'text'
    | 'markup'
    | 'integer'
    | 'boolean'
    | 'product'
    | 'category'
    | 'file'
    | 'page'
    | 'image'
    | 'url'
    | 'enum'
    | 'custom'
    | 'cms_record';

const VALID_ATTRIBUTE_TYPES: readonly AttributeType[] = [
    'string',
    'text',
    'markup',
    'integer',
    'boolean',
    'product',
    'category',
    'file',
    'page',
    'image',
    'url',
    'enum',
    'custom',
    'cms_record',
] as const;

// Type mapping for TypeScript types to B2C Commerce attribute types
// Based on official schema: https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/content/attributedefinition.json
const TYPE_MAPPING: Record<string, string> = {
    String: 'string',
    string: 'string',
    Number: 'integer',
    number: 'integer',
    Boolean: 'boolean',
    boolean: 'boolean',
    Date: 'string', // B2C Commerce doesn't have a native date type, use string
    URL: 'url',
    CMSRecord: 'cms_record',
};

// Resolve attribute type in order: decorator type -> ts-morph type inference -> fallback to string
function resolveAttributeType(decoratorType?: string, tsMorphType?: string, fieldName?: string): string {
    // 1) If the type is set on the decorator, use that (with validation)
    if (decoratorType) {
        if (!VALID_ATTRIBUTE_TYPES.includes(decoratorType as AttributeType)) {
            logger.error(
                `Invalid attribute type '${decoratorType}' for field '${fieldName || 'unknown'}'. Valid types are: ${VALID_ATTRIBUTE_TYPES.join(', ')}`
            );
            process.exit(1);
        }
        return decoratorType;
    }

    // 2) Use the type from ts-morph type inference
    if (tsMorphType && TYPE_MAPPING[tsMorphType]) {
        return TYPE_MAPPING[tsMorphType];
    }

    // 3) Fall back to string
    return 'string';
}

// Convert field name to human-readable name
function toHumanReadableName(fieldName: string): string {
    return fieldName
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
        .trim();
}

// Convert name to camelCase filename (handles spaces and hyphens, preserves existing camelCase)
function toCamelCaseFileName(name: string): string {
    // If the name is already camelCase (no spaces or hyphens), return as-is
    if (!/[\s-]/.test(name)) {
        return name;
    }

    return name
        .split(/[\s-]+/) // Split by whitespace and hyphens
        .map((word, index) => {
            if (index === 0) {
                return word.toLowerCase(); // First word is all lowercase
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); // Subsequent words are capitalized
        })
        .join(''); // Join without spaces or hyphens
}

function getTypeFromTsMorph(property: PropertyDeclaration, _sourceFile: SourceFile): string {
    try {
        const typeNode = property.getTypeNode();
        if (typeNode) {
            const typeText = typeNode.getText();
            // Extract the base type name from complex types
            const baseType = typeText.split('|')[0].split('&')[0].trim();
            return baseType;
        }
    } catch {
        // If type extraction fails, return string
    }

    return 'string';
}

/**
 * Resolve a variable's initializer expression from the same source file,
 * unwrapping `as const` type assertions.
 */
function resolveVariableInitializer(sourceFile: SourceFile, name: string): Expression | undefined {
    const varDecl = sourceFile.getVariableDeclaration(name);
    if (!varDecl) return undefined;
    let initializer = varDecl.getInitializer();
    if (initializer && Node.isAsExpression(initializer)) {
        initializer = initializer.getExpression();
    }
    return initializer;
}

/**
 * Check whether an AST node is a type that `parseExpression` can resolve to a
 * concrete JS value (as opposed to falling through to `getText()`).
 */
function isResolvableLiteral(node: Expression): boolean {
    return (
        Node.isStringLiteral(node) ||
        Node.isNumericLiteral(node) ||
        Node.isTrueLiteral(node) ||
        Node.isFalseLiteral(node) ||
        Node.isObjectLiteralExpression(node) ||
        Node.isArrayLiteralExpression(node)
    );
}

class UnresolvedConstantReferenceError extends Error {
    constructor(reference: string) {
        super(
            `Cannot resolve constant reference '${reference}'. ` +
                `Ensure the variable is declared in the same file as a literal value.`
        );
        this.name = 'UnresolvedConstantReferenceError';
    }
}

// Helper function to parse any TypeScript expression into a JavaScript value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseExpression(expression: any): unknown {
    if (Node.isStringLiteral(expression)) {
        return expression.getLiteralValue();
    } else if (Node.isNumericLiteral(expression)) {
        return expression.getLiteralValue();
    } else if (Node.isTrueLiteral(expression)) {
        return true;
    } else if (Node.isFalseLiteral(expression)) {
        return false;
    } else if (Node.isObjectLiteralExpression(expression)) {
        return parseNestedObject(expression);
    } else if (Node.isArrayLiteralExpression(expression)) {
        return parseArrayLiteral(expression);
    } else if (Node.isPropertyAccessExpression(expression)) {
        const obj = expression.getExpression();
        const propName = expression.getName();
        if (Node.isIdentifier(obj)) {
            const resolved = resolveVariableInitializer(expression.getSourceFile(), obj.getText());
            if (resolved && Node.isObjectLiteralExpression(resolved)) {
                const prop = resolved.getProperty(propName);
                if (prop && Node.isPropertyAssignment(prop)) {
                    const propInit = prop.getInitializer();
                    if (propInit) return parseExpression(propInit);
                }
            }
            throw new UnresolvedConstantReferenceError(expression.getText());
        }
        return expression.getText();
    } else if (Node.isIdentifier(expression)) {
        const resolved = resolveVariableInitializer(expression.getSourceFile(), expression.getText());
        if (resolved && isResolvableLiteral(resolved)) {
            return parseExpression(resolved);
        }
        return expression.getText();
    } else {
        return expression.getText();
    }
}

// Helper function to parse deeply nested object literals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNestedObject(objectLiteral: any): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    try {
        const properties = objectLiteral.getProperties();

        for (const property of properties) {
            if (Node.isPropertyAssignment(property)) {
                const name = property.getName();
                const initializer = property.getInitializer();

                if (initializer) {
                    result[name] = parseExpression(initializer);
                }
            }
        }
    } catch (error) {
        logger.warn(`Could not parse nested object: ${(error as Error).message}`);
        return result; // Return the result even if there was an error
    }

    return result;
}

// Helper function to parse array literals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseArrayLiteral(arrayLiteral: any): unknown[] {
    const result: unknown[] = [];

    try {
        const elements = arrayLiteral.getElements();

        for (const element of elements) {
            result.push(parseExpression(element));
        }
    } catch (error) {
        logger.warn(`Could not parse array literal: ${(error as Error).message}`);
    }

    return result;
}

// Parse decorator arguments using ts-morph
function parseDecoratorArgs(decorator: Decorator): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    try {
        const args = decorator.getArguments();

        if (args.length === 0) {
            return result;
        }

        // Handle the first argument
        const firstArg = args[0];

        if (Node.isObjectLiteralExpression(firstArg)) {
            // First argument is an object literal - parse all its properties
            const properties = firstArg.getProperties();

            for (const property of properties) {
                if (Node.isPropertyAssignment(property)) {
                    const name = property.getName();
                    const initializer = property.getInitializer();

                    if (initializer) {
                        result[name] = parseExpression(initializer);
                    }
                }
            }
        } else if (Node.isStringLiteral(firstArg)) {
            // First argument is a string literal - use it as the id
            result.id = parseExpression(firstArg);

            // Check if there's a second argument (options object)
            if (args.length > 1) {
                const secondArg = args[1];
                if (Node.isObjectLiteralExpression(secondArg)) {
                    const properties = secondArg.getProperties();

                    for (const property of properties) {
                        if (Node.isPropertyAssignment(property)) {
                            const name = property.getName();
                            const initializer = property.getInitializer();

                            if (initializer) {
                                result[name] = parseExpression(initializer);
                            }
                        }
                    }
                }
            }
        }

        return result;
    } catch (error) {
        if (error instanceof UnresolvedConstantReferenceError) {
            throw error;
        }
        logger.warn(`Could not parse decorator arguments: ${(error as Error).message}`);
        return result;
    }
}

function extractAttributesFromSource(sourceFile: SourceFile, className: string): Record<string, unknown>[] {
    const attributes: Record<string, unknown>[] = [];

    try {
        // Find the class declaration
        const classDeclaration = sourceFile.getClass(className);
        if (!classDeclaration) {
            return attributes;
        }

        // Get all properties in the class
        const properties = classDeclaration.getProperties();

        for (const property of properties) {
            // Check if the property has an @AttributeDefinition decorator
            const attributeDecorator = property.getDecorator('AttributeDefinition');
            if (!attributeDecorator) {
                continue;
            }

            const fieldName = property.getName();
            const config = parseDecoratorArgs(attributeDecorator);

            const isRequired = !property.hasQuestionToken();

            const inferredType = (config.type as string) || getTypeFromTsMorph(property, sourceFile);

            const attribute: Record<string, unknown> = {
                id: config.id || fieldName,
                name: config.name || toHumanReadableName(fieldName),
                type: resolveAttributeType(config.type as string, inferredType, fieldName),
                required: config.required !== undefined ? config.required : isRequired,
                description: config.description || `Field: ${fieldName}`,
            };

            if (config.values) {
                attribute.values = config.values;
            }

            if (config.defaultValue !== undefined) {
                attribute.default_value = config.defaultValue;
            }

            if (config.editorDefinition !== undefined) {
                attribute.editor_definition = config.editorDefinition;
            }

            attributes.push(attribute);
        }
    } catch (error) {
        if (error instanceof UnresolvedConstantReferenceError) {
            throw error;
        }
        logger.warn(`Could not extract attributes from class ${className}: ${(error as Error).message}`);
    }

    return attributes;
}

function normalizeComponentTypeId(typeId: string, defaultGroup: string): string {
    return typeId.includes('.') ? typeId : `${defaultGroup}.${typeId}`;
}

function extractRegionDefinitionsFromSource(
    sourceFile: SourceFile,
    className: string,
    defaultComponentGroup = DEFAULT_COMPONENT_GROUP
): Record<string, unknown>[] {
    const regionDefinitions: Record<string, unknown>[] = [];

    try {
        // Find the class declaration
        const classDeclaration = sourceFile.getClass(className);
        if (!classDeclaration) {
            return regionDefinitions;
        }

        // Check for class-level @RegionDefinition decorator
        const classRegionDecorator = classDeclaration.getDecorator('RegionDefinition');
        if (classRegionDecorator) {
            const args = classRegionDecorator.getArguments();
            if (args.length > 0) {
                const firstArg = args[0];

                // Handle array literal argument (most common case)
                if (Node.isArrayLiteralExpression(firstArg)) {
                    const elements = firstArg.getElements();
                    for (const element of elements) {
                        if (Node.isObjectLiteralExpression(element)) {
                            const regionConfig = parseDecoratorArgs({
                                getArguments: () => [element],
                            } as unknown as Decorator);

                            const regionDefinition: Record<string, unknown> = {
                                id: regionConfig.id || 'region',
                                name: regionConfig.name || 'Region',
                            };

                            // Add optional properties if they exist in the decorator
                            if (regionConfig.description !== undefined) {
                                regionDefinition.description = regionConfig.description;
                            }

                            if (regionConfig.componentTypes) {
                                regionDefinition.component_types = regionConfig.componentTypes;
                            }

                            if (Array.isArray(regionConfig.componentTypeInclusions)) {
                                regionDefinition.component_type_inclusions = regionConfig.componentTypeInclusions.map(
                                    (incl) => ({
                                        type_id: normalizeComponentTypeId(String(incl), defaultComponentGroup),
                                    })
                                );
                            }

                            if (Array.isArray(regionConfig.componentTypeExclusions)) {
                                regionDefinition.component_type_exclusions = regionConfig.componentTypeExclusions.map(
                                    (excl) => ({
                                        type_id: normalizeComponentTypeId(String(excl), defaultComponentGroup),
                                    })
                                );
                            }

                            if (regionConfig.maxComponents !== undefined) {
                                regionDefinition.max_components = regionConfig.maxComponents;
                            }

                            if (regionConfig.minComponents !== undefined) {
                                regionDefinition.min_components = regionConfig.minComponents;
                            }

                            if (regionConfig.allowMultiple !== undefined) {
                                regionDefinition.allow_multiple = regionConfig.allowMultiple;
                            }

                            if (regionConfig.defaultComponentConstructors) {
                                regionDefinition.default_component_constructors =
                                    regionConfig.defaultComponentConstructors;
                            }

                            regionDefinitions.push(regionDefinition);
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.warn(
            `Warning: Could not extract region definitions from class ${className}: ${(error as Error).message}`
        );
    }

    return regionDefinitions;
}

async function processComponentFile(filePath: string, _projectRoot: string): Promise<unknown[]> {
    try {
        const content = await readFile(filePath, 'utf-8');
        const components: unknown[] = [];

        // Check if file contains @Component decorator
        if (!content.includes('@Component')) {
            return components;
        }

        // Convert file path to module path (currently unused but may be needed in future)
        // const relativePath = relative(join(projectRoot, 'src'), filePath);
        // const modulePath = relativePath.replace(/\.tsx?$/, '').replace(/\\/g, '/');

        try {
            // Create a ts-morph project and add the source file
            const project = new Project({
                useInMemoryFileSystem: true,
                skipAddingFilesFromTsConfig: true,
            });

            const sourceFile = project.createSourceFile(filePath, content);

            const classes = sourceFile.getClasses();

            for (const classDeclaration of classes) {
                const componentDecorator = classDeclaration.getDecorator('Component');
                if (!componentDecorator) {
                    continue;
                }

                const className = classDeclaration.getName();
                if (!className) {
                    continue;
                }

                const componentConfig = parseDecoratorArgs(componentDecorator);
                const componentGroup = String(componentConfig.group || DEFAULT_COMPONENT_GROUP);

                const attributes = extractAttributesFromSource(sourceFile, className);
                const regionDefinitions = extractRegionDefinitionsFromSource(sourceFile, className, componentGroup);

                const componentMetadata: Record<string, unknown> = {
                    typeId: componentConfig.id || className.toLowerCase(),
                    name: componentConfig.name || toHumanReadableName(className),
                    group: componentGroup,
                    description: componentConfig.description || `Custom component: ${className}`,
                    regionDefinitions,
                    attributes,
                };

                if (typeof componentConfig.embedded === 'boolean') {
                    componentMetadata.embedded = componentConfig.embedded;
                }
                if (componentConfig.component_id !== undefined) {
                    componentMetadata.component_id = String(componentConfig.component_id);
                }

                components.push(componentMetadata);
            }
        } catch (error) {
            if (error instanceof UnresolvedConstantReferenceError) {
                throw error;
            }
            logger.warn(`Could not process file ${filePath}:`, (error as Error).message);
        }

        return components;
    } catch (error) {
        if (error instanceof UnresolvedConstantReferenceError) {
            throw error;
        }
        logger.warn(`Could not read file ${filePath}:`, (error as Error).message);
        return [];
    }
}

async function processPageTypeFile(filePath: string, projectRoot: string): Promise<unknown[]> {
    try {
        const content = await readFile(filePath, 'utf-8');
        const pageTypes: unknown[] = [];

        // Check if file contains @PageType decorator
        if (!content.includes('@PageType')) {
            return pageTypes;
        }

        try {
            // Create a ts-morph project and add the source file
            const project = new Project({
                useInMemoryFileSystem: true,
                skipAddingFilesFromTsConfig: true,
            });

            const sourceFile = project.createSourceFile(filePath, content);

            const classes = sourceFile.getClasses();

            for (const classDeclaration of classes) {
                const pageTypeDecorator = classDeclaration.getDecorator('PageType');
                if (!pageTypeDecorator) {
                    continue;
                }

                const className = classDeclaration.getName();
                if (!className) {
                    continue;
                }

                const pageTypeConfig = parseDecoratorArgs(pageTypeDecorator);

                const attributes = extractAttributesFromSource(sourceFile, className);
                const regionDefinitions = extractRegionDefinitionsFromSource(sourceFile, className);
                const route = filePathToRoute(filePath, projectRoot);

                const pageTypeMetadata = {
                    typeId: pageTypeConfig.id || className.toLowerCase(),
                    name: pageTypeConfig.name || toHumanReadableName(className),
                    description: pageTypeConfig.description || `Custom page type: ${className}`,
                    regionDefinitions,
                    supportedAspectTypes: pageTypeConfig.supportedAspectTypes || [],
                    attributes,
                    route,
                    // Only carry `preview` when the decorator declared it, so undeclared page types
                    // stay clean and the emitted JSON omits the field entirely.
                    ...(pageTypeConfig.preview !== undefined && { preview: pageTypeConfig.preview }),
                };

                pageTypes.push(pageTypeMetadata);
            }
        } catch (error) {
            logger.warn(`Could not process file ${filePath}:`, (error as Error).message);
        }

        return pageTypes;
    } catch (error) {
        logger.warn(`Could not read file ${filePath}:`, (error as Error).message);
        return [];
    }
}

async function processAspectFile(filePath: string, _projectRoot: string): Promise<unknown[]> {
    try {
        const content = await readFile(filePath, 'utf-8');
        const aspects: unknown[] = [];

        // Check if file is a JSON aspect file
        if (!filePath.endsWith('.json') || !content.trim().startsWith('{')) {
            return aspects;
        }

        // Check if file is in the aspects directory
        if (!filePath.includes('/aspects/') && !filePath.includes('\\aspects\\')) {
            return aspects;
        }

        try {
            // Parse the JSON content
            const aspectData = JSON.parse(content);

            // Extract filename without extension as the aspect ID
            const fileName = basename(filePath, '.json');

            // Validate that it looks like an aspect file
            if (!aspectData.name || !aspectData.attribute_definitions) {
                return aspects;
            }

            const aspectMetadata = {
                id: fileName,
                name: aspectData.name,
                description: aspectData.description || `Aspect type: ${aspectData.name}`,
                attributeDefinitions: aspectData.attribute_definitions || [],
                supportedObjectTypes: aspectData.supported_object_types || [],
            };

            aspects.push(aspectMetadata);
        } catch (parseError) {
            logger.warn(`Could not parse JSON in file ${filePath}:`, (parseError as Error).message);
        }

        return aspects;
    } catch (error) {
        logger.warn(`Could not read file ${filePath}:`, (error as Error).message);
        return [];
    }
}

async function generateComponentCartridge(
    component: Record<string, unknown>,
    outputDir: string,
    dryRun = false
): Promise<void> {
    const fileName = toCamelCaseFileName(component.typeId as string);
    const groupDir = join(outputDir, component.group as string);
    const outputPath = join(groupDir, `${fileName}.json`);

    if (!dryRun) {
        // Ensure the group directory exists
        try {
            await mkdir(groupDir, { recursive: true });
        } catch {
            // Directory might already exist, which is fine
        }

        const attributeDefinitionGroups = [
            {
                id: component.typeId,
                name: component.name,
                description: component.description,
                attribute_definitions: component.attributes,
            },
        ];

        const cartridgeData: Record<string, unknown> = {
            name: component.name,
            description: component.description,
            group: component.group,
            arch_type: ARCH_TYPE_HEADLESS,
            ...(typeof component.embedded === 'boolean' && { embedded: component.embedded }),
            component_id: component.component_id,
            region_definitions: component.regionDefinitions || [],
            attribute_definition_groups: attributeDefinitionGroups,
        };

        await writeFile(outputPath, JSON.stringify(cartridgeData, null, 2));
    }

    const prefix = dryRun ? '   - [DRY RUN]' : '   -';
    logger.debug(
        `${prefix} ${String(component.typeId)}: ${String(component.name)} (${String((component.attributes as unknown[]).length)} attributes) → ${fileName}.json`
    );
}

async function generatePageTypeCartridge(
    pageType: Record<string, unknown>,
    outputDir: string,
    dryRun = false
): Promise<void> {
    const fileName = toCamelCaseFileName(pageType.name as string);
    const outputPath = join(outputDir, `${fileName}.json`);

    if (!dryRun) {
        const cartridgeData: Record<string, unknown> = {
            name: pageType.name,
            description: pageType.description,
            arch_type: ARCH_TYPE_HEADLESS,
            region_definitions: pageType.regionDefinitions || [],
        };

        // Add attribute_definition_groups if there are attributes
        if (pageType.attributes && (pageType.attributes as unknown[]).length > 0) {
            const attributeDefinitionGroups = [
                {
                    id: pageType.typeId || fileName,
                    name: pageType.name,
                    description: pageType.description,
                    attribute_definitions: pageType.attributes,
                },
            ];
            cartridgeData.attribute_definition_groups = attributeDefinitionGroups;
        }

        // Add supported_aspect_types if specified
        if (pageType.supportedAspectTypes) {
            cartridgeData.supported_aspect_types = pageType.supportedAspectTypes;
        }

        if (pageType.route) {
            cartridgeData.route = pageType.route;
        }

        // Add preview only when the page type declared it (omitted otherwise to keep existing
        // page-type JSON byte-stable). Use the same presence check as processPageTypeFile so the
        // "declared" gate is identical on both sides.
        if (pageType.preview !== undefined) {
            cartridgeData.preview = pageType.preview;
        }

        await writeFile(outputPath, JSON.stringify(cartridgeData, null, 2));
    }

    const prefix = dryRun ? '   - [DRY RUN]' : '   -';
    logger.debug(
        `${prefix} ${String(pageType.name)}: ${String(pageType.description)} (${String((pageType.attributes as unknown[]).length)} attributes) → ${fileName}.json`
    );
}

async function generateAspectCartridge(
    aspect: Record<string, unknown>,
    outputDir: string,
    dryRun = false
): Promise<void> {
    const fileName = toCamelCaseFileName(aspect.id as string);
    const outputPath = join(outputDir, `${fileName}.json`);

    if (!dryRun) {
        const cartridgeData: Record<string, unknown> = {
            name: aspect.name,
            description: aspect.description,
            arch_type: ARCH_TYPE_HEADLESS,
            attribute_definitions: aspect.attributeDefinitions || [],
        };

        // Add supported_object_types if specified
        if (aspect.supportedObjectTypes) {
            cartridgeData.supported_object_types = aspect.supportedObjectTypes;
        }

        await writeFile(outputPath, JSON.stringify(cartridgeData, null, 2));
    }

    const prefix = dryRun ? '   - [DRY RUN]' : '   -';
    logger.debug(
        `${prefix} ${String(aspect.name)}: ${String(aspect.description)} (${String((aspect.attributeDefinitions as unknown[]).length)} attributes) → ${fileName}.json`
    );
}

/**
 * Options for generateMetadata function
 */
export interface GenerateMetadataOptions {
    /**
     * Optional array of specific file paths to process.
     * If provided, only these files will be processed and existing cartridge files will NOT be deleted.
     * If omitted, the entire src/ directory will be scanned and all existing cartridge files will be deleted first.
     */
    filePaths?: string[];

    /**
     * Whether to run ESLint with --fix on generated JSON files to format them according to project settings.
     * Defaults to true.
     */
    lintFix?: boolean;

    /**
     * If true, scans files and reports what would be generated without actually writing any files or deleting directories.
     * Defaults to false.
     */
    dryRun?: boolean;
}

/**
 * Result returned by generateMetadata function
 */
export interface GenerateMetadataResult {
    componentsGenerated: number;
    pageTypesGenerated: number;
    aspectsGenerated: number;
    totalFiles: number;
}

/**
 * Runs ESLint with --fix on the specified directory to format JSON files.
 * This ensures generated JSON files match the project's Prettier/ESLint configuration.
 */
function lintGeneratedFiles(metadataDir: string, projectRoot: string): void {
    try {
        logger.debug('🔧 Running ESLint --fix on generated JSON files...');

        // Run ESLint from the project root directory so it picks up the correct config
        // Use --no-error-on-unmatched-pattern to handle cases where no JSON files exist yet
        const command = `npx eslint "${metadataDir}/**/*.json" --fix --no-error-on-unmatched-pattern`;

        execSync(command, {
            cwd: projectRoot,
            stdio: 'pipe', // Suppress output unless there's an error
            encoding: 'utf-8',
        });

        logger.debug('✅ JSON files formatted successfully');
    } catch (error) {
        // ESLint returns non-zero exit code even when --fix resolves all issues
        // We only warn if there are actual unfixable issues
        const execError = error as { status?: number; stderr?: string; stdout?: string };

        // Exit code 1 usually means there were linting issues (some may have been fixed)
        // Exit code 2 means configuration error or other fatal error
        if (execError.status === 2) {
            const errMsg = execError.stderr || execError.stdout || 'Unknown error';
            logger.warn(`⚠️  Could not run ESLint --fix: ${errMsg}`);
        } else if (execError.stderr && execError.stderr.includes('error')) {
            logger.warn(`⚠️  Some linting issues could not be auto-fixed. Run ESLint manually to review.`);
        } else {
            // Exit code 1 with no errors in stderr usually means all issues were fixed
            logger.debug('✅ JSON files formatted successfully');
        }
    }
}

// Main function
export async function generateMetadata(
    projectDirectory: string,
    metadataDirectory: string,
    options?: GenerateMetadataOptions
): Promise<GenerateMetadataResult> {
    try {
        const filePaths = options?.filePaths;
        const isIncrementalMode = filePaths && filePaths.length > 0;
        const dryRun = options?.dryRun || false;

        if (dryRun) {
            logger.debug('🔍 [DRY RUN] Scanning for decorated components and page types...');
        } else if (isIncrementalMode) {
            logger.debug(`🔍 Generating metadata for ${filePaths.length} specified file(s)...`);
        } else {
            logger.debug('🔍 Generating metadata for decorated components and page types...');
        }

        const projectRoot = resolve(projectDirectory);
        const srcDir = join(projectRoot, 'src');
        const metadataDir = resolve(metadataDirectory);
        const componentsOutputDir = join(metadataDir, 'components');
        const pagesOutputDir = join(metadataDir, 'pages');
        const aspectsOutputDir = join(metadataDir, 'aspects');

        // Skip directory operations in dry run mode
        if (!dryRun) {
            // Only delete existing directories in full scan mode (not incremental)
            if (!isIncrementalMode) {
                logger.debug('🗑️  Cleaning existing output directories...');
                for (const outputDir of [componentsOutputDir, pagesOutputDir, aspectsOutputDir]) {
                    try {
                        await rm(outputDir, { recursive: true, force: true });
                        logger.debug(`   - Deleted: ${outputDir}`);
                    } catch {
                        // Directory might not exist, which is fine
                        logger.debug(`   - Directory not found (skipping): ${outputDir}`);
                    }
                }
            } else {
                logger.debug('📝 Incremental mode: existing cartridge files will be preserved/overwritten');
            }

            // Create output directories if they don't exist
            logger.debug('Creating output directories...');
            for (const outputDir of [componentsOutputDir, pagesOutputDir, aspectsOutputDir]) {
                try {
                    await mkdir(outputDir, { recursive: true });
                } catch (error) {
                    try {
                        await access(outputDir);
                        // Directory exists, that's fine
                    } catch {
                        const err = error as Error;
                        logger.error(`❌ Failed to create output directory ${outputDir}: ${err.message}`);
                        process.exit(1);
                        throw err;
                    }
                }
            }
        } else if (isIncrementalMode) {
            logger.debug(`📝 [DRY RUN] Would process ${filePaths.length} specific file(s)`);
        } else {
            logger.debug('📝 [DRY RUN] Would clean and regenerate all metadata files');
        }

        let files: string[] = [];

        if (isIncrementalMode && filePaths) {
            // Use the specified file paths (resolve them relative to project root)
            files = filePaths.map((fp) => resolve(projectRoot, fp));
            logger.debug(`📂 Processing ${files.length} specified file(s)...`);
        } else {
            // Full scan mode: scan entire src directory
            const scanDirectory = async (dir: string): Promise<void> => {
                const entries = await readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);

                    if (entry.isDirectory()) {
                        if (!SKIP_DIRECTORIES.includes(entry.name)) {
                            await scanDirectory(fullPath);
                        }
                    } else if (
                        entry.isFile() &&
                        (extname(entry.name) === '.ts' ||
                            extname(entry.name) === '.tsx' ||
                            extname(entry.name) === '.json')
                    ) {
                        files.push(fullPath);
                    }
                }
            };

            await scanDirectory(srcDir);

            const configMetadataDir = join(projectRoot, 'config-metadata');
            try {
                await access(configMetadataDir);
                await scanDirectory(configMetadataDir);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    logger.debug(`   - Directory not found (skipping): ${configMetadataDir}`);
                } else {
                    logger.warn(`   - Unable to access ${configMetadataDir}:`, (error as Error).message);
                }
            }
        }

        // Process each file for both components and page types
        const allComponents: unknown[] = [];
        const allPageTypes: unknown[] = [];
        const allAspects: unknown[] = [];

        for (const file of files) {
            const components = await processComponentFile(file, projectRoot);
            allComponents.push(...components);

            const pageTypes = await processPageTypeFile(file, projectRoot);
            allPageTypes.push(...pageTypes);

            const aspects = await processAspectFile(file, projectRoot);
            allAspects.push(...aspects);
        }

        if (allComponents.length === 0 && allPageTypes.length === 0 && allAspects.length === 0) {
            logger.info('⚠️  No decorated components, page types, or aspect files found.');
            return {
                componentsGenerated: 0,
                pageTypesGenerated: 0,
                aspectsGenerated: 0,
                totalFiles: 0,
            };
        }

        // Generate component cartridge files
        if (allComponents.length > 0) {
            logger.debug(`✅ Found ${allComponents.length} decorated component(s)`);
            for (const component of allComponents) {
                await generateComponentCartridge(component as Record<string, unknown>, componentsOutputDir, dryRun);
            }
            if (dryRun) {
                logger.info(`[DRY RUN] Would generate ${allComponents.length} component metadata file(s)`);
            } else {
                logger.info(`Generated ${allComponents.length} component metadata file(s)`);
            }
        }

        // Generate page type cartridge files
        if (allPageTypes.length > 0) {
            logger.debug(`✅ Found ${allPageTypes.length} decorated page type(s)`);
            for (const pageType of allPageTypes) {
                await generatePageTypeCartridge(pageType as Record<string, unknown>, pagesOutputDir, dryRun);
            }
            if (dryRun) {
                logger.info(`[DRY RUN] Would generate ${allPageTypes.length} page type metadata file(s)`);
            } else {
                logger.info(`Generated ${allPageTypes.length} page type metadata file(s)`);
            }
        }

        if (allAspects.length > 0) {
            logger.debug(`✅ Found ${allAspects.length} decorated aspect(s)`);
            for (const aspect of allAspects) {
                await generateAspectCartridge(aspect as Record<string, unknown>, aspectsOutputDir, dryRun);
            }
            if (dryRun) {
                logger.info(`[DRY RUN] Would generate ${allAspects.length} aspect metadata file(s)`);
            } else {
                logger.info(`Generated ${allAspects.length} aspect metadata file(s)`);
            }
        }

        // Run ESLint --fix to format generated JSON files according to project settings
        const shouldLintFix = options?.lintFix !== false; // Default to true
        if (
            !dryRun &&
            shouldLintFix &&
            (allComponents.length > 0 || allPageTypes.length > 0 || allAspects.length > 0)
        ) {
            lintGeneratedFiles(metadataDir, projectRoot);
        }

        // Return statistics
        return {
            componentsGenerated: allComponents.length,
            pageTypesGenerated: allPageTypes.length,
            aspectsGenerated: allAspects.length,
            totalFiles: allComponents.length + allPageTypes.length + allAspects.length,
        };
    } catch (error) {
        const err = error as Error;
        logger.error('❌ Error:', err.message);
        process.exit(1);
        throw err;
    }
}
