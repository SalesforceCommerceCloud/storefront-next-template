import { t as logger } from "./logger.js";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { Node, Project } from "ts-morph";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { npmRunPathEnv } from "npm-run-path";

//#region src/cartridge-services/react-router-config.ts
let isCliAvailable = null;
function checkReactRouterCli(projectDirectory) {
	if (isCliAvailable !== null) return isCliAvailable;
	try {
		execSync("react-router --version", {
			cwd: projectDirectory,
			env: npmRunPathEnv(),
			stdio: "pipe"
		});
		isCliAvailable = true;
	} catch {
		isCliAvailable = false;
	}
	return isCliAvailable;
}
/**
* Get the fully resolved routes from React Router by invoking its CLI.
* This ensures we get the exact same route resolution as React Router uses internally,
* including all presets, file-system routes, and custom route configurations.
* @param projectDirectory - The project root directory
* @returns Array of resolved route config entries
* @example
* const routes = getReactRouterRoutes('/path/to/project');
* // Returns the same structure as `react-router routes --json`
*/
function getReactRouterRoutes(projectDirectory) {
	if (!checkReactRouterCli(projectDirectory)) throw new Error("React Router CLI is not available. Please make sure @react-router/dev is installed and accessible.");
	const tempFile = join(tmpdir(), `react-router-routes-${randomUUID()}.json`);
	try {
		execSync(`react-router routes --json > "${tempFile}"`, {
			cwd: projectDirectory,
			env: npmRunPathEnv(),
			encoding: "utf-8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
		const output = readFileSync(tempFile, "utf-8");
		return JSON.parse(output);
	} catch (error) {
		throw new Error(`Failed to get routes from React Router CLI: ${error.message}`);
	} finally {
		try {
			if (existsSync(tempFile)) unlinkSync(tempFile);
		} catch {}
	}
}
/**
* Convert a file path to its corresponding route path using React Router's CLI.
* This ensures we get the exact same route resolution as React Router uses internally.
* @param filePath - Absolute path to the route file
* @param projectRoot - The project root directory
* @returns The route path (e.g., '/cart', '/product/:productId')
* @example
* const route = filePathToRoute('/path/to/project/src/routes/_app.cart.tsx', '/path/to/project');
* // Returns: '/cart'
*/
function filePathToRoute(filePath, projectRoot) {
	const filePathPosix = filePath.replace(/\\/g, "/");
	const canonicalRoutes = flattenRoutes(getReactRouterRoutes(projectRoot)).filter((route) => !route.id.endsWith("--root-duplicate"));
	for (const route of canonicalRoutes) {
		const routeFilePosix = route.file.replace(/\\/g, "/");
		const routeFileNormalized = routeFilePosix.replace(/^\.\//, "");
		if (filePathPosix.endsWith(routeFilePosix) || filePathPosix.endsWith(`/${routeFilePosix}`) || filePathPosix.endsWith(routeFileNormalized) || filePathPosix.endsWith(`/${routeFileNormalized}`)) return route.path;
	}
	logger.warn(`Could not find route for file: ${filePath}`);
	return "/unknown";
}
/**
* Flatten a nested route tree into a flat array with computed paths.
* Each route will have its full path computed from parent paths.
* @param routes - The nested route config entries
* @param parentPath - The parent path prefix (used internally for recursion)
* @returns Flat array of routes with their full paths
*/
function flattenRoutes(routes, parentPath = "") {
	const result = [];
	for (const route of routes) {
		let fullPath;
		if (route.index) fullPath = parentPath || "/";
		else if (route.path) {
			const pathSegment = route.path.startsWith("/") ? route.path : `/${route.path}`;
			fullPath = parentPath ? `${parentPath}${pathSegment}`.replace(/\/+/g, "/") : pathSegment;
		} else fullPath = parentPath || "/";
		if (route.id) result.push({
			id: route.id,
			path: fullPath,
			file: route.file,
			index: route.index
		});
		if (route.children && route.children.length > 0) {
			const childPath = route.path ? fullPath : parentPath;
			result.push(...flattenRoutes(route.children, childPath));
		}
	}
	return result;
}

//#endregion
//#region src/cartridge-services/generate-cartridge.ts
const SKIP_DIRECTORIES = [
	"build",
	"dist",
	"node_modules",
	".git",
	".next",
	"coverage"
];
const DEFAULT_COMPONENT_GROUP = "storefrontnext_base";
const ARCH_TYPE_HEADLESS = "headless";
const VALID_ATTRIBUTE_TYPES = [
	"string",
	"text",
	"markup",
	"integer",
	"boolean",
	"product",
	"category",
	"file",
	"page",
	"image",
	"url",
	"enum",
	"custom",
	"cms_record"
];
const TYPE_MAPPING = {
	String: "string",
	string: "string",
	Number: "integer",
	number: "integer",
	Boolean: "boolean",
	boolean: "boolean",
	Date: "string",
	URL: "url",
	CMSRecord: "cms_record"
};
function resolveAttributeType(decoratorType, tsMorphType, fieldName) {
	if (decoratorType) {
		if (!VALID_ATTRIBUTE_TYPES.includes(decoratorType)) {
			logger.error(`Invalid attribute type '${decoratorType}' for field '${fieldName || "unknown"}'. Valid types are: ${VALID_ATTRIBUTE_TYPES.join(", ")}`);
			process.exit(1);
		}
		return decoratorType;
	}
	if (tsMorphType && TYPE_MAPPING[tsMorphType]) return TYPE_MAPPING[tsMorphType];
	return "string";
}
function toHumanReadableName(fieldName) {
	return fieldName.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).trim();
}
function toCamelCaseFileName(name) {
	if (!/[\s-]/.test(name)) return name;
	return name.split(/[\s-]+/).map((word, index) => {
		if (index === 0) return word.toLowerCase();
		return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
	}).join("");
}
function getTypeFromTsMorph(property, _sourceFile) {
	try {
		const typeNode = property.getTypeNode();
		if (typeNode) return typeNode.getText().split("|")[0].split("&")[0].trim();
	} catch {}
	return "string";
}
/**
* Resolve a variable's initializer expression from the same source file,
* unwrapping `as const` type assertions.
*/
function resolveVariableInitializer(sourceFile, name) {
	const varDecl = sourceFile.getVariableDeclaration(name);
	if (!varDecl) return void 0;
	let initializer = varDecl.getInitializer();
	if (initializer && Node.isAsExpression(initializer)) initializer = initializer.getExpression();
	return initializer;
}
/**
* Check whether an AST node is a type that `parseExpression` can resolve to a
* concrete JS value (as opposed to falling through to `getText()`).
*/
function isResolvableLiteral(node) {
	return Node.isStringLiteral(node) || Node.isNumericLiteral(node) || Node.isTrueLiteral(node) || Node.isFalseLiteral(node) || Node.isObjectLiteralExpression(node) || Node.isArrayLiteralExpression(node);
}
var UnresolvedConstantReferenceError = class extends Error {
	constructor(reference) {
		super(`Cannot resolve constant reference '${reference}'. Ensure the variable is declared in the same file as a literal value.`);
		this.name = "UnresolvedConstantReferenceError";
	}
};
function parseExpression(expression) {
	if (Node.isStringLiteral(expression)) return expression.getLiteralValue();
	else if (Node.isNumericLiteral(expression)) return expression.getLiteralValue();
	else if (Node.isTrueLiteral(expression)) return true;
	else if (Node.isFalseLiteral(expression)) return false;
	else if (Node.isObjectLiteralExpression(expression)) return parseNestedObject(expression);
	else if (Node.isArrayLiteralExpression(expression)) return parseArrayLiteral(expression);
	else if (Node.isPropertyAccessExpression(expression)) {
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
		if (resolved && isResolvableLiteral(resolved)) return parseExpression(resolved);
		return expression.getText();
	} else return expression.getText();
}
function parseNestedObject(objectLiteral) {
	const result = {};
	try {
		const properties = objectLiteral.getProperties();
		for (const property of properties) if (Node.isPropertyAssignment(property)) {
			const name = property.getName();
			const initializer = property.getInitializer();
			if (initializer) result[name] = parseExpression(initializer);
		}
	} catch (error) {
		logger.warn(`Could not parse nested object: ${error.message}`);
		return result;
	}
	return result;
}
function parseArrayLiteral(arrayLiteral) {
	const result = [];
	try {
		const elements = arrayLiteral.getElements();
		for (const element of elements) result.push(parseExpression(element));
	} catch (error) {
		logger.warn(`Could not parse array literal: ${error.message}`);
	}
	return result;
}
function parseDecoratorArgs(decorator) {
	const result = {};
	try {
		const args = decorator.getArguments();
		if (args.length === 0) return result;
		const firstArg = args[0];
		if (Node.isObjectLiteralExpression(firstArg)) {
			const properties = firstArg.getProperties();
			for (const property of properties) if (Node.isPropertyAssignment(property)) {
				const name = property.getName();
				const initializer = property.getInitializer();
				if (initializer) result[name] = parseExpression(initializer);
			}
		} else if (Node.isStringLiteral(firstArg)) {
			result.id = parseExpression(firstArg);
			if (args.length > 1) {
				const secondArg = args[1];
				if (Node.isObjectLiteralExpression(secondArg)) {
					const properties = secondArg.getProperties();
					for (const property of properties) if (Node.isPropertyAssignment(property)) {
						const name = property.getName();
						const initializer = property.getInitializer();
						if (initializer) result[name] = parseExpression(initializer);
					}
				}
			}
		}
		return result;
	} catch (error) {
		if (error instanceof UnresolvedConstantReferenceError) throw error;
		logger.warn(`Could not parse decorator arguments: ${error.message}`);
		return result;
	}
}
function extractAttributesFromSource(sourceFile, className) {
	const attributes = [];
	try {
		const classDeclaration = sourceFile.getClass(className);
		if (!classDeclaration) return attributes;
		const properties = classDeclaration.getProperties();
		for (const property of properties) {
			const attributeDecorator = property.getDecorator("AttributeDefinition");
			if (!attributeDecorator) continue;
			const fieldName = property.getName();
			const config = parseDecoratorArgs(attributeDecorator);
			const isRequired = !property.hasQuestionToken();
			const inferredType = config.type || getTypeFromTsMorph(property, sourceFile);
			const attribute = {
				id: config.id || fieldName,
				name: config.name || toHumanReadableName(fieldName),
				type: resolveAttributeType(config.type, inferredType, fieldName),
				required: config.required !== void 0 ? config.required : isRequired,
				description: config.description || `Field: ${fieldName}`
			};
			if (config.values) attribute.values = config.values;
			if (config.defaultValue !== void 0) attribute.default_value = config.defaultValue;
			if (config.editorDefinition !== void 0) attribute.editor_definition = config.editorDefinition;
			attributes.push(attribute);
		}
	} catch (error) {
		if (error instanceof UnresolvedConstantReferenceError) throw error;
		logger.warn(`Could not extract attributes from class ${className}: ${error.message}`);
	}
	return attributes;
}
function normalizeComponentTypeId(typeId, defaultGroup) {
	return typeId.includes(".") ? typeId : `${defaultGroup}.${typeId}`;
}
function extractRegionDefinitionsFromSource(sourceFile, className, defaultComponentGroup = DEFAULT_COMPONENT_GROUP) {
	const regionDefinitions = [];
	try {
		const classDeclaration = sourceFile.getClass(className);
		if (!classDeclaration) return regionDefinitions;
		const classRegionDecorator = classDeclaration.getDecorator("RegionDefinition");
		if (classRegionDecorator) {
			const args = classRegionDecorator.getArguments();
			if (args.length > 0) {
				const firstArg = args[0];
				if (Node.isArrayLiteralExpression(firstArg)) {
					const elements = firstArg.getElements();
					for (const element of elements) if (Node.isObjectLiteralExpression(element)) {
						const regionConfig = parseDecoratorArgs({ getArguments: () => [element] });
						const regionDefinition = {
							id: regionConfig.id || "region",
							name: regionConfig.name || "Region"
						};
						if (regionConfig.componentTypes) regionDefinition.component_types = regionConfig.componentTypes;
						if (Array.isArray(regionConfig.componentTypeInclusions)) regionDefinition.component_type_inclusions = regionConfig.componentTypeInclusions.map((incl) => ({ type_id: normalizeComponentTypeId(String(incl), defaultComponentGroup) }));
						if (Array.isArray(regionConfig.componentTypeExclusions)) regionDefinition.component_type_exclusions = regionConfig.componentTypeExclusions.map((excl) => ({ type_id: normalizeComponentTypeId(String(excl), defaultComponentGroup) }));
						if (regionConfig.maxComponents !== void 0) regionDefinition.max_components = regionConfig.maxComponents;
						if (regionConfig.minComponents !== void 0) regionDefinition.min_components = regionConfig.minComponents;
						if (regionConfig.allowMultiple !== void 0) regionDefinition.allow_multiple = regionConfig.allowMultiple;
						if (regionConfig.defaultComponentConstructors) regionDefinition.default_component_constructors = regionConfig.defaultComponentConstructors;
						regionDefinitions.push(regionDefinition);
					}
				}
			}
		}
	} catch (error) {
		logger.warn(`Warning: Could not extract region definitions from class ${className}: ${error.message}`);
	}
	return regionDefinitions;
}
async function processComponentFile(filePath, _projectRoot) {
	try {
		const content = await readFile(filePath, "utf-8");
		const components = [];
		if (!content.includes("@Component")) return components;
		try {
			const sourceFile = new Project({
				useInMemoryFileSystem: true,
				skipAddingFilesFromTsConfig: true
			}).createSourceFile(filePath, content);
			const classes = sourceFile.getClasses();
			for (const classDeclaration of classes) {
				const componentDecorator = classDeclaration.getDecorator("Component");
				if (!componentDecorator) continue;
				const className = classDeclaration.getName();
				if (!className) continue;
				const componentConfig = parseDecoratorArgs(componentDecorator);
				const componentGroup = String(componentConfig.group || DEFAULT_COMPONENT_GROUP);
				const attributes = extractAttributesFromSource(sourceFile, className);
				const regionDefinitions = extractRegionDefinitionsFromSource(sourceFile, className, componentGroup);
				const componentMetadata = {
					typeId: componentConfig.id || className.toLowerCase(),
					name: componentConfig.name || toHumanReadableName(className),
					group: componentGroup,
					description: componentConfig.description || `Custom component: ${className}`,
					regionDefinitions,
					attributes
				};
				if (typeof componentConfig.embedded === "boolean") componentMetadata.embedded = componentConfig.embedded;
				if (componentConfig.component_id !== void 0) componentMetadata.component_id = String(componentConfig.component_id);
				components.push(componentMetadata);
			}
		} catch (error) {
			if (error instanceof UnresolvedConstantReferenceError) throw error;
			logger.warn(`Could not process file ${filePath}:`, error.message);
		}
		return components;
	} catch (error) {
		if (error instanceof UnresolvedConstantReferenceError) throw error;
		logger.warn(`Could not read file ${filePath}:`, error.message);
		return [];
	}
}
async function processPageTypeFile(filePath, projectRoot) {
	try {
		const content = await readFile(filePath, "utf-8");
		const pageTypes = [];
		if (!content.includes("@PageType")) return pageTypes;
		try {
			const sourceFile = new Project({
				useInMemoryFileSystem: true,
				skipAddingFilesFromTsConfig: true
			}).createSourceFile(filePath, content);
			const classes = sourceFile.getClasses();
			for (const classDeclaration of classes) {
				const pageTypeDecorator = classDeclaration.getDecorator("PageType");
				if (!pageTypeDecorator) continue;
				const className = classDeclaration.getName();
				if (!className) continue;
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
					...pageTypeConfig.preview !== void 0 && { preview: pageTypeConfig.preview }
				};
				pageTypes.push(pageTypeMetadata);
			}
		} catch (error) {
			logger.warn(`Could not process file ${filePath}:`, error.message);
		}
		return pageTypes;
	} catch (error) {
		logger.warn(`Could not read file ${filePath}:`, error.message);
		return [];
	}
}
async function processAspectFile(filePath, _projectRoot) {
	try {
		const content = await readFile(filePath, "utf-8");
		const aspects = [];
		if (!filePath.endsWith(".json") || !content.trim().startsWith("{")) return aspects;
		if (!filePath.includes("/aspects/") && !filePath.includes("\\aspects\\")) return aspects;
		try {
			const aspectData = JSON.parse(content);
			const fileName = basename(filePath, ".json");
			if (!aspectData.name || !aspectData.attribute_definitions) return aspects;
			const aspectMetadata = {
				id: fileName,
				name: aspectData.name,
				description: aspectData.description || `Aspect type: ${aspectData.name}`,
				attributeDefinitions: aspectData.attribute_definitions || [],
				supportedObjectTypes: aspectData.supported_object_types || []
			};
			aspects.push(aspectMetadata);
		} catch (parseError) {
			logger.warn(`Could not parse JSON in file ${filePath}:`, parseError.message);
		}
		return aspects;
	} catch (error) {
		logger.warn(`Could not read file ${filePath}:`, error.message);
		return [];
	}
}
async function generateComponentCartridge(component, outputDir, dryRun = false) {
	const fileName = toCamelCaseFileName(component.typeId);
	const groupDir = join(outputDir, component.group);
	const outputPath = join(groupDir, `${fileName}.json`);
	if (!dryRun) {
		try {
			await mkdir(groupDir, { recursive: true });
		} catch {}
		const attributeDefinitionGroups = [{
			id: component.typeId,
			name: component.name,
			description: component.description,
			attribute_definitions: component.attributes
		}];
		const cartridgeData = {
			name: component.name,
			description: component.description,
			group: component.group,
			arch_type: ARCH_TYPE_HEADLESS,
			...typeof component.embedded === "boolean" && { embedded: component.embedded },
			component_id: component.component_id,
			region_definitions: component.regionDefinitions || [],
			attribute_definition_groups: attributeDefinitionGroups
		};
		await writeFile(outputPath, JSON.stringify(cartridgeData, null, 2));
	}
	const prefix = dryRun ? "   - [DRY RUN]" : "   -";
	logger.debug(`${prefix} ${String(component.typeId)}: ${String(component.name)} (${String(component.attributes.length)} attributes) → ${fileName}.json`);
}
async function generatePageTypeCartridge(pageType, outputDir, dryRun = false) {
	const fileName = toCamelCaseFileName(pageType.name);
	const outputPath = join(outputDir, `${fileName}.json`);
	if (!dryRun) {
		const cartridgeData = {
			name: pageType.name,
			description: pageType.description,
			arch_type: ARCH_TYPE_HEADLESS,
			region_definitions: pageType.regionDefinitions || []
		};
		if (pageType.attributes && pageType.attributes.length > 0) cartridgeData.attribute_definition_groups = [{
			id: pageType.typeId || fileName,
			name: pageType.name,
			description: pageType.description,
			attribute_definitions: pageType.attributes
		}];
		if (pageType.supportedAspectTypes) cartridgeData.supported_aspect_types = pageType.supportedAspectTypes;
		if (pageType.route) cartridgeData.route = pageType.route;
		if (pageType.preview !== void 0) cartridgeData.preview = pageType.preview;
		await writeFile(outputPath, JSON.stringify(cartridgeData, null, 2));
	}
	const prefix = dryRun ? "   - [DRY RUN]" : "   -";
	logger.debug(`${prefix} ${String(pageType.name)}: ${String(pageType.description)} (${String(pageType.attributes.length)} attributes) → ${fileName}.json`);
}
async function generateAspectCartridge(aspect, outputDir, dryRun = false) {
	const fileName = toCamelCaseFileName(aspect.id);
	const outputPath = join(outputDir, `${fileName}.json`);
	if (!dryRun) {
		const cartridgeData = {
			name: aspect.name,
			description: aspect.description,
			arch_type: ARCH_TYPE_HEADLESS,
			attribute_definitions: aspect.attributeDefinitions || []
		};
		if (aspect.supportedObjectTypes) cartridgeData.supported_object_types = aspect.supportedObjectTypes;
		await writeFile(outputPath, JSON.stringify(cartridgeData, null, 2));
	}
	const prefix = dryRun ? "   - [DRY RUN]" : "   -";
	logger.debug(`${prefix} ${String(aspect.name)}: ${String(aspect.description)} (${String(aspect.attributeDefinitions.length)} attributes) → ${fileName}.json`);
}
/**
* Runs ESLint with --fix on the specified directory to format JSON files.
* This ensures generated JSON files match the project's Prettier/ESLint configuration.
*/
function lintGeneratedFiles(metadataDir, projectRoot) {
	try {
		logger.debug("🔧 Running ESLint --fix on generated JSON files...");
		execSync(`npx eslint "${metadataDir}/**/*.json" --fix --no-error-on-unmatched-pattern`, {
			cwd: projectRoot,
			stdio: "pipe",
			encoding: "utf-8"
		});
		logger.debug("✅ JSON files formatted successfully");
	} catch (error) {
		const execError = error;
		if (execError.status === 2) {
			const errMsg = execError.stderr || execError.stdout || "Unknown error";
			logger.warn(`⚠️  Could not run ESLint --fix: ${errMsg}`);
		} else if (execError.stderr && execError.stderr.includes("error")) logger.warn(`⚠️  Some linting issues could not be auto-fixed. Run ESLint manually to review.`);
		else logger.debug("✅ JSON files formatted successfully");
	}
}
async function generateMetadata(projectDirectory, metadataDirectory, options) {
	try {
		const filePaths = options?.filePaths;
		const isIncrementalMode = filePaths && filePaths.length > 0;
		const dryRun = options?.dryRun || false;
		if (dryRun) logger.debug("🔍 [DRY RUN] Scanning for decorated components and page types...");
		else if (isIncrementalMode) logger.debug(`🔍 Generating metadata for ${filePaths.length} specified file(s)...`);
		else logger.debug("🔍 Generating metadata for decorated components and page types...");
		const projectRoot = resolve(projectDirectory);
		const srcDir = join(projectRoot, "src");
		const metadataDir = resolve(metadataDirectory);
		const componentsOutputDir = join(metadataDir, "components");
		const pagesOutputDir = join(metadataDir, "pages");
		const aspectsOutputDir = join(metadataDir, "aspects");
		if (!dryRun) {
			if (!isIncrementalMode) {
				logger.debug("🗑️  Cleaning existing output directories...");
				for (const outputDir of [
					componentsOutputDir,
					pagesOutputDir,
					aspectsOutputDir
				]) try {
					await rm(outputDir, {
						recursive: true,
						force: true
					});
					logger.debug(`   - Deleted: ${outputDir}`);
				} catch {
					logger.debug(`   - Directory not found (skipping): ${outputDir}`);
				}
			} else logger.debug("📝 Incremental mode: existing cartridge files will be preserved/overwritten");
			logger.debug("Creating output directories...");
			for (const outputDir of [
				componentsOutputDir,
				pagesOutputDir,
				aspectsOutputDir
			]) try {
				await mkdir(outputDir, { recursive: true });
			} catch (error) {
				try {
					await access(outputDir);
				} catch {
					const err = error;
					logger.error(`❌ Failed to create output directory ${outputDir}: ${err.message}`);
					process.exit(1);
					throw err;
				}
			}
		} else if (isIncrementalMode) logger.debug(`📝 [DRY RUN] Would process ${filePaths.length} specific file(s)`);
		else logger.debug("📝 [DRY RUN] Would clean and regenerate all metadata files");
		let files = [];
		if (isIncrementalMode && filePaths) {
			files = filePaths.map((fp) => resolve(projectRoot, fp));
			logger.debug(`📂 Processing ${files.length} specified file(s)...`);
		} else {
			const scanDirectory = async (dir) => {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = join(dir, entry.name);
					if (entry.isDirectory()) {
						if (!SKIP_DIRECTORIES.includes(entry.name)) await scanDirectory(fullPath);
					} else if (entry.isFile() && (extname(entry.name) === ".ts" || extname(entry.name) === ".tsx" || extname(entry.name) === ".json")) files.push(fullPath);
				}
			};
			await scanDirectory(srcDir);
			const configMetadataDir = join(projectRoot, "config-metadata");
			try {
				await access(configMetadataDir);
				await scanDirectory(configMetadataDir);
			} catch (error) {
				if (error.code === "ENOENT") logger.debug(`   - Directory not found (skipping): ${configMetadataDir}`);
				else logger.warn(`   - Unable to access ${configMetadataDir}:`, error.message);
			}
		}
		const allComponents = [];
		const allPageTypes = [];
		const allAspects = [];
		for (const file of files) {
			const components = await processComponentFile(file, projectRoot);
			allComponents.push(...components);
			const pageTypes = await processPageTypeFile(file, projectRoot);
			allPageTypes.push(...pageTypes);
			const aspects = await processAspectFile(file, projectRoot);
			allAspects.push(...aspects);
		}
		if (allComponents.length === 0 && allPageTypes.length === 0 && allAspects.length === 0) {
			logger.info("⚠️  No decorated components, page types, or aspect files found.");
			return {
				componentsGenerated: 0,
				pageTypesGenerated: 0,
				aspectsGenerated: 0,
				totalFiles: 0
			};
		}
		if (allComponents.length > 0) {
			logger.debug(`✅ Found ${allComponents.length} decorated component(s)`);
			for (const component of allComponents) await generateComponentCartridge(component, componentsOutputDir, dryRun);
			if (dryRun) logger.info(`[DRY RUN] Would generate ${allComponents.length} component metadata file(s)`);
			else logger.info(`Generated ${allComponents.length} component metadata file(s)`);
		}
		if (allPageTypes.length > 0) {
			logger.debug(`✅ Found ${allPageTypes.length} decorated page type(s)`);
			for (const pageType of allPageTypes) await generatePageTypeCartridge(pageType, pagesOutputDir, dryRun);
			if (dryRun) logger.info(`[DRY RUN] Would generate ${allPageTypes.length} page type metadata file(s)`);
			else logger.info(`Generated ${allPageTypes.length} page type metadata file(s)`);
		}
		if (allAspects.length > 0) {
			logger.debug(`✅ Found ${allAspects.length} decorated aspect(s)`);
			for (const aspect of allAspects) await generateAspectCartridge(aspect, aspectsOutputDir, dryRun);
			if (dryRun) logger.info(`[DRY RUN] Would generate ${allAspects.length} aspect metadata file(s)`);
			else logger.info(`Generated ${allAspects.length} aspect metadata file(s)`);
		}
		const shouldLintFix = options?.lintFix !== false;
		if (!dryRun && shouldLintFix && (allComponents.length > 0 || allPageTypes.length > 0 || allAspects.length > 0)) lintGeneratedFiles(metadataDir, projectRoot);
		return {
			componentsGenerated: allComponents.length,
			pageTypesGenerated: allPageTypes.length,
			aspectsGenerated: allAspects.length,
			totalFiles: allComponents.length + allPageTypes.length + allAspects.length
		};
	} catch (error) {
		const err = error;
		logger.error("❌ Error:", err.message);
		process.exit(1);
		throw err;
	}
}

//#endregion
export { generateMetadata as t };