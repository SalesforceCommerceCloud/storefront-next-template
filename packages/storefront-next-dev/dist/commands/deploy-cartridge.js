import { i as SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import { CartridgeCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { createScriptsBackend, deleteCartridges, reloadCodeVersion, uploadCartridges } from "@salesforce/b2c-tooling-sdk/operations/code";

//#region src/commands/deploy-cartridge.ts
/**
* Deploy cartridge command - deploys cartridges to a B2C instance.
*
* Extends CartridgeCommand which provides:
* - All B2C instance flags (--server, --code-version, --username, --password, etc.)
* - Cartridge filtering flags (-c/--cartridge, -x/--exclude-cartridge)
* - Cartridge discovery with plugin provider support
* - Config-driven cartridge filtering via dw.json `cartridges` option
*
* Additional flags:
* - --delete: Delete existing cartridges before upload
* - --reload/-r: Reload (re-activate) code version after deploy (requires OAuth)
*
* Code version discovery and reload use SCAPI (scopes `sfcc.scripts` / `sfcc.scripts.rw`) when
* SFCC_SHORTCODE and SFCC_TENANT_ID are set with client-credentials auth, falling back to OCAPI.
* Override with --api-backend (env: SFCC_API_BACKEND): auto (default), scapi, or ocapi.
*/
var Deploy = class Deploy extends CartridgeCommand {
	static description = "Deploy cartridges to B2C Commerce Cloud instance";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --project-directory ./my-project",
		"<%= config.bin %> <%= command.id %> -s my-sandbox.dx.commercecloud.salesforce.com",
		"<%= config.bin %> <%= command.id %> --code-version staging",
		"<%= config.bin %> <%= command.id %> --delete",
		"<%= config.bin %> <%= command.id %> --delete --reload",
		"<%= config.bin %> <%= command.id %> -c app_storefrontnext_base",
		"<%= config.bin %> <%= command.id %> -x test_cartridge"
	];
	static flags = {
		...CartridgeCommand.baseFlags,
		...CartridgeCommand.cartridgeFlags,
		reload: Flags.boolean({
			char: "r",
			description: "Reload (re-activate) code version after deploy",
			default: false
		}),
		delete: Flags.boolean({
			description: "Delete existing cartridges before upload",
			default: false
		})
	};
	_scriptsBackend;
	/** SCAPI-first code version backend with OCAPI fallback, honoring --api-backend. */
	get scriptsBackend() {
		this._scriptsBackend ??= createScriptsBackend({ instance: this.instance });
		return this._scriptsBackend;
	}
	async run() {
		const { flags } = await this.parse(Deploy);
		const projectDirectory = flags["project-directory"] || process.cwd();
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory doesn't exist: ${projectDirectory}`);
		const cartridgesDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR);
		const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);
		if (!fs.existsSync(metadataDir)) this.error(`Metadata directory doesn't exist: ${metadataDir}. Run 'sfnext generate-cartridge' first.`);
		this.requireServer();
		this.requireWebDavCredentials();
		let version = this.resolvedConfig.values.codeVersion;
		if ((!version || flags.reload) && !this.hasOAuthCredentials()) {
			const reason = version ? "The --reload flag requires OAuth credentials to reload the code version via SCAPI or OCAPI." : "No code version specified. OAuth credentials are required to auto-discover the active code version.";
			this.error(`${reason}\n\nProvide --code-version to use basic auth only, or configure OAuth credentials (--client-id and --client-secret).`);
		}
		if (!version) {
			this.warn("No code version specified, discovering active code version...");
			let activeVersion;
			try {
				activeVersion = await this.scriptsBackend.getActiveCodeVersion();
			} catch (error) {
				this.error(`Failed to discover active code version: ${error instanceof Error ? error.message : String(error)}\n\nSpecify one explicitly with --code-version or in your dw.json config.`);
			}
			if (!activeVersion?.id) this.error("No active code version found. Specify one with --code-version or in your dw.json config.");
			version = activeVersion.id;
			this.instance.config.codeVersion = version;
		}
		const cartridges = await this.findCartridgesWithProviders(cartridgesDir);
		if (cartridges.length === 0) this.error(`No cartridges found in ${cartridgesDir}`);
		this.log(`Deploying to code version "${version}"...`);
		for (const c of cartridges) this.log(`  ${c.name} (${c.src})`);
		if (flags.delete) {
			this.log("Deleting existing cartridges...");
			await deleteCartridges(this.instance, cartridges);
		}
		await uploadCartridges(this.instance, cartridges);
		if (flags.reload) try {
			await reloadCodeVersion(this.scriptsBackend, version);
			this.log("Code version reloaded.");
		} catch (error) {
			this.warn(`Could not reload code version: ${error instanceof Error ? error.message : String(error)}`);
		}
		this.log(`Deployed ${cartridges.length} cartridge(s) to version "${version}" successfully!`);
	}
};

//#endregion
export { Deploy as default };