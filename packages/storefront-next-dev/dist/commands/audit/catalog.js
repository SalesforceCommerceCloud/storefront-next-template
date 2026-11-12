import "../../package.js";
import { i as commonFlags } from "../../flags.js";
import "../../results.js";
import { n as discoverCatalog, t as defaultCategoriesDir } from "../../catalog.js";
import "../../schema.js";
import { i as AuditCommand, t as text } from "../../flags2.js";

//#region src/commands/audit/catalog.ts
var Catalog = class Catalog extends AuditCommand {
	static hidden = true;
	static reportsUsage = false;
	static summary = "Inspect the discovered category and rule catalog";
	static examples = ["<%= config.bin %> <%= command.id %>"];
	static flags = {
		...commonFlags,
		categories: text({
			helpValue: "<dir>",
			description: "Read another categories directory"
		})
	};
	async run() {
		const { flags } = await this.parse(Catalog);
		this.log(JSON.stringify(await discoverCatalog(flags.categories ?? defaultCategoriesDir()), null, 2));
	}
};

//#endregion
export { Catalog as default };