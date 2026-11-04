import { r as PROJECT_DIRECTORY_FLAG } from "./flags.js";
import { n as sanitizeText } from "./sanitize.js";
import { Command, Errors, Flags } from "@oclif/core";
import path from "node:path";

//#region src/audit/command.ts
/** Base for the audit commands: an error's message is sanitized before oclif prints it, so a token in a `--url` stays out of the terminal. */
var AuditCommand = class extends Command {
	async catch(error) {
		error.message = sanitizeText(error.message);
		return super.catch(error);
	}
};

//#endregion
//#region src/audit/flags.ts
/** A string flag that rejects an empty value (`--workspace ""` or `--workspace=`) instead of treating it as the
* current directory. Like oclif's own parse errors, it exits 2. */
const text = Flags.custom({ parse(value) {
	return value ? Promise.resolve(value) : Promise.reject(new Errors.CLIError("needs a value", { exit: 2 }));
} });
/** `--workspace`, for the verbs that act on an existing workspace. */
const workspaceFlag = (description, options = {}) => text({
	...options,
	helpValue: "<dir>",
	description: `${description} (default: <project-directory>/.site-audit)`
});
/** The audit workspace: `--workspace`, else `.site-audit` in the project directory. */
function workspaceFor(flags) {
	return path.resolve(flags.workspace ?? path.join(flags[PROJECT_DIRECTORY_FLAG], ".site-audit"));
}

//#endregion
export { AuditCommand as i, workspaceFlag as n, workspaceFor as r, text as t };