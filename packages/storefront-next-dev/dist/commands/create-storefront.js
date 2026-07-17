import { t as logger } from "../logger.js";
import "../logger2.js";
import { t as generateEnvFile } from "../utils.js";
import { a as trimExtensions, i as validateNoCycles, n as resolveDependenciesForMultiple } from "../dependency-utils.js";
import { t as prepareForLocalDev } from "../local-dev-setup.js";
import { Command, Flags } from "@oclif/core";
import { execFileSync, execSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import prompts from "prompts";
import { parseEnv } from "node:util";

//#region src/create-storefront.ts
const DEFAULT_STOREFRONT = "sfcc-storefront";
/**
* Available storefront verticals, keyed by the value accepted by the `--vertical` flag.
* `label` is the human-facing choice shown in the interactive prompt; `url` is the
* published template repository cloned for that vertical. Extend this map to surface a
* new vertical in both the prompt and the flag.
*/
const VERTICALS = {
	fashion: {
		label: "Salesforce B2C Commerce Retail Storefront (Fashion)",
		url: "https://github.com/SalesforceCommerceCloud/storefront-next-template"
	},
	cosmetic: {
		label: "Salesforce B2C Commerce Beauty Storefront (Cosmetic)",
		url: "https://github.com/SalesforceCommerceCloud/storefront-next-beauty"
	},
	foundations: {
		label: "Salesforce B2C Commerce Foundations Storefront (Foundations)",
		url: "https://github.com/SalesforceCommerceCloud/storefront-next-foundations"
	}
};
const DEFAULT_VERTICAL = "fashion";
const isLocalPath = (template) => template.startsWith("file://") || template.startsWith("/") || template.startsWith("./") || template.startsWith("../");
const createStorefront = async (options = {}) => {
	try {
		execSync("git --version", { stdio: "ignore" });
	} catch (e) {
		logger.error(`❌ git is not installed or found in your PATH. Install git before running this command: ${String(e)}`);
		process.exit(1);
	}
	let storefront = options.name;
	if (!storefront) storefront = (await prompts({
		type: "text",
		name: "storefront",
		message: "🏪 What would you like to name your storefront?\n",
		initial: DEFAULT_STOREFRONT
	})).storefront;
	if (!storefront) {
		logger.error("Storefront name is required.");
		process.exit(1);
	}
	logger.info("\n");
	const outputPath = options.outputDir ? path.join(options.outputDir, storefront) : storefront;
	let template = options.template;
	if (!template && options.vertical) {
		const vertical = VERTICALS[options.vertical];
		if (!vertical) {
			logger.error(`Unknown vertical "${options.vertical}". Available verticals: ${Object.keys(VERTICALS).join(", ")}.`);
			process.exit(1);
		}
		template = vertical.url;
	} else if (!template && options.defaults) template = VERTICALS[DEFAULT_VERTICAL].url;
	if (!template) {
		template = (await prompts({
			type: "select",
			name: "template",
			message: "📄 Which template would you like to use for your storefront?\n",
			choices: [...Object.values(VERTICALS).map((vertical) => ({
				title: vertical.label,
				value: vertical.url
			})), {
				title: "A different template (I will provide the Github URL)",
				value: "custom"
			}]
		})).template;
		logger.info("\n");
		if (template === "custom") {
			const { githubUrl } = await prompts({
				type: "text",
				name: "githubUrl",
				message: "🌐 What is the Github URL for your template?\n"
			});
			if (!githubUrl) {
				logger.error("Github URL is required.");
				process.exit(1);
			}
			template = githubUrl;
		}
	}
	if (!template) {
		logger.error("Template is required.");
		process.exit(1);
	}
	if (options.templateBranch !== void 0 && options.templateBranch.trim() === "") {
		logger.error("--template-branch cannot be empty.");
		process.exit(1);
	}
	if (isLocalPath(template)) {
		const resolvedPath = path.resolve(template.replace("file://", ""));
		if (fs.existsSync(path.join(resolvedPath, ".git"))) {
			const cloneArgs = [
				"clone",
				"--depth",
				"1"
			];
			if (options.templateBranch) cloneArgs.push("--branch", options.templateBranch);
			cloneArgs.push(resolvedPath, outputPath);
			execFileSync("git", cloneArgs);
		} else fs.copySync(resolvedPath, outputPath, { filter: (src) => {
			const rel = path.relative(resolvedPath, src);
			return rel !== "node_modules" && !rel.startsWith(`node_modules${path.sep}`) && rel !== ".git" && !rel.startsWith(`.git${path.sep}`);
		} });
	} else {
		const cloneArgs = [
			"clone",
			"--depth",
			"1"
		];
		if (options.templateBranch) cloneArgs.push("--branch", options.templateBranch);
		cloneArgs.push(template, outputPath);
		execFileSync("git", cloneArgs);
	}
	const gitDir = path.join(outputPath, ".git");
	if (fs.existsSync(gitDir)) fs.rmSync(gitDir, {
		recursive: true,
		force: true
	});
	let templateRelease;
	const generatedPkgPath = path.join(outputPath, "package.json");
	if (fs.existsSync(generatedPkgPath)) try {
		templateRelease = JSON.parse(fs.readFileSync(generatedPkgPath, "utf8"))?.storefrontNext?.templateRelease;
	} catch {}
	if (!templateRelease) logger.warn("This template is missing its \"storefrontNext\" origin metadata in package.json. You can still build and run it, but it won’t record which template release it came from.");
	const workspaceYamlPath = path.join(outputPath, "pnpm-workspace.yaml");
	if (!fs.existsSync(workspaceYamlPath)) logger.warn(`Template is missing pnpm-workspace.yaml at ${workspaceYamlPath}. The generated project may not work correctly without a workspace configuration.`);
	if (isLocalPath(template) || options.localPackagesDir) {
		const templatePath = template.replace("file://", "");
		await prepareForLocalDev({
			projectDirectory: outputPath,
			sourcePackagesDir: options.localPackagesDir || path.dirname(templatePath),
			defaults: options.defaults
		});
	}
	logger.info("\n");
	if (fs.existsSync(path.join(outputPath, "src", "extensions", "config.json"))) {
		const extensionConfigText = fs.readFileSync(path.join(outputPath, "src", "extensions", "config.json"), "utf8");
		const extensionConfig = JSON.parse(extensionConfigText);
		if (extensionConfig.extensions) {
			try {
				validateNoCycles(extensionConfig);
			} catch (e) {
				logger.error(`Extension configuration error: ${e.message}`);
				process.exit(1);
			}
			let selectedExtensions;
			if (options.defaults) selectedExtensions = Object.keys(extensionConfig.extensions).filter((ext) => extensionConfig.extensions[ext].defaultOn ?? true);
			else ({selectedExtensions} = await prompts({
				type: "multiselect",
				name: "selectedExtensions",
				message: "🔌 Which extension would you like to enable? (Use arrow keys to select, space to toggle, and enter to confirm.)\n",
				choices: Object.keys(extensionConfig.extensions).map((extension) => ({
					title: `${extensionConfig.extensions[extension].name} - ${extensionConfig.extensions[extension].description}`,
					value: extension,
					selected: extensionConfig.extensions[extension].defaultOn ?? true
				})),
				instructions: false
			}));
			const resolvedExtensions = resolveDependenciesForMultiple(selectedExtensions, extensionConfig);
			const selectedSet = new Set(selectedExtensions);
			const autoAdded = resolvedExtensions.filter((ext) => !selectedSet.has(ext));
			if (autoAdded.length > 0) for (const addedExt of autoAdded) {
				const dependentExts = selectedExtensions.filter((selected) => {
					return (extensionConfig.extensions[selected]?.dependencies || []).includes(addedExt) || resolvedExtensions.indexOf(addedExt) < resolvedExtensions.indexOf(selected);
				});
				if (dependentExts.length > 0) {
					const addedName = extensionConfig.extensions[addedExt]?.name || addedExt;
					const dependentNames = dependentExts.map((ext) => extensionConfig.extensions[ext]?.name || ext).join(", ");
					logger.warn(`${dependentNames} requires ${addedName}. ${addedName} has been automatically added.`);
				}
			}
			await trimExtensions(outputPath, Object.fromEntries(resolvedExtensions.map((ext) => [ext, true])), { extensions: extensionConfig.extensions });
		}
	}
	const configMetaPath = fs.existsSync(path.join(outputPath, "config-meta.json")) ? path.join(outputPath, "config-meta.json") : path.join(outputPath, "src", "config", "config-meta.json");
	const configMeta = JSON.parse(fs.readFileSync(configMetaPath, "utf8"));
	const envDefaultPath = path.join(outputPath, ".env.default");
	let envDefaultValues = {};
	if (fs.existsSync(envDefaultPath)) envDefaultValues = parseEnv(fs.readFileSync(envDefaultPath, "utf8"));
	logger.info("\n⚙️ We will now configure your storefront before it will be ready to run.\n");
	const configOverrides = {};
	for (const config of configMeta.configs) if (options.defaults) configOverrides[config.key] = envDefaultValues[config.key] ?? "";
	else {
		const answer = await prompts({
			type: "text",
			name: config.key,
			message: `What is the value for ${config.name}? (default: ${envDefaultValues[config.key] ?? ""})\n`,
			initial: envDefaultValues[config.key] ?? ""
		});
		configOverrides[config.key] = answer[config.key];
	}
	generateEnvFile(outputPath, configOverrides);
	const BANNER = `
    ╔══════════════════════════════════════════════════════════════════╗
    ║                       CONGRATULATIONS                            ║
    ╚══════════════════════════════════════════════════════════════════╝

        🎉 Congratulations! Your storefront is ready to use! 🎉${templateRelease ? `\n        📦 Generated from template release: ${templateRelease}` : ""}
        What's next:
        - Navigate to the storefront directory: cd ${outputPath}
        - Install dependencies: pnpm install
        - Build the storefront: pnpm run build
        - Run the development server: pnpm run dev
    `;
	logger.info(BANNER);
};

//#endregion
//#region src/commands/create-storefront.ts
/**
* Create storefront command - creates a new storefront project from template.
*/
var CreateStorefront = class CreateStorefront extends Command {
	static description = "Create a storefront project";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> -n my-storefront -V cosmetic",
		"<%= config.bin %> <%= command.id %> -n my-storefront -t https://github.com/org/template -b release-0.2.x",
		"<%= config.bin %> <%= command.id %> -n my-storefront -t /path/to/local/template",
		"<%= config.bin %> <%= command.id %> -l /path/to/monorepo/packages"
	];
	static flags = {
		name: Flags.string({
			char: "n",
			description: "Storefront project name"
		}),
		template: Flags.string({
			char: "t",
			description: "Template repository to use for the storefront (GitHub URL or local path)"
		}),
		vertical: Flags.string({
			char: "V",
			description: "Vertical template to generate from. Selects the matching published template repository. Ignored if --template is provided.",
			options: [
				"fashion",
				"cosmetic",
				"foundations"
			]
		}),
		"template-branch": Flags.string({
			char: "b",
			description: "Branch or tag to clone from the template repository"
		}),
		"local-packages-dir": Flags.string({
			char: "l",
			description: "Local monorepo packages directory for file:// templates (pre-fills dependency paths)"
		}),
		defaults: Flags.boolean({
			char: "d",
			description: "Accept all defaults without prompting (for CI/automation)",
			default: false
		}),
		"output-dir": Flags.string({
			char: "o",
			description: "Directory where the storefront project will be created"
		})
	};
	async run() {
		const { flags } = await this.parse(CreateStorefront);
		await createStorefront({
			name: flags.name,
			template: flags.template,
			vertical: flags.vertical,
			templateBranch: flags["template-branch"],
			localPackagesDir: flags["local-packages-dir"],
			defaults: flags.defaults,
			outputDir: flags["output-dir"]
		});
	}
};

//#endregion
export { CreateStorefront as default };