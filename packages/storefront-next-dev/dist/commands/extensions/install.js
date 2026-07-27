import "../../logger.js";
import "../../logger2.js";
import "../../dependency-utils.js";
import "../../format-with-project-biome.js";
import { r as commonFlags } from "../../flags.js";
import { r as manageExtensions } from "../../manage-extensions.js";
import { Command, Flags } from "@oclif/core";

//#region src/commands/extensions/install.ts
const DEFAULT_TEMPLATE_GIT_URL = process.env.DEFAULT_TEMPLATE_GIT_URL || "https://github.com/SalesforceCommerceCloud/storefront-next-template.git";
/**
* Install extension command - installs an extension into a storefront project.
*/
var Install = class Install extends Command {
	static description = "Install an extension into a storefront project";
	static examples = ["<%= config.bin %> <%= command.id %> -e SFDC_EXT_STORE_LOCATOR", "<%= config.bin %> <%= command.id %> -d ./my-project -e SFDC_EXT_BOPIS"];
	static flags = {
		...commonFlags,
		extension: Flags.string({
			char: "e",
			description: "Extension marker value (e.g. SFDC_EXT_STORE_LOCATOR)"
		}),
		"source-git-url": Flags.string({
			char: "s",
			description: "Git URL of the source template project",
			default: DEFAULT_TEMPLATE_GIT_URL
		})
	};
	async run() {
		const { flags } = await this.parse(Install);
		await manageExtensions({
			projectDirectory: flags["project-directory"],
			install: true,
			extensions: flags.extension ? [flags.extension] : void 0,
			sourceGitUrl: flags["source-git-url"]
		});
	}
};

//#endregion
export { Install as default };