import "../package.js";
import { t as logger } from "../logger.js";
import "../logger2.js";
import { Command, Flags } from "@oclif/core";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";

//#region src/extensibility/create-instructions.ts
const SKIP_DIRS = [
	"node_modules",
	"dist",
	"build"
];
const INSTALL_INSTRUCTIONS_TEMPLATE = "install-instructions.mdc.hbs";
const UNINSTALL_INSTRUCTIONS_TEMPLATE = "uninstall-instructions.mdc.hbs";
/**
* Build the context for the instructions template.
*/
function getContext(projectRoot, markerValue, pwaRepo = "https://github.com/SalesforceCommerceCloud/storefront-next-template.git", branch = "main", filesToCopy = [], extensionConfigPath = "") {
	const extensionConfig = JSON.parse(fs.readFileSync(extensionConfigPath, "utf8"));
	if (!extensionConfig.extensions[markerValue]) throw new Error(`Extension ${markerValue} not found in extension config`);
	filesToCopy.forEach((file) => {
		const fullPath = path.join(projectRoot, file);
		if (!fs.existsSync(fullPath)) throw new Error(`File or directory ${fullPath} not found`);
	});
	const { mergeFiles, newFiles } = findMarkedFiles(projectRoot, markerValue);
	filesToCopy.push(...newFiles);
	const extensionMeta = extensionConfig.extensions[markerValue];
	const dependencies = (extensionMeta.dependencies || []).map((depKey) => ({
		key: depKey,
		name: extensionConfig.extensions[depKey]?.name || depKey
	}));
	return {
		extensionName: extensionMeta.name,
		pwaRepo,
		branch,
		markerValue,
		mergeFiles,
		newFiles,
		copy: getFilesToCopyContext(projectRoot, filesToCopy),
		dependencies
	};
}
/**
* Get the context for the files to copy.
*/
const getFilesToCopyContext = (projectRoot, filesToCopy) => {
	filesToCopy.forEach((file) => {
		const fullPath = path.join(projectRoot, file);
		if (!fs.existsSync(fullPath)) throw new Error(`File or directory ${fullPath} not found`);
	});
	return filesToCopy.map((file) => ({
		src: file,
		dest: file,
		isDirectory: fs.statSync(path.join(projectRoot, file)).isDirectory()
	}));
};
/**
* Find all the files that contain the marker value in the project folder.
* @param {string} markerValue
* @returns {string[]} The files that are marked with the marker value
*/
const findMarkedFiles = (projectRoot, markerValue) => {
	const fileTypes = [
		"jsx",
		"tsx",
		"ts",
		"js"
	];
	const mergeFiles = [];
	const newFiles = [];
	const lineRegex = /* @__PURE__ */ new RegExp(`@sfdc-extension-line\\s+${markerValue}`);
	const blockStartRegex = /* @__PURE__ */ new RegExp(`@sfdc-extension-block-start\\s+${markerValue}`);
	const blockEndRegex = /* @__PURE__ */ new RegExp(`@sfdc-extension-block-end\\s+${markerValue}`);
	const fileRegex = /* @__PURE__ */ new RegExp(`@sfdc-extension-file\\s+${markerValue}`);
	const searchFiles = (dir) => {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name)) searchFiles(fullPath);
			else if (entry.isFile() && fileTypes.some((ext) => fullPath.endsWith(`.${ext}`))) {
				const content = fs.readFileSync(fullPath, "utf8");
				if (lineRegex.test(content) || blockStartRegex.test(content) || blockEndRegex.test(content)) mergeFiles.push(path.relative(projectRoot, fullPath));
				else if (fileRegex.test(content)) newFiles.push(path.relative(projectRoot, fullPath));
			}
		}
	};
	searchFiles(projectRoot);
	logger.info(`Found ${mergeFiles.length} files to merge for marker value ${markerValue}:`);
	logger.info(mergeFiles.join("\n"));
	logger.info(`Found ${newFiles.length} files to add for marker value ${markerValue}:`);
	logger.info(newFiles.join("\n"));
	return {
		mergeFiles,
		newFiles
	};
};
/**
* Generate the MDC instructions file based on user inputs.
*/
const generateInstructions = (projectRoot, markerValue, outputDir, pwaRepo, branch, filesToCopy, extensionConfig = "", templateDir = "") => {
	const context = getContext(projectRoot, markerValue, pwaRepo, branch, filesToCopy, extensionConfig);
	const instructionsDir = path.join(projectRoot, outputDir || "instructions");
	if (!fs.existsSync(instructionsDir)) fs.mkdirSync(instructionsDir);
	genertaeAndWriteInstructions(path.join(templateDir, INSTALL_INSTRUCTIONS_TEMPLATE), context, path.join(instructionsDir, `install-${context.extensionName.toLowerCase().replace(/ /g, "-")}.mdc`));
	genertaeAndWriteInstructions(path.join(templateDir, UNINSTALL_INSTRUCTIONS_TEMPLATE), context, path.join(instructionsDir, `uninstall-${context.extensionName.toLowerCase().replace(/ /g, "-")}.mdc`));
};
/**
* Generate the MDC instructions file based on the template file and context.
*/
const genertaeAndWriteInstructions = (templateFile, context, outputFile) => {
	const templateContent = fs.readFileSync(templateFile, "utf8");
	const mdcContent = Handlebars.compile(templateContent)(context);
	fs.writeFileSync(outputFile, mdcContent, "utf8");
	logger.info(`MDC instructions written to ${outputFile}`);
};

//#endregion
//#region src/commands/create-instructions.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
* Create instructions command - generates LLM instructions for installing/uninstalling extensions.
*/
var CreateInstructions = class CreateInstructions extends Command {
	static description = "Generate LLM instructions using prompt templating for installing and uninstalling Storefront Next feature extensions";
	static examples = ["<%= config.bin %> <%= command.id %> -d ./my-project -c ./extension.json -e SFDC_EXT_FEATURE", "<%= config.bin %> <%= command.id %> -d . -c config.json -e SFDC_EXT_STORE_LOCATOR -o ./docs"];
	static flags = {
		"project-directory": Flags.string({
			char: "d",
			description: "Project directory",
			required: true
		}),
		"extension-config": Flags.string({
			char: "c",
			description: "Extension config JSON file location",
			required: true
		}),
		extension: Flags.string({
			char: "e",
			description: "Extension marker value (e.g. SFDC_EXT_featureA)",
			required: true
		}),
		"template-repo": Flags.string({
			char: "p",
			description: "Storefront template repo URL (default: https://github.com/SalesforceCommerceCloud/storefront-next-template.git)"
		}),
		branch: Flags.string({
			char: "b",
			description: "Storefront template repo branch (default: main)"
		}),
		files: Flags.string({
			char: "f",
			description: "Specific files to include (relative to project directory), comma-separated"
		}),
		"output-dir": Flags.string({
			char: "o",
			description: "Output directory (default: ./instructions)"
		})
	};
	async run() {
		const { flags } = await this.parse(CreateInstructions);
		const baseDir = process.cwd();
		const projectDirectory = path.resolve(baseDir, flags["project-directory"]);
		const extensionConfig = path.resolve(baseDir, flags["extension-config"]);
		const extension = flags.extension;
		const files = flags.files ? flags.files.split(",").map((f) => f.trim()) : void 0;
		const templatesDir = path.resolve(__dirname, "../extensibility/templates");
		generateInstructions(projectDirectory, extension, flags["output-dir"] ?? "./instructions", flags["template-repo"], flags.branch, files, extensionConfig, templatesDir);
		this.log("Instructions generated successfully!");
	}
};

//#endregion
export { CreateInstructions as default };