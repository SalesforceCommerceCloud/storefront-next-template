import "../logger.js";
import { t as prepareForLocalDev } from "../local-dev-setup.js";
import { i as commonFlags } from "../flags.js";
import { Command, Flags } from "@oclif/core";

//#region src/commands/prepare-local.ts
/**
* Prepare local command - prepares a storefront project for local development with file-linked packages.
*/
var PrepareLocal = class PrepareLocal extends Command {
	static description = "Prepare a storefront project for local development with file-linked packages. Converts workspace:* dependencies to file: references and patches vite.config.ts.";
	static examples = ["<%= config.bin %> <%= command.id %> -d ./my-storefront", "<%= config.bin %> <%= command.id %> -d . -s /path/to/monorepo/packages"];
	static flags = {
		...commonFlags,
		"source-packages-dir": Flags.string({
			char: "s",
			description: "Source monorepo packages directory (for default path suggestions)"
		})
	};
	async run() {
		const { flags } = await this.parse(PrepareLocal);
		await prepareForLocalDev({
			projectDirectory: flags["project-directory"],
			sourcePackagesDir: flags["source-packages-dir"]
		});
	}
};

//#endregion
export { PrepareLocal as default };