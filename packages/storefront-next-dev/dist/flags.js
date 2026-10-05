import { Flags } from "@oclif/core";

//#region src/flags.ts
const PROJECT_DIRECTORY_FLAG = "project-directory";
const PROJECT_DIRECTORY_CHAR = "d";
const commonFlags = { [PROJECT_DIRECTORY_FLAG]: Flags.string({
	char: PROJECT_DIRECTORY_CHAR,
	description: "Project directory",
	default: process.cwd()
}) };
/**
* Restore the 1.x short flags on `MrtCommand.baseFlags`: `-t` for `--environment`/`--target`
* and `-o` for `--cloud-origin` (b2c-tooling-sdk 2.x moved it to `-u`).
*/
function withLegacyMrtShortFlags(baseFlags) {
	return {
		...baseFlags,
		environment: {
			...baseFlags.environment,
			charAliases: ["t"]
		},
		"cloud-origin": {
			...baseFlags["cloud-origin"],
			charAliases: ["o"]
		}
	};
}

//#endregion
export { withLegacyMrtShortFlags as i, PROJECT_DIRECTORY_FLAG as n, commonFlags as r, PROJECT_DIRECTORY_CHAR as t };