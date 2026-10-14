import { Flags } from "@oclif/core";

//#region src/flags.ts
const PROJECT_DIRECTORY_FLAG = "project-directory";
const PROJECT_DIRECTORY_CHAR = "d";
const commonFlags = { [PROJECT_DIRECTORY_FLAG]: Flags.string({
	char: PROJECT_DIRECTORY_CHAR,
	description: "Project directory",
	default: process.cwd()
}) };
/** Supported MRT bundle format versions for `--bundle-version`. Add new versions here. */
const BUNDLE_VERSIONS = ["1", "2"];
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
export { withLegacyMrtShortFlags as a, commonFlags as i, PROJECT_DIRECTORY_CHAR as n, PROJECT_DIRECTORY_FLAG as r, BUNDLE_VERSIONS as t };