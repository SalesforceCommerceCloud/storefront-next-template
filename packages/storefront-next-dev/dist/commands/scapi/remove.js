import { i as commonFlags } from "../../flags.js";
import { a as readAllSchemaMetadata } from "../../schema-utils.js";
import { t as generateCustomClientsFile } from "../../generate-custom-clients.js";
import { Args, Command } from "@oclif/core";
import { existsSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

//#region src/commands/scapi/remove.ts
/**
* Remove a registered custom SCAPI client.
*/
var Remove = class Remove extends Command {
	static description = "Remove a registered custom SCAPI client";
	static examples = ["<%= config.bin %> <%= command.id %> loyalty", "<%= config.bin %> <%= command.id %> myCustomApi -d ./my-project"];
	static args = { name: Args.string({
		description: "Client key name to remove (e.g., \"loyalty\" or \"storeInventory\")",
		required: true
	}) };
	static flags = { ...commonFlags };
	async run() {
		const { args, flags } = await this.parse(Remove);
		const projectDir = flags["project-directory"];
		const clientKey = args.name;
		const scapiDir = join(projectDir, "src", "scapi");
		const schemasDir = join(scapiDir, "schemas");
		const generatedDir = join(scapiDir, "generated");
		const entry = readAllSchemaMetadata(schemasDir).find((e) => e.clientKey === clientKey);
		if (!entry) this.error(`No registered client found with key "${clientKey}". Run \`sfnext scapi list\` to see registered clients.`);
		const { schemaName } = entry;
		for (const ext of [
			".yaml",
			".yml",
			".json"
		]) {
			const schemaPath = join(schemasDir, `${schemaName}${ext}`);
			if (existsSync(schemaPath)) {
				unlinkSync(schemaPath);
				this.log(`Removed ${relative(projectDir, schemaPath)}`);
			}
		}
		const metaPath = join(schemasDir, `${schemaName}.meta.json`);
		if (existsSync(metaPath)) unlinkSync(metaPath);
		const typesPath = join(generatedDir, `${schemaName}.ts`);
		const opsPath = join(generatedDir, `${schemaName}.operations.ts`);
		const namespacePath = join(generatedDir, `${schemaName}.namespace.ts`);
		for (const filePath of [
			typesPath,
			opsPath,
			namespacePath
		]) if (existsSync(filePath)) {
			unlinkSync(filePath);
			this.log(`Removed ${relative(projectDir, filePath)}`);
		}
		generateCustomClientsFile(scapiDir);
		this.log(`Updated ${relative(projectDir, join(scapiDir, "custom-clients.ts"))}`);
		this.log(`Updated ${relative(projectDir, join(scapiDir, "index.ts"))}`);
		this.log(`\nRemoved client "${clientKey}".`);
	}
};

//#endregion
export { Remove as default };