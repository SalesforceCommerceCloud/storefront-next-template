import { i as SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR, r as SFNEXT_BASE_CARTRIDGE_NAME, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import { CartridgeCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { deleteCartridges, reloadCodeVersion, uploadCartridges } from "@salesforce/b2c-tooling-sdk/operations/code";

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
* - --cartridge-ignore-dirs: Directory names to skip inside cartridges, replacing the SDK default
*   (node_modules, .git, coverage, .cache, tmp, temp)
*
* Environment variables:
* - SFCC_CARTRIDGE_IGNORE_DIRS (optional): comma-separated equivalent of --cartridge-ignore-dirs,
*   e.g. `node_modules,.git`. Also settable as `cartridge-ignore-dirs` in dw.json.
* - SFCC_DEFAULT_CLIENT (optional): `true` is equivalent to --default-client (inherited from the SDK),
*   which ignores any configured API client and uses browser sign-in.
*
* With only a server configured (no WebDAV access key or API client), or with --default-client,
* uploads sign in to Account Manager in a browser and the user's Business Manager role authorizes
* WebDAV access. --default-client cannot be combined with --reload, which needs an API client.
*
* Code version discovery and reload use SCAPI (scopes `sfcc.scripts` / `sfcc.scripts.rw`) when
* SFCC_SHORTCODE and SFCC_TENANT_ID are set with client-credentials auth, falling back to OCAPI.
* Override with --api-backend (env: SFCC_API_BACKEND): auto (default), scapi, or ocapi.
* Without an API client, the active code version is read over WebDAV; reload still needs one.
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
		}),
		"cartridge-ignore-dirs": Flags.string({
			description: "Directory names to skip inside cartridges, replacing the default list (node_modules,.git,coverage,.cache,tmp,temp); pass an empty value to skip nothing (env: SFCC_CARTRIDGE_IGNORE_DIRS)",
			multiple: true,
			multipleNonGreedy: true,
			delimiter: ","
		})
	};
	_scriptsBackend;
	/** SCAPI-first code version backend with OCAPI fallback (or WebDAV without an API client), honoring --api-backend. */
	get scriptsBackend() {
		this._scriptsBackend ??= this.createScriptsBackend();
		return this._scriptsBackend;
	}
	async run() {
		const { flags } = await this.parse(Deploy);
		const projectDirectory = flags["project-directory"] || process.cwd();
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory doesn't exist: ${projectDirectory}`);
		const cartridgesDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR);
		const { include, exclude } = this.cartridgeOptions;
		const hasCartridgeFilter = Boolean(include?.length || exclude?.length);
		const checkBaseMetadata = (directory) => {
			if (!fs.existsSync(directory)) this.error(`Metadata directory doesn't exist: ${directory}. Run 'sfnext generate-cartridge' first.`);
		};
		if (!hasCartridgeFilter) checkBaseMetadata(path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR));
		this.requireServer();
		this.requireWebDavCredentials();
		let version = this.resolvedConfig.values.codeVersion;
		if (flags.reload && !this.hasOAuthCredentials()) this.error("The --reload flag requires OAuth credentials to reload the code version via SCAPI or OCAPI.\n\nDeploy without --reload to use WebDAV only, or configure OAuth credentials (--client-id and --client-secret).");
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
		if (hasCartridgeFilter) {
			const selectedBase = cartridges.find((cartridge) => cartridge.name === SFNEXT_BASE_CARTRIDGE_NAME);
			if (selectedBase) checkBaseMetadata(path.join(selectedBase.src, "cartridge", "experience"));
		}
		this.log(`Deploying to code version "${version}"...`);
		for (const c of cartridges) this.log(`  ${c.name} (${c.src})`);
		if (flags.delete) {
			this.log("Deleting existing cartridges...");
			await deleteCartridges(this.instance, cartridges);
		}
		await uploadCartridges(this.instance, cartridges, { ignoreDirs: this.resolvedConfig.values.cartridgeIgnoreDirs });
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