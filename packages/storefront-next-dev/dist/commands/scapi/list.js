import { i as commonFlags } from "../../flags.js";
import { a as readAllSchemaMetadata, i as isBuiltInClientKey } from "../../schema-utils.js";
import { Command } from "@oclif/core";
import { join } from "node:path";

//#region src/commands/scapi/list.ts
function entryKind(entry) {
	return entry.kind ?? (isBuiltInClientKey(entry.clientKey) ? "override" : "custom");
}
/**
* List registered SCAPI client overrides and custom APIs.
*/
var List = class List extends Command {
	static description = "List registered SCAPI client overrides and custom APIs";
	static examples = ["<%= config.bin %> <%= command.id %>", "<%= config.bin %> <%= command.id %> -d ./my-project"];
	static flags = { ...commonFlags };
	async run() {
		const { flags } = await this.parse(List);
		const projectDir = flags["project-directory"];
		const entries = readAllSchemaMetadata(join(projectDir, "src", "scapi", "schemas"));
		if (entries.length === 0) {
			this.log("No SCAPI client overrides or custom APIs registered.");
			this.log("Use `sfnext scapi add` to add one.");
			return;
		}
		const overrides = entries.filter((e) => entryKind(e) === "override");
		const customs = entries.filter((e) => entryKind(e) === "custom");
		this.log(`\nRegistered SCAPI clients (${entries.length}):`);
		if (overrides.length > 0) {
			this.log(`\nOverrides (${overrides.length}):\n`);
			for (const e of overrides) this.printEntry(e);
		}
		if (customs.length > 0) {
			this.log(`\nCustom APIs (${customs.length}):\n`);
			for (const e of customs) this.printEntry(e);
		}
	}
	printEntry({ clientKey, basePath, supportsLocale, schemaName }) {
		this.log(`  ${clientKey}`);
		this.log(`    Schema:  schemas/${schemaName}.yaml`);
		this.log(`    Base:    ${basePath}`);
		this.log(`    Locale:  ${supportsLocale ? "yes" : "no"}`);
		this.log("");
	}
};

//#endregion
export { List as default };