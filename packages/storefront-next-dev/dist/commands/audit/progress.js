import "../../package.js";
import { i as commonFlags } from "../../flags.js";
import "../../assets.js";
import "../../catalog.js";
import "../../measured-run.js";
import { t as eventsFileFor } from "../../audit.js";
import "../../sanitize.js";
import "../../schema.js";
import { a as progressEventSchema, t as appendEvent, y as latestRunDir } from "../../events.js";
import "../../live.js";
import { i as AuditCommand, n as workspaceFlag, r as workspaceFor, t as text } from "../../flags2.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";

//#region src/commands/audit/progress.ts
var Progress = class Progress extends AuditCommand {
	static hidden = true;
	static summary = "Append one live-progress event to the run event log";
	static examples = ["<%= config.bin %> <%= command.id %> --event '{\"type\":\"log\",\"level\":\"info\",\"message\":\"Checking SEO rules\"}'"];
	static flags = {
		...commonFlags,
		workspace: workspaceFlag("The audit workspace; the event goes to its latest run"),
		event: text({
			required: true,
			helpValue: "<json>",
			description: "The event, as a JSON object (not run.start, run.error or run.complete)"
		}),
		events: text({
			helpValue: "<file>",
			description: "Append to this file instead of the latest run"
		})
	};
	async run() {
		const { flags } = await this.parse(Progress);
		let payload;
		try {
			payload = JSON.parse(flags.event);
		} catch (error) {
			throw new Error("--event must be a JSON object", { cause: error });
		}
		const type = typeof payload === "object" && payload !== null ? payload.type : void 0;
		if (typeof type === "string" && type.startsWith("run.")) throw new Error(`--event cannot be ${type}; prepare and finalize write the run events`);
		const event = progressEventSchema.parse(payload);
		const eventsFile = flags.events === void 0 ? eventsFileFor(void 0, await latestRunDir(workspaceFor(flags))) : path.resolve(flags.events);
		await mkdir(path.dirname(eventsFile), { recursive: true });
		await appendEvent(eventsFile, event);
	}
};

//#endregion
export { Progress as default };