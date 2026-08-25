import "../../logger.js";
import "../../logger2.js";
import "../../dependency-utils.js";
import "../../format-with-project-biome.js";
import { r as commonFlags } from "../../flags.js";
import { r as manageExtensions } from "../../manage-extensions.js";
import { Command, Flags } from "@oclif/core";

//#region src/commands/extensions/remove.ts
/**
* Remove extension command - removes one or more extensions from a storefront project.
*/
var Remove = class Remove extends Command {
	static description = "Remove one or more installed extensions from a storefront project";
	static examples = ["<%= config.bin %> <%= command.id %> -e SFDC_EXT_STORE_LOCATOR", "<%= config.bin %> <%= command.id %> -e SFDC_EXT_STORE_LOCATOR,SFDC_EXT_BOPIS"];
	static flags = {
		...commonFlags,
		extensions: Flags.string({
			char: "e",
			description: "Comma-separated list of extension marker values (e.g. SFDC_EXT_STORE_LOCATOR,SFDC_EXT_BOPIS)"
		}),
		yes: Flags.boolean({
			description: "Confirm uninstalling dependent extensions without prompting",
			default: false
		})
	};
	async run() {
		const { flags } = await this.parse(Remove);
		const extensions = flags.extensions ? flags.extensions.split(",").map((e) => e.trim()) : void 0;
		await manageExtensions({
			projectDirectory: flags["project-directory"],
			uninstall: true,
			extensions,
			yes: flags.yes
		});
	}
};

//#endregion
export { Remove as default };