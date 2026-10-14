import { t as logger } from "../logger.js";
import "../logger2.js";
import { i as getMrtConfig, n as getDefaultBuildDir, r as getDefaultMessage } from "../utils.js";
import { a as buildMrtConfig } from "../config.js";
import { i as commonFlags, t as BUNDLE_VERSIONS } from "../flags.js";
import { n as createBundle, r as getBundleDependencies, t as toV2SsrParameters } from "../bundle-v2.js";
import { Command, Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import { createBundleV2 } from "@salesforce/b2c-tooling-sdk/operations/mrt";
import zlib from "zlib";
import { promisify } from "util";

//#region src/lib/create-bundle.ts
const gzip = promisify(zlib.gzip);
/**
* Create a bundle and save it to disk without pushing to Managed Runtime
*/
async function createBundleCommand(options) {
	if (!fs.existsSync(options.projectDirectory)) throw new Error(`Project directory "${options.projectDirectory}" does not exist!`);
	const mrtConfig = getMrtConfig(options.projectDirectory);
	const projectSlug = options.projectSlug ?? mrtConfig.defaultMrtProject;
	if (!projectSlug || projectSlug.trim() === "") throw new Error("Project slug could not be determined from CLI, .env, or package.json");
	const buildDirectory = options.buildDirectory ?? getDefaultBuildDir(options.projectDirectory);
	if (!fs.existsSync(buildDirectory)) throw new Error(`Build directory "${buildDirectory}" does not exist!`);
	const outputDirectory = options.outputDirectory ?? path.join(options.projectDirectory, ".bundle");
	await fs.ensureDir(outputDirectory);
	const message = options.message ?? getDefaultMessage(options.projectDirectory);
	const config = await buildMrtConfig(buildDirectory, options.projectDirectory);
	logger.info(`Creating ${options.bundleVersion === "2" ? "v2 " : ""}bundle for project: ${projectSlug}`);
	logger.info(`Build directory: ${buildDirectory}`);
	logger.info(`Output directory: ${outputDirectory}`);
	const bundleTgzPath = path.join(outputDirectory, "bundle.tgz");
	const bundleJsonPath = path.join(outputDirectory, "bundle.json");
	let compressedData;
	let uncompressedSize;
	let bundleMetadata;
	if (options.bundleVersion === "2") {
		const bundle = await createBundleV2({
			message,
			ssrParameters: toV2SsrParameters(config.ssrParameters),
			ssrOnly: config.ssrOnly,
			ssrShared: config.ssrShared,
			bundleMetadata: { dependencies: getBundleDependencies(options.projectDirectory) },
			buildDirectory,
			projectDirectory: path.resolve(options.projectDirectory),
			matchMode: "ignore_missing"
		});
		compressedData = bundle.archive;
		bundleMetadata = {
			message: bundle.message,
			root_dir: bundle.rootDir,
			config_path: bundle.configPath,
			match_mode: bundle.matchMode,
			config: bundle.config,
			data_size: compressedData.length
		};
	} else {
		const bundle = await createBundle({
			message,
			ssr_parameters: config.ssrParameters,
			ssr_only: config.ssrOnly,
			ssr_shared: config.ssrShared,
			buildDirectory,
			projectDirectory: options.projectDirectory,
			projectSlug
		});
		const bundleData = Buffer.from(bundle.data, "base64");
		uncompressedSize = bundleData.length;
		compressedData = await gzip(bundleData);
		bundleMetadata = {
			message: bundle.message,
			encoding: bundle.encoding,
			ssr_parameters: bundle.ssr_parameters,
			ssr_only: bundle.ssr_only,
			ssr_shared: bundle.ssr_shared,
			bundle_metadata: bundle.bundle_metadata,
			data_size: bundleData.length
		};
	}
	await fs.writeFile(bundleTgzPath, compressedData);
	await fs.writeJson(bundleJsonPath, bundleMetadata, { spaces: 2 });
	logger.info(`Bundle created successfully!`);
	logger.info(`Bundle tgz file: ${bundleTgzPath}`);
	logger.info(`Bundle metadata: ${bundleJsonPath}`);
	if (uncompressedSize !== void 0) logger.info(`Uncompressed size: ${(uncompressedSize / 1024 / 1024).toFixed(2)} MB`);
	logger.info(`Compressed size: ${(compressedData.length / 1024 / 1024).toFixed(2)} MB`);
}

//#endregion
//#region src/commands/create-bundle.ts
/**
* Create bundle command - creates an MRT bundle without pushing.
*/
var Bundle = class Bundle extends Command {
	static description = "Create an MRT bundle from the build directory without pushing";
	static examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> -d ./my-project",
		"<%= config.bin %> <%= command.id %> -o ./my-bundle",
		"<%= config.bin %> <%= command.id %> --bundle-version 2"
	];
	static flags = {
		...commonFlags,
		"build-directory": Flags.string({
			char: "b",
			description: "Build directory to bundle (default: auto-detected)"
		}),
		"output-directory": Flags.string({
			char: "o",
			description: "Output directory for bundle files (default: .bundle)"
		}),
		message: Flags.string({
			char: "m",
			description: "Bundle message (default: git branch:commit)"
		}),
		"project-slug": Flags.string({
			char: "s",
			description: "Project slug - the unique identifier for your project on Managed Runtime (default: from .env MRT_PROJECT or package.json name)"
		}),
		"bundle-version": Flags.string({
			description: "MRT bundle version. Use 1 for the legacy format and 2 for the new format. Default is 1. The SCAPI backend always uses version 2.",
			options: [...BUNDLE_VERSIONS],
			default: "1"
		})
	};
	async run() {
		const { flags } = await this.parse(Bundle);
		await createBundleCommand({
			projectDirectory: flags["project-directory"],
			buildDirectory: flags["build-directory"],
			outputDirectory: flags["output-directory"],
			message: flags.message,
			projectSlug: flags["project-slug"],
			bundleVersion: flags["bundle-version"]
		});
		this.log("Bundle created successfully!");
	}
};

//#endregion
export { Bundle as default };