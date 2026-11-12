import "../package.js";
import "../logger.js";
import "../logger2.js";
import "../format-with-project-biome.js";
import "../ts-import.js";
import { a as assertValidCartridgeName, r as SFNEXT_BASE_CARTRIDGE_NAME, s as cartridgeExperienceDir, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { i as commonFlags } from "../flags.js";
import { t as generateMetadata } from "../generate-cartridge.js";
import { t as validateCartridgeMetadata } from "../validate-cartridge.js";
import { Command, Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { createScaffoldRegistry, generateFromScaffold } from "@salesforce/b2c-tooling-sdk/scaffold";

//#region src/cartridge-services/initialize-cartridge.ts
/**
* Create a named cartridge with only SDK identity files (`.project` and
* `<name>.properties`). Sample controllers, models, scripts, templates, and
* static assets are omitted. If the target already exists, leave it unchanged
* so non-metadata customizations are preserved. No project base cartridge is
* required.
*/
async function initializeNamedCartridge(projectDirectory, cartridgeName) {
	assertValidCartridgeName(cartridgeName);
	const cartridgesDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR);
	const targetDir = path.join(cartridgesDir, cartridgeName);
	if (fs.existsSync(targetDir)) return;
	const scaffold = await createScaffoldRegistry().getScaffold("cartridge", { sources: ["built-in"] });
	if (!scaffold) throw new Error("Built-in cartridge scaffold not found");
	await generateFromScaffold(scaffold, {
		outputDir: cartridgesDir,
		interactive: false,
		variables: {
			cartridgeName,
			includeControllers: false,
			includeModels: false,
			includeScripts: false,
			includeTemplates: false,
			includeStatic: false
		}
	});
}

//#endregion
//#region src/commands/generate-cartridge.ts
/**
* Generate cartridge metadata command.
*
* Scans the project for decorated components and generates Page Designer
* metadata files in the cartridge directory.
*/
var Generate = class Generate extends Command {
	static description = "Generate Page Designer component metadata from decorated components";
	static examples = ["<%= config.bin %> <%= command.id %>", "<%= config.bin %> <%= command.id %> -d ./my-project"];
	static flags = {
		...commonFlags,
		"site-id": Flags.string({ description: "Site ID to use for site-specific configuration, such as SEO route prefixes (defaults to app.defaultSiteId)" }),
		"cartridge-name": Flags.string({ description: "Cartridge directory name under cartridges/ (defaults to app_storefrontnext_base). A new name scaffolds identity files once, then generates metadata there." })
	};
	async run() {
		const { flags } = await this.parse(Generate);
		const projectDirectory = flags["project-directory"];
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory doesn't exist: ${projectDirectory}`);
		const cartridgeName = flags["cartridge-name"] ?? SFNEXT_BASE_CARTRIDGE_NAME;
		try {
			assertValidCartridgeName(cartridgeName);
			if (cartridgeName !== SFNEXT_BASE_CARTRIDGE_NAME) await initializeNamedCartridge(projectDirectory, cartridgeName);
		} catch (error) {
			this.error(error instanceof Error ? error.message : String(error));
		}
		const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, cartridgeExperienceDir(cartridgeName));
		if (!fs.existsSync(metadataDir)) {
			this.log(`Creating metadata directory: ${metadataDir}`);
			fs.mkdirSync(metadataDir, { recursive: true });
		}
		this.log("Generating Page Designer metadata...");
		await generateMetadata(projectDirectory, metadataDir, { siteId: flags["site-id"] });
		this.log("Page Designer metadata generated successfully!\n");
		this.log("Validating generated metadata...\n");
		const summary = await validateCartridgeMetadata(metadataDir);
		for (const skipped of summary.skippedFiles) this.warn(`Skipping unrecognized file: ${skipped}`);
		for (const result of summary.results) {
			const relativePath = path.relative(metadataDir, result.filePath ?? "");
			const typeInfo = result.schemaType ? ` (${result.schemaType})` : "";
			if (result.valid) this.log(`${chalk.green("PASS")}: ${relativePath}${typeInfo}`);
			else {
				this.log(`${chalk.red("FAIL")}: ${relativePath}${typeInfo}`);
				for (const error of result.errors) {
					const location = error.path && error.path !== "/" ? ` at ${error.path}` : "";
					this.log(`  ${chalk.red("ERROR")}${location}: ${error.message}`);
				}
			}
		}
		this.log(`\n${summary.validFiles}/${summary.totalFiles} file(s) valid, ${summary.totalErrors} error(s)`);
		if (summary.totalErrors > 0) this.error("Generated metadata has validation errors", { exit: 1 });
	}
};

//#endregion
export { Generate as default };