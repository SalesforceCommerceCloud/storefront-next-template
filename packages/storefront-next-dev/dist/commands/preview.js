import { i as printShutdownMessage, n as printServerConfig, r as printServerInfo, t as logger } from "../logger.js";
import "../logger2.js";
import { i as loadProjectConfig, n as initBasePathEnv, r as getCommerceCloudApiUrl, t as createServer } from "../server.js";
import "../config.js";
import { i as commonFlags } from "../flags.js";
import { Command, Flags } from "@oclif/core";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

//#region src/lib/preview.ts
/**
* Start the preview server with production build
*/
async function preview(options = {}) {
	process.setSourceMapsEnabled(true);
	process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" ");
	const startTime = Date.now();
	const projectDir = path.resolve(options.projectDirectory || process.cwd());
	const port = options.port || 3e3;
	process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
	process.env.EXTERNAL_DOMAIN_NAME = process.env.EXTERNAL_DOMAIN_NAME ?? `localhost:${port}`;
	await initBasePathEnv(projectDir);
	const buildPath = path.join(projectDir, "build", "server", "index.js");
	if (!fs.existsSync(buildPath)) {
		logger.warn("Production build not found. Building project...");
		logger.info("Running: pnpm build");
		try {
			execSync("pnpm build", {
				cwd: projectDir,
				stdio: "inherit"
			});
			logger.info("Build completed successfully");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Build failed: ${errorMsg}`);
			process.exit(1);
		}
		if (!fs.existsSync(buildPath)) {
			logger.error(`Build still not found at ${buildPath} after running build command`);
			process.exit(1);
		}
	}
	logger.info(`Loading production build from ${buildPath}`);
	const build = (await import(pathToFileURL(buildPath).href)).default;
	const config = await loadProjectConfig(projectDir);
	const server = (await createServer({
		mode: "preview",
		projectDirectory: projectDir,
		config,
		port,
		build
	})).listen(port, () => {
		printServerInfo("preview", port, startTime, projectDir);
		printServerConfig({
			mode: "preview",
			port,
			enableProxy: true,
			enableStaticServing: true,
			enableCompression: true,
			proxyPath: config.commerce.api.proxy,
			proxyHost: getCommerceCloudApiUrl(config.commerce.api.shortCode),
			shortCode: config.commerce.api.shortCode,
			organizationId: config.commerce.api.organizationId,
			clientId: config.commerce.api.clientId
		});
	});
	["SIGTERM", "SIGINT"].forEach((signal) => {
		process.once(signal, () => {
			printShutdownMessage();
			server?.close(() => {
				process.exit(0);
			});
		});
	});
}

//#endregion
//#region src/commands/preview.ts
/**
* Preview server command - starts the preview server with production build.
*/
var Preview = class Preview extends Command {
	static description = "Start preview server with production build (auto-builds if needed)";
	static examples = ["<%= config.bin %> <%= command.id %>", "<%= config.bin %> <%= command.id %> -d ./my-project -p 4000"];
	static flags = {
		...commonFlags,
		port: Flags.integer({
			char: "p",
			description: "Port number (default: 3000)"
		})
	};
	async run() {
		const { flags } = await this.parse(Preview);
		await preview({
			projectDirectory: flags["project-directory"],
			port: flags.port
		});
	}
};

//#endregion
export { Preview as default };