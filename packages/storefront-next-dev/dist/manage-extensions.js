import { t as logger } from "./logger.js";
import { a as trimExtensions, r as resolveDependentsForMultiple, t as getMissingDependencies } from "./dependency-utils.js";
import { execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs-extra";
import prompts from "prompts";
import { z } from "zod";

//#region src/extensibility/manage-extensions.ts
const EXTENSIONS_DIR = ["src", "extensions"];
const CONFIG_PATH = [...EXTENSIONS_DIR, "config.json"];
const EXTENSION_FOLDERS = [
	"components",
	"locales",
	"hooks",
	"routes"
];
const consoleLog = (message, type) => {
	switch (type) {
		case "error":
			logger.error(`❌ ${message}`);
			break;
		case "success":
			logger.info(`✅ ${message}`);
			break;
		default:
			logger.info(message);
			break;
	}
};
/**
* Get the path to the extension config file
*/
const getExtensionConfigPath = (projectDirectory) => {
	return path.join(projectDirectory, ...CONFIG_PATH);
};
/**
* Check if the project directory contains the extensions directory and config.json file
*/
const getExtensionConfig = (projectDirectory) => {
	const extensionConfigPath = getExtensionConfigPath(projectDirectory);
	if (!fs.existsSync(extensionConfigPath)) {
		consoleLog(`Extension config file not found: ${extensionConfigPath}. Are you running this command in the correct project directory?`, "error");
		process.exit(1);
	}
	return JSON.parse(fs.readFileSync(extensionConfigPath, "utf8")).extensions;
};
/**
* Common function to get the extension selection from the user
* @param type 'multiselect' | 'select'
* @param extensionConfig Record<string, ExtensionMeta>
* @param message string
* @param installedExtensions string[]
* @param excludeExtensions string[] extensions to exclude from the list, so we can filter out extensions that are already installed
* @returns string[]
*/
const getExtensionSelection = async (type, extensionConfig, message, installedExtensions, excludeExtensions = []) => {
	consoleLog("\n", "info");
	const { selectedExtensions } = await prompts({
		type,
		name: "selectedExtensions",
		message,
		choices: installedExtensions.filter((extensionKey) => !excludeExtensions.includes(extensionKey)).map((extensionKey) => ({
			title: `${extensionConfig[extensionKey].name} - ${extensionConfig[extensionKey].description}`,
			value: extensionKey
		})),
		instructions: false
	});
	return type === "multiselect" ? selectedExtensions : [selectedExtensions];
};
/**
* Handle the uninstallation of extensions
* @param extensionConfig Record<string, ExtensionMeta>
* @param options {
projectDirectory: string;
extensions?: string[];
}
* @returns void
*/
const handleUninstall = async (extensionConfig, options) => {
	let installedExtensions = Object.keys(extensionConfig);
	if (installedExtensions.length === 0) {
		consoleLog("\n You have not installed any extensions yet.", "error");
		return;
	}
	const selectedExtensions = options.extensions ? options.extensions : await getExtensionSelection("multiselect", extensionConfig, "🔌 Which extensions would you like to uninstall?", installedExtensions);
	if (selectedExtensions == null || selectedExtensions.length === 0) {
		consoleLog("\n Please select at least one extension to uninstall.", "error");
		return;
	}
	const allToUninstall = resolveDependentsForMultiple(selectedExtensions, { extensions: extensionConfig });
	const installedSet = new Set(installedExtensions);
	const extensionsToUninstall = allToUninstall.filter((key) => installedSet.has(key));
	const selectedSet = new Set(selectedExtensions);
	const additionalDependents = extensionsToUninstall.filter((key) => !selectedSet.has(key));
	if (additionalDependents.length > 0) {
		consoleLog("\n", "info");
		consoleLog(`Uninstalling the selected extension(s) will also uninstall the following dependent extensions:`, "info");
		additionalDependents.forEach((depKey) => {
			const depExtension = extensionConfig[depKey];
			const dependsOn = selectedExtensions.find((selKey) => {
				return extensionConfig[selKey] && extensionConfig[depKey]?.dependencies?.includes(selKey);
			});
			const dependsOnName = dependsOn ? extensionConfig[dependsOn]?.name : "selected extension";
			consoleLog(` • ${depExtension?.name || depKey} (depends on ${dependsOnName})`, "info");
		});
		consoleLog("\n", "info");
		if (!options.yes) {
			const { confirmUninstall } = await prompts({
				type: "confirm",
				name: "confirmUninstall",
				message: `Uninstall all ${extensionsToUninstall.length} extensions?`,
				initial: true
			});
			if (!confirmUninstall) {
				consoleLog("Uninstallation aborted.", "info");
				return;
			}
		}
	}
	extensionsToUninstall.forEach((ext) => {
		if (extensionConfig[ext]?.folder) fs.rmSync(path.join(options.projectDirectory, ...EXTENSIONS_DIR, extensionConfig[ext].folder), {
			recursive: true,
			force: true
		});
	});
	const extensionsToUninstallSet = new Set(extensionsToUninstall);
	installedExtensions = installedExtensions.filter((ext) => !extensionsToUninstallSet.has(ext));
	await trimExtensions(options.projectDirectory, Object.fromEntries(installedExtensions.map((ext) => [ext, true])), { extensions: extensionConfig });
	consoleLog(" Extensions uninstalled.", "success");
};
/**
* Install a single extension (internal helper)
* @returns true if installation succeeded, false otherwise
*/
const installSingleExtension = (extensionKey, srcExtensionConfig, extensionConfig, tmpDir, projectDirectory) => {
	const extension = srcExtensionConfig[extensionKey];
	const startTime = Date.now();
	if (extension.folder) fs.copySync(path.join(tmpDir, ...EXTENSIONS_DIR, extension.folder), path.join(projectDirectory, ...EXTENSIONS_DIR, extension.folder));
	if (extension.installationInstructions) {
		logger.info(`⏳ Installing ${extension.name}, this will take a few minutes...`);
		try {
			execSync(`cursor-agent -p --force 'Execute the steps specified in the installation instructions file: ${extension.installationInstructions}' --output-format text`, {
				cwd: projectDirectory,
				stdio: "inherit"
			});
		} catch (e) {
			consoleLog(`Error installing ${extension.name}. ${e.message}`, "error");
			return false;
		}
	}
	extensionConfig[extensionKey] = extension;
	fs.writeFileSync(getExtensionConfigPath(projectDirectory), JSON.stringify({ extensions: extensionConfig }, null, 4));
	consoleLog(`${extension.name} was installed successfully. (${Date.now() - startTime}ms)`, "success");
	return true;
};
/**
* Handle the installation of extensions
* @param extensionConfig
* @param options {
sourceGithubUrl?: string;
projectDirectory: string;
extensions?: string[];
}
* @returns
*/
const handleInstall = async (extensionConfig, options) => {
	const { sourceGitUrl } = await prompts({
		type: "text",
		name: "sourceGitUrl",
		message: "🌐 What is the Git URL for the extensions project?",
		initial: options.sourceGitUrl
	});
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `sfnext-extensions-${Date.now()}`));
	execSync(`git clone ${sourceGitUrl} ${tmpDir}`);
	const srcExtensionConfig = getExtensionConfig(tmpDir);
	if (srcExtensionConfig == null || Object.keys(srcExtensionConfig).length === 0) {
		consoleLog(`No extensions found in the source project, please check ${path.join(...CONFIG_PATH)} exists in ${sourceGitUrl} and contains at least one extension.`, "error");
		return;
	}
	const selectedExtensions = options.extensions ? options.extensions : await getExtensionSelection("select", srcExtensionConfig, "🔌 Which extension would you like to install?", Object.keys(srcExtensionConfig), Object.keys(extensionConfig));
	if (selectedExtensions == null || selectedExtensions.length !== 1 || selectedExtensions[0] == null) {
		consoleLog("Please select exactly one extension to install.", "error");
		return;
	}
	const extensionKey = selectedExtensions[0];
	const extension = srcExtensionConfig[extensionKey];
	if (Object.values(srcExtensionConfig).some((ext) => ext.installationInstructions)) try {
		execSync("cursor-agent -v", { stdio: "ignore" });
	} catch (e) {
		consoleLog("This extension contains LLM instructions, please install cursor cli and try again. (https://cursor.com/docs/cli/overview)", "error");
		return;
	}
	const srcConfig = { extensions: srcExtensionConfig };
	const missingDeps = getMissingDependencies(extensionKey, Object.keys(extensionConfig), srcConfig);
	const dependenciesToInstall = missingDeps.slice(0, -1);
	let hasError = false;
	try {
		if (dependenciesToInstall.length > 0) {
			consoleLog("\n", "info");
			consoleLog(`Installing ${extension.name} requires the following dependencies:`, "info");
			dependenciesToInstall.forEach((depKey) => {
				const depExtension = srcExtensionConfig[depKey];
				consoleLog(` • ${depExtension?.name || depKey} (not installed)`, "info");
			});
			consoleLog("\n", "info");
			const estimatedMinutes = missingDeps.length * 5;
			const { confirmInstall } = await prompts({
				type: "confirm",
				name: "confirmInstall",
				message: `Install all ${missingDeps.length} extensions? (~${estimatedMinutes} minutes total)`,
				initial: true
			});
			if (!confirmInstall) {
				consoleLog("Installation aborted.", "info");
				return;
			}
		}
		for (const depKey of missingDeps) if (!installSingleExtension(depKey, srcExtensionConfig, extensionConfig, tmpDir, options.projectDirectory)) hasError = true;
	} finally {
		fs.rmSync(tmpDir, {
			recursive: true,
			force: true
		});
	}
	const originalFiles = fs.readdirSync(path.join(options.projectDirectory, "src"), { recursive: true }).filter((file) => file.toString().endsWith(".original"));
	if (originalFiles.length > 0) {
		consoleLog("\n📄 The following files were modified. The original files are still available in the same location with the \".original\" extension:", "info");
		originalFiles.forEach((file) => {
			consoleLog(`- ${file.toString().replace(".original", "")}`, "info");
		});
	}
	if (!hasError) consoleLog("\n🚀 Installation completed successfully.", "info");
};
const manageExtensions = async (options) => {
	if (options.install && options.uninstall) {
		consoleLog("Please select either install or uninstall, not both.", "error");
		return;
	}
	let operation = options.install ? "install" : options.uninstall ? "uninstall" : void 0;
	const extensionConfig = getExtensionConfig(options.projectDirectory);
	if (operation == null) operation = (await prompts({
		type: "select",
		name: "operation",
		message: "🤔 What would you like to do?",
		choices: [{
			title: "Install extensions",
			value: "install"
		}, {
			title: "Uninstall extensions",
			value: "uninstall"
		}]
	})).operation;
	if (operation === "uninstall") await handleUninstall(extensionConfig, options);
	else await handleInstall(extensionConfig, options);
};
const getExtensionMarker = (val) => {
	return `SFDC_EXT_${val.toUpperCase().replaceAll(" ", "_").replaceAll("-", "_")}`;
};
const getExtensionFolderName = (val) => {
	return val.toLowerCase().replaceAll(" ", "-").trim();
};
const getExtensionNameSchema = (projectDirectory, extensionConfig) => {
	return z.object({ name: z.string().regex(/^[a-zA-Z0-9 _-]+$/, { message: "Extension name can only contain alphanumeric characters, spaces, dashes, or underscores" }) }).superRefine((data, ctx) => {
		if (extensionConfig[getExtensionMarker(data.name)]) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Extension "${data.name}" already exists`
		});
		if (fs.existsSync(path.join(projectDirectory, ...EXTENSIONS_DIR, getExtensionFolderName(data.name)))) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Extension directory ${getExtensionFolderName(data.name)} already exists`
		});
	});
};
const listExtensions = (options) => {
	const extensionConfig = getExtensionConfig(options.projectDirectory);
	consoleLog("The following extensions are installed:", "info");
	Object.keys(extensionConfig).forEach((key) => {
		consoleLog(`- ${extensionConfig[key].name}: ${extensionConfig[key].description}`, "info");
	});
};
const createExtension = async (options) => {
	const { projectDirectory, name, description } = options;
	const extensionConfig = getExtensionConfig(projectDirectory);
	let extensionName = name;
	let extensionDescription = description;
	if (extensionName == null || extensionName.trim() === "") extensionName = (await prompts({
		type: "text",
		name: "extensionName",
		message: "What would you like to name the extension? (e.g., \"My Extension\")"
	})).extensionName;
	const result = getExtensionNameSchema(projectDirectory, extensionConfig).safeParse({ name: extensionName });
	if (!result.success) {
		const firstIssueMessage = result.error.issues?.[0]?.message;
		consoleLog(firstIssueMessage, "error");
		return;
	}
	if (extensionDescription == null || extensionDescription.trim() === "") extensionDescription = (await prompts({
		type: "text",
		name: "extensionDescription",
		message: "How would you describe the extension?"
	})).extensionDescription;
	const folderName = getExtensionFolderName(extensionName);
	const extensionFolderPath = path.join(projectDirectory, ...EXTENSIONS_DIR, folderName);
	fs.mkdirSync(extensionFolderPath, { recursive: true });
	EXTENSION_FOLDERS.forEach((folder) => {
		fs.mkdirSync(path.join(extensionFolderPath, folder), { recursive: true });
	});
	fs.writeFileSync(path.join(extensionFolderPath, "README.md"), `# ${extensionName}\n\n${extensionDescription}`);
	const marker = getExtensionMarker(extensionName);
	extensionConfig[marker] = {
		name: extensionName,
		description: extensionDescription,
		installationInstructions: "",
		uninstallationInstructions: "",
		folder: folderName,
		dependencies: []
	};
	fs.writeFileSync(path.join(projectDirectory, ...CONFIG_PATH), JSON.stringify({ extensions: extensionConfig }, null, 4));
	consoleLog(`Extension "${extensionName}" scaffolding was created successfully.`, "success");
};

//#endregion
export { listExtensions as n, manageExtensions as r, createExtension as t };