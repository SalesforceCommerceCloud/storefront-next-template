import "../../package.js";
import { i as commonFlags, r as PROJECT_DIRECTORY_FLAG } from "../../flags.js";
import "../../assets.js";
import "../../catalog.js";
import "../../measured-run.js";
import { r as prepare } from "../../audit.js";
import "../../sanitize.js";
import "../../schema.js";
import "../../events.js";
import "../../live.js";
import { i as AuditCommand, t as text } from "../../flags2.js";
import { Flags } from "@oclif/core";

//#region src/commands/audit/prepare.ts
var Prepare = class Prepare extends AuditCommand {
	static hidden = true;
	static summary = "Validate catalog, inventory source, and run Playhouse collection";
	static description = "Collects Playhouse evidence for each page, builds the project for the bundle analysis, runs the rule scripts, and prints the path of the run's prepared.json. Measuring needs Playwright's Chromium; if the Playwright browser cache lacks the revision Playhouse is built for, prepare downloads it once (about 180 MB).";
	static examples = ["<%= config.bin %> <%= command.id %> --url home=https://example.com/ --url plp=https://example.com/shoes", "<%= config.bin %> <%= command.id %> -d ./my-storefront --url home=https://example.com/"];
	static flags = {
		...commonFlags,
		url: text({
			multiple: true,
			multipleNonGreedy: true,
			helpValue: "<label>=<url>",
			description: "A page to audit, such as home=https://example.com/ (repeat for each page)"
		}),
		archive: text({
			multiple: true,
			multipleNonGreedy: true,
			helpValue: "<label>=<dir>",
			description: "Reuse a completed Playhouse archive (absolute path) for the --url with this label"
		}),
		"expected-page": text({
			multiple: true,
			multipleNonGreedy: true,
			helpValue: "<label>",
			description: "A page the audit should cover (repeat; default home, plp and pdp)"
		}),
		workspace: text({
			helpValue: "<dir>",
			description: "The audit workspace (default: <project-directory>/.site-audit)"
		}),
		runs: Flags.integer({
			min: 1,
			max: Number.MAX_SAFE_INTEGER,
			default: 1,
			helpValue: "<n>",
			description: "Playhouse runs per page"
		}),
		"allow-http": Flags.boolean({ description: "Allow http:// URLs" }),
		categories: text({
			helpValue: "<dir>",
			description: "Use another categories directory; its rule scripts are not run"
		}),
		events: text({
			helpValue: "<file>",
			description: "Write progress events here instead of the run folder"
		}),
		build: Flags.boolean({
			default: true,
			allowNo: true,
			description: "Build the project (its build script, twice) to break down each page's JavaScript; rewrites the gitignored build/ folder"
		})
	};
	async run() {
		const { flags } = await this.parse(Prepare);
		this.log(await prepare({
			urls: flags.url,
			archives: flags.archive,
			expectedPages: flags["expected-page"],
			project: flags[PROJECT_DIRECTORY_FLAG],
			workspace: flags.workspace,
			runs: flags.runs,
			allowHttp: flags["allow-http"],
			categories: flags.categories,
			events: flags.events,
			build: flags.build
		}));
	}
};

//#endregion
export { Prepare as default };