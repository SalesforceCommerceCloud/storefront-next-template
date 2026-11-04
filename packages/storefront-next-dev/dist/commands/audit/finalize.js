import "../../package.js";
import { i as commonFlags } from "../../flags.js";
import "../../assets.js";
import "../../catalog.js";
import "../../measured-run.js";
import { n as finalize } from "../../audit.js";
import "../../sanitize.js";
import "../../schema.js";
import "../../events.js";
import "../../live.js";
import { i as AuditCommand, n as workspaceFlag, r as workspaceFor, t as text } from "../../flags2.js";

//#region src/commands/audit/finalize.ts
var Finalize = class Finalize extends AuditCommand {
	static hidden = true;
	static summary = "Merge script results and ai-analysis/ into audit-result.json";
	static description = "Validates the latest run's ai-analysis/ files, writes its audit-result.json, and prints its path. A failed finalize can be fixed and run again.";
	static examples = ["<%= config.bin %> <%= command.id %> -d ./my-storefront"];
	static flags = {
		...commonFlags,
		workspace: workspaceFlag("The audit workspace; its latest run is finalized"),
		categories: text({
			helpValue: "<dir>",
			description: "The categories directory prepare used"
		}),
		events: text({
			helpValue: "<file>",
			description: "Write progress events here instead of the run folder"
		})
	};
	async run() {
		const { flags } = await this.parse(Finalize);
		this.log(await finalize({
			workspace: workspaceFor(flags),
			categories: flags.categories,
			events: flags.events
		}));
	}
};

//#endregion
export { Finalize as default };