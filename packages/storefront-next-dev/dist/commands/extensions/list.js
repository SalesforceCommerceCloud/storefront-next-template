import "../../logger.js";
import "../../logger2.js";
import "../../dependency-utils.js";
import "../../format-with-project-biome.js";
import { r as commonFlags } from "../../flags.js";
import { n as listExtensions } from "../../manage-extensions.js";
import { Command } from "@oclif/core";

//#region src/commands/extensions/list.ts
/**
* List extensions command - lists all installed extensions in a storefront project.
*/
var List = class List extends Command {
	static description = "List all installed extensions in a storefront project";
	static examples = ["<%= config.bin %> <%= command.id %>", "<%= config.bin %> <%= command.id %> -d ./my-project"];
	static flags = { ...commonFlags };
	async run() {
		const { flags } = await this.parse(List);
		listExtensions({ projectDirectory: flags["project-directory"] });
	}
};

//#endregion
export { List as default };