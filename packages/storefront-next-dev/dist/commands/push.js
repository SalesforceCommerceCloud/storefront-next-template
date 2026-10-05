import "../logger.js";
import "../logger2.js";
import { n as getDefaultBuildDir, r as getDefaultMessage } from "../utils.js";
import "../format-with-project-biome.js";
import { a as buildMrtConfig, i as SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR, n as GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH, r as SFNEXT_BASE_CARTRIDGE_NAME, t as CARTRIDGES_BASE_DIR } from "../config.js";
import { i as withLegacyMrtShortFlags } from "../flags.js";
import { n as getBundleDependencies, t as createBundle } from "../bundle.js";
import { t as generateMetadata } from "../generate-cartridge.js";
import { Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import { MrtCommand } from "@salesforce/b2c-tooling-sdk/cli";
import { uploadCartridges } from "@salesforce/b2c-tooling-sdk/operations/code";
import { createBundleV2, createDeploymentScapi, mrtScapiUnavailableMessage, runMrtWithFallback, uploadBundle, uploadBundleScapi, waitForDeploymentScapi, waitForEnv } from "@salesforce/b2c-tooling-sdk/operations/mrt";
import { DEFAULT_MRT_ORIGIN, createMrtClient } from "@salesforce/b2c-tooling-sdk/clients";

//#region src/commands/push.ts
/** config.server.ts SSR parameter keys and their v2 bundle (PascalCase) equivalents. */
const V2_SSR_PARAMETER_KEYS = {
	ssrFunctionNodeVersion: "SSRFunctionNodeVersion",
	envBasePath: "EnvBasePath"
};
/** Rename known camelCase SSR parameters to the PascalCase keys the v2 bundle config expects. */
function toV2SsrParameters(params) {
	return Object.fromEntries(Object.entries(params).map(([key, value]) => [V2_SSR_PARAMETER_KEYS[key] ?? key, value]));
}
/**
* MRT Push command - builds and pushes bundle to Managed Runtime.
*
* Inherits MRT flags from MrtCommand:
* - --api-key: MRT API key (env: MRT_API_KEY, fallback: SFCC_MRT_API_KEY)
* - --project/-p (alias --storefront/-s): MRT project slug (env: MRT_PROJECT, fallback: SFCC_MRT_PROJECT)
* - --environment/-e (aliases --target, -t): MRT target environment (env: MRT_ENVIRONMENT, fallbacks: SFCC_MRT_ENVIRONMENT, MRT_TARGET)
* - --cloud-origin/-u (alias -o): MRT cloud origin URL (env: MRT_CLOUD_ORIGIN, fallback: SFCC_MRT_CLOUD_ORIGIN)
* - --credentials-file/-c: Path to MRT credentials file (env: MRT_CREDENTIALS_FILE)
* - --mrt-backend: legacy (default), scapi, or auto (env: MRT_BACKEND, fallback: SFCC_MRT_BACKEND)
* - --config: Path to dw.json config file (env: SFCC_CONFIG)
* - --instance/-i: Named instance from config (env: SFCC_INSTANCE)
*
* The SCAPI backend (Storefront Deployments API) additionally reads OAuth flags/env:
* SFCC_CLIENT_ID, SFCC_CLIENT_SECRET (client credentials), SFCC_SHORTCODE, SFCC_TENANT_ID.
*/
var Push = class Push extends MrtCommand {
	static description = "Build and push bundle to Managed Runtime";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --project-directory ./my-project",
		"<%= config.bin %> <%= command.id %> --project my-project --environment staging",
		"<%= config.bin %> <%= command.id %> --wait",
		"<%= config.bin %> <%= command.id %> --mrt-backend scapi --environment staging --wait"
	];
	static flags = {
		...withLegacyMrtShortFlags(MrtCommand.baseFlags),
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
			description: "DEPRECATED: Use --project instead",
			hidden: true
		})
	};
	async run() {
		const { flags } = await this.parse(Push);
		const projectDirectory = path.resolve(flags["project-directory"] || process.cwd());
		if (flags["project-slug"]) this.warn("Flag --project-slug is deprecated. Use --project instead.");
		const target = flags.environment || this.resolvedConfig.values.mrtEnvironment;
		if (flags.wait && !target) this.error("You must provide a target environment when using --wait (via --environment flag, MRT_ENVIRONMENT env var, or dw.json)");
		if (!fs.existsSync(projectDirectory)) this.error(`Project directory "${projectDirectory}" does not exist!`);
		const projectSlug = flags.project || flags["project-slug"] || this.resolvedConfig.values.mrtProject;
		if (!projectSlug || projectSlug.trim() === "") this.error("Project slug is required. Provide --project, set MRT_PROJECT env var, or configure mrtProject in dw.json");
		const buildDirectory = flags["build-directory"] ?? getDefaultBuildDir(projectDirectory);
		if (!fs.existsSync(buildDirectory)) this.error(`Build directory "${buildDirectory}" does not exist!`);
		if (GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH) await this.generateAndDeployCartridge(projectDirectory);
		if (target) process.env.DEPLOY_TARGET = target;
		const { preference, scapiConnection, legacyAuth } = this.getMrtBackendContext();
		const config = await buildMrtConfig(buildDirectory, projectDirectory);
		const message = flags.message ?? getDefaultMessage(projectDirectory);
		this.log(`Creating bundle for project: ${projectSlug}`);
		if (target) this.log(`Target environment: ${target}`);
		const pushOptions = {
			message,
			config,
			buildDirectory,
			projectDirectory,
			projectSlug,
			target
		};
		const { value: result } = await runMrtWithFallback({
			preference,
			hasScapiConfig: Boolean(scapiConnection),
			canFallbackToLegacy: Boolean(legacyAuth),
			onFallback: (reason) => this.warn(`SCAPI MRT backend unavailable, using legacy MRT API: ${reason}`),
			onResolve: (backend) => this.logger.debug({ backend }, "[MRT] Pushing bundle via backend")
		}, {
			scapi: () => this.pushScapi(scapiConnection, pushOptions),
			legacy: () => this.pushLegacy(pushOptions)
		});
		this.log(`Bundle ${result.bundleId} uploaded`);
		for (const w of result.warnings) this.warn(w);
		if (flags.wait && target) {
			this.log(`Waiting for deployment to ${target}...`);
			if (result.backend === "scapi") {
				if (!scapiConnection || !result.deploymentId) {
					this.warn("SCAPI did not return a deployment ID; cannot wait for the deployment to complete.");
					return;
				}
				await waitForDeploymentScapi(scapiConnection, {
					storefrontId: projectSlug,
					environmentId: target,
					deploymentId: result.deploymentId,
					onPoll: (info) => this.log(`  ${target}: ${info.status} (${info.elapsedSeconds}s)`)
				});
			} else await this.waitLegacy(projectSlug, target);
			this.log(`Deployment complete — bundle ${result.bundleId} is live on ${target}`);
		}
	}
	supportsScapiMrt() {
		return true;
	}
	/** Upload a v1 bundle through the legacy MRT Cloud API (API key auth). */
	async pushLegacy(options) {
		const { message, config, buildDirectory, projectDirectory, projectSlug, target } = options;
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
		return {
			backend: "legacy",
			bundleId: result.bundleId,
			warnings: result.warnings ?? []
		};
	}
	/**
	* Upload a v2 bundle through the SCAPI Storefront Deployments API (OAuth), then
	* deploy it when a target is given (the SCAPI upload endpoint is upload-only).
	*/
	async pushScapi(conn, options) {
		if (!conn) throw new Error(mrtScapiUnavailableMessage());
		const { message, config, buildDirectory, projectDirectory, projectSlug, target } = options;
		const bundle = await createBundleV2({
			message,
			ssrParameters: toV2SsrParameters(config.ssrParameters),
			ssrOnly: config.ssrOnly,
			ssrShared: config.ssrShared,
			bundleMetadata: { dependencies: getBundleDependencies(projectDirectory) },
			buildDirectory,
			projectDirectory,
			matchMode: "ignore_missing"
		});
		this.log(`Uploading bundle via SCAPI (${conn.shortCode})`);
		const uploaded = await uploadBundleScapi(conn, {
			storefrontId: projectSlug,
			bundle
		});
		if (!target) return {
			backend: "scapi",
			bundleId: uploaded.bundleId,
			warnings: uploaded.warnings
		};
		try {
			const deployment = await createDeploymentScapi(conn, {
				storefrontId: projectSlug,
				environmentId: target,
				bundleId: uploaded.bundleId
			});
			return {
				backend: "scapi",
				bundleId: uploaded.bundleId,
				warnings: uploaded.warnings,
				deploymentId: deployment.deploymentId
			};
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(`Bundle ${uploaded.bundleId} uploaded but the deployment to ${target} failed: ${reason}`);
		}
	}
	async waitLegacy(projectSlug, target) {
		let lastState = "";
		await waitForEnv({
			projectSlug,
			slug: target,
			origin: this.resolvedConfig.values.mrtOrigin || DEFAULT_MRT_ORIGIN,
			onPoll: (info) => {
				if (info.state !== lastState) {
					lastState = info.state;
					this.log(`  ${target}: ${info.state} (${info.elapsedSeconds}s)`);
				}
			}
		}, this.getMrtAuth());
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