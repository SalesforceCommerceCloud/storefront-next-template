import { i as SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { i as commonFlags } from "../flags.js";
import { t as validateCartridgeMetadata } from "../validate-cartridge.js";
import { Command } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";

//#region src/commands/validate-cartridge.ts
/**
* Validate cartridge metadata command.
*
* Validates all Page Designer metadata JSON files in the cartridge
* directory against their metadefinition schemas.
*/
var ValidateCartridge = class ValidateCartridge extends Command {
	static description = "Validate Page Designer metadata JSON files against schemas";
	static examples = ["<%= config.bin %> <%= command.id %>", "<%= config.bin %> <%= command.id %> -d ./my-project"];
	static flags = { ...commonFlags };
	async run() {
		const { flags } = await this.parse(ValidateCartridge);
		const projectDirectory = flags["project-directory"];
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory doesn't exist: ${projectDirectory}`);
		const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);
		if (!fs.existsSync(metadataDir)) this.error(`Metadata directory doesn't exist: ${metadataDir}\nRun "sfnext generate-cartridge" first to generate metadata files.`);
		this.log("Validating Page Designer metadata...\n");
		const summary = await validateCartridgeMetadata(metadataDir);
		if (summary.totalFiles === 0) {
			this.warn("No metadata files found to validate.");
			return;
		}
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
		if (summary.totalErrors > 0) this.error("Validation failed", { exit: 1 });
	}
};

//#endregion
export { ValidateCartridge as default };