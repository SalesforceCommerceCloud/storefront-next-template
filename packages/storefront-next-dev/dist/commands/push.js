import "../logger.js";
import "../logger2.js";
import { n as getDefaultBuildDir, r as getDefaultMessage } from "../utils.js";
import "../format-with-project-biome.js";
import { a as buildMrtConfig, i as SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR, n as GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH, r as SFNEXT_BASE_CARTRIDGE_NAME, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { t as createBundle } from "../bundle.js";
import { t as generateMetadata } from "../generate-cartridge.js";
import { Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import { MrtCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { uploadCartridges } from "@salesforce/b2c-tooling-sdk/operations/code";
import { uploadBundle, waitForEnv } from "@salesforce/b2c-tooling-sdk/operations/mrt";
import { DEFAULT_MRT_ORIGIN, createMrtClient } from "@salesforce/b2c-tooling-sdk/clients";

//#region src/commands/push.ts
/**
* MRT Push command - builds and pushes bundle to Managed Runtime.
*
* Inherits MRT flags from MrtCommand:
* - --api-key: MRT API key (env: MRT_API_KEY, fallback: SFCC_MRT_API_KEY)
* - --project/-p: MRT project slug (env: MRT_PROJECT, fallback: SFCC_MRT_PROJECT)
* - --environment/-e: MRT target environment (env: MRT_TARGET, fallback: SFCC_MRT_ENVIRONMENT)
* - --cloud-origin: MRT cloud origin URL (env: MRT_CLOUD_ORIGIN, fallback: SFCC_MRT_CLOUD_ORIGIN)
* - --credentials-file: Path to MRT credentials file (env: MRT_CREDENTIALS_FILE)
* - --config: Path to dw.json config file (env: SFCC_CONFIG)
* - --instance/-i: Named instance from config (env: SFCC_INSTANCE)
*/
var Push = class Push extends MrtCommand {
	static description = "Build and push bundle to Managed Runtime";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --project-directory ./my-project",
		"<%= config.bin %> <%= command.id %> --project my-project --environment staging",
		"<%= config.bin %> <%= command.id %> --wait"
	];
	static flags = {
		...MrtCommand.baseFlags,
		"build-directory": Flags.string({
			char: "b",
			description: "Build directory to push (default: auto-detected)"
		}),
		message: Flags.string({
			char: "m",
			description: "Bundle message (default: git branch:commit)"
		}),
		wait: Flags.boolean({
			char: "w",
			description: "Wait for deployment to complete",
			default: false
		}),
		"project-slug": Flags.string({
			char: "s",
			description: "DEPRECATED: Use --project instead",
			hidden: true
		}),
		target: Flags.string({
			char: "t",
			description: "DEPRECATED: Use --environment instead",
			hidden: true
		})
	};
	async run() {
		const { flags } = await this.parse(Push);
		const projectDirectory = flags["project-directory"] || process.cwd();
		if (flags["project-slug"]) this.warn("Flag --project-slug is deprecated. Use --project instead.");
		if (flags.target) this.warn("Flag --target is deprecated. Use --environment instead.");
		const target = flags.environment || flags.target || this.resolvedConfig.values.mrtEnvironment;
		if (flags.wait && !target) this.error("You must provide a target environment when using --wait (via --environment flag, MRT_TARGET env var, or dw.json)");
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory "${projectDirectory}" does not exist!`);
		const projectSlug = flags.project || flags["project-slug"] || this.resolvedConfig.values.mrtProject;
		if (!projectSlug || projectSlug.trim() === "") this.error("Project slug is required. Provide --project, set MRT_PROJECT env var, or configure mrtProject in dw.json");
		const buildDirectory = flags["build-directory"] ?? getDefaultBuildDir(projectDirectory);
		if (!fs.existsSync(buildDirectory)) this.error(`Build directory "${buildDirectory}" does not exist!`);
		if (GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH) await this.generateAndDeployCartridge(projectDirectory);
		if (target) process.env.DEPLOY_TARGET = target;
		this.requireMrtCredentials();
		const config = await buildMrtConfig(buildDirectory, projectDirectory);
		const message = flags.message ?? getDefaultMessage(projectDirectory);
		this.log(`Creating bundle for project: ${projectSlug}`);
		if (target) this.log(`Target environment: ${target}`);
		const bundle = await createBundle({
			message,
			ssr_parameters: config.ssrParameters,
			ssr_only: config.ssrOnly,
			ssr_shared: config.ssrShared,
			buildDirectory,
			projectDirectory,
			projectSlug
		});
		const origin = this.resolvedConfig.values.mrtOrigin || DEFAULT_MRT_ORIGIN;
		const client = createMrtClient({ origin }, this.getMrtAuth());
		this.log(`Uploading bundle to ${origin}`);
		const result = await uploadBundle(client, projectSlug, bundle, target);
		this.log(`Bundle ${result.bundleId} uploaded`);
		const warnings = result.warnings ?? [];
		for (const w of warnings) this.warn(w);
		if (flags.wait && target) {
			this.log(`Waiting for deployment to ${target}...`);
			let lastState = "";
			await waitForEnv({
				projectSlug,
				slug: target,
				origin,
				onPoll: (info) => {
					if (info.state !== lastState) {
						lastState = info.state;
						this.log(`  ${target}: ${info.state} (${info.elapsedSeconds}s)`);
					}
				}
			}, this.getMrtAuth());
			this.log(`Deployment complete — bundle ${result.bundleId} is live on ${target}`);
		}
	}
	/**
	* Generate and deploy cartridge metadata to B2C instance.
	* This is a pre-MRT-push step that ensures Page Designer metadata is current.
	*/
	async generateAndDeployCartridge(projectDirectory) {
		const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);
		try {
			this.log("Generating cartridge metadata before MRT push...");
			if (!fs.existsSync(metadataDir)) fs.mkdirSync(metadataDir, { recursive: true });
			await generateMetadata(projectDirectory, metadataDir);
			this.log("Cartridge metadata generated successfully!");
			this.log("Deploying cartridge to Commerce Cloud...");
			if (!this.resolvedConfig.hasB2CInstanceConfig()) {
				this.warn("B2C instance not configured, skipping cartridge deployment");
				return;
			}
			if (!this.resolvedConfig.values.codeVersion) {
				this.warn("Code version not configured, skipping cartridge deployment");
				return;
			}
			await uploadCartridges(this.resolvedConfig.createB2CInstance(), [{
				name: SFNEXT_BASE_CARTRIDGE_NAME,
				src: path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_NAME),
				dest: SFNEXT_BASE_CARTRIDGE_NAME
			}]);
			this.log("Cartridge deployed successfully!");
		} catch (cartridgeError) {
			this.warn(`Failed to generate or deploy cartridge: ${cartridgeError.message}`);
		}
	}
};

//#endregion
export { Push as default };