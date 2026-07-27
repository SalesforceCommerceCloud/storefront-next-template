import "../../logger.js";
import "../../logger2.js";
import "../../dependency-utils.js";
import "../../format-with-project-biome.js";
import { t as createExtension } from "../../manage-extensions.js";
import { Command, Flags } from "@oclif/core";

//#region src/commands/extensions/create.ts
/**
* Create extension command - creates a new extension scaffold in a storefront project.
*/
var Create = class Create extends Command {
	static description = "Create a new extension scaffold in a storefront project";
	static examples = ["<%= config.bin %> <%= command.id %> -n \"My Extension\"", "<%= config.bin %> <%= command.id %> -p ./my-project -n \"Store Locator\" -d \"Adds store locator functionality\""];
	static flags = {
		"project-directory": Flags.string({
			char: "p",
			description: "Target project directory",
			default: process.cwd()
		}),
		name: Flags.string({
			char: "n",
			description: "Name of the extension to create (e.g., \"My Extension\")"
		}),
		description: Flags.string({
			char: "d",
			description: "Description of the extension"
		})
	};
	async run() {
		const { flags } = await this.parse(Create);
		await createExtension({
			projectDirectory: flags["project-directory"],
			name: flags.name ?? "",
			description: flags.description ?? ""
		});
	}
};

//#endregion
export { Create as default };