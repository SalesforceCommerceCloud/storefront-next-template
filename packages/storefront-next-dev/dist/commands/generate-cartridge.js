import "../logger.js";
import "../logger2.js";
import "../format-with-project-biome.js";
import { i as SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { r as commonFlags } from "../flags.js";
import { t as generateMetadata } from "../generate-cartridge.js";
import { t as validateCartridgeMetadata } from "../validate-cartridge.js";
import { Command } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";

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
	static flags = { ...commonFlags };
	async run() {
		const { flags } = await this.parse(Generate);
		const projectDirectory = flags["project-directory"];
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory doesn't exist: ${projectDirectory}`);
		const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);
		if (!fs.existsSync(metadataDir)) {
			this.log(`Creating metadata directory: ${metadataDir}`);
			fs.mkdirSync(metadataDir, { recursive: true });
		}
		this.log("Generating Page Designer metadata...");
		await generateMetadata(projectDirectory, metadataDir);
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