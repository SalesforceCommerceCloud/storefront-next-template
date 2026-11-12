import "../../package.js";
import { i as commonFlags } from "../../flags.js";
import "../../results.js";
import "../../schema.js";
import { i as AuditCommand, n as workspaceFlag, r as workspaceFor, t as text } from "../../flags2.js";
import { Flags } from "@oclif/core";
import path from "node:path";
import { spawn } from "node:child_process";

//#region src/commands/audit/serve.ts
var Serve = class Serve extends AuditCommand {
	static hidden = true;
	static reportsUsage = false;
	static summary = "Serve the dashboard for a finalized audit-result.json or a live run";
	static examples = ["<%= config.bin %> <%= command.id %> -d ./my-storefront --no-open"];
	static flags = {
		...commonFlags,
		workspace: workspaceFlag("An audit workspace: follow its latest run live, and list earlier runs", { exclusive: ["input"] }),
		input: text({
			exclusive: ["workspace"],
			helpValue: "<file>",
			description: "A finished audit-result.json, served on its own"
		}),
		port: Flags.integer({
			min: 1,
			max: 65535,
			default: 8787,
			helpValue: "<n>",
			description: "The port to listen on"
		}),
		open: Flags.boolean({
			default: true,
			allowNo: true,
			description: "Open the dashboard in a browser"
		}),
		ui: text({
			helpValue: "<dir>",
			description: "Serve another built UI directory"
		})
	};
	async run() {
		const { flags } = await this.parse(Serve);
		const source = flags.input === void 0 ? { workspace: workspaceFor(flags) } : { input: path.resolve(flags.input) };
		const { startServer } = await import("../../server2.js");
		const { url } = await startServer({
			...source,
			uiDir: flags.ui === void 0 ? void 0 : path.resolve(flags.ui),
			port: flags.port
		});
		this.log(`Site audit dashboard: ${url}`);
		if (flags.open) openBrowser(url);
	}
};
function openBrowser(url) {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		spawn(command, [url], {
			stdio: "ignore",
			detached: true,
			shell: process.platform === "win32"
		}).unref();
	} catch {}
}

//#endregion
export { Serve as default };