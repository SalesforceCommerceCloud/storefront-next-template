import { i as printShutdownMessage, n as printServerConfig, r as printServerInfo } from "../logger.js";
import "../logger2.js";
import { i as loadProjectConfig, n as initBasePathEnv, r as getCommerceCloudApiUrl, t as createServer$2 } from "../server.js";
import "../config.js";
import { i as commonFlags } from "../flags.js";
import { Command, Flags } from "@oclif/core";
import path from "path";
import { createServer } from "node:http";
import { createServer as createServer$1 } from "vite";

//#region src/plugins/workspace.ts
/**
* Returns workspace-specific HMR configuration when running behind a workspace proxy.
*
* In workspace environments the OAuth2 proxy for the dev server's port is already
* authenticated, so routing HMR WebSocket through the same HTTP server means it
* shares the same proxy port and OAuth2 session. A separate port (e.g. port-8000)
* would require its own OAuth2 login and return a 302 redirect that WebSocket
* clients cannot follow.
*
* This is exported separately from the plugin because it requires the `httpServer`
* reference created in `dev.ts`.
*
* @param httpServer - The Node HTTP server to attach the HMR WebSocket to.
*
* Environment variables:
* - `EXTERNAL_DOMAIN_NAME` — The external hostname for the workspace proxy.
*    When it does not start with "localhost", workspace proxy mode is assumed.
*/
function getWorkspaceHmrConfig(httpServer) {
	const externalDomain = process.env.EXTERNAL_DOMAIN_NAME;
	if (!externalDomain || externalDomain.startsWith("localhost")) return void 0;
	return {
		protocol: "wss",
		host: externalDomain,
		clientPort: 443,
		server: httpServer
	};
}

//#endregion
//#region src/lib/dev.ts
/**
* Resolve Node.js custom export conditions from process arguments.
*
* Reads both `process.execArgv` and `NODE_OPTIONS` so conditions passed through
* wrapper CLIs are still applied to Vite and SSR resolution.
*
* Environment variables:
* - `NODE_OPTIONS` (optional): Node runtime flags that may include one or more
*   `--conditions` entries.
*
* @returns Ordered, de-duplicated list of `--conditions` values.
*/
function getNodeResolveConditions() {
	const conditions = [];
	const args = [...process.execArgv];
	const nodeOptions = process.env.NODE_OPTIONS ?? "";
	if (nodeOptions.trim()) args.push(...nodeOptions.split(/\s+/).filter(Boolean));
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg.startsWith("--conditions=")) {
			const value = arg.slice(13).trim();
			if (value) conditions.push(value);
			continue;
		}
		if (arg === "--conditions") {
			const value = args[i + 1]?.trim();
			if (value) {
				conditions.push(value);
				i += 1;
			}
		}
	}
	return [...new Set(conditions)];
}
/**
* Start the development server with Vite in middleware mode
*/
async function dev(options = {}) {
	const startTime = Date.now();
	const projectDir = path.resolve(options.projectDirectory || process.cwd());
	const port = options.port || 5173;
	process.env.NODE_ENV = process.env.NODE_ENV ?? "development";
	await initBasePathEnv(projectDir);
	process.env.EXTERNAL_DOMAIN_NAME = process.env.EXTERNAL_DOMAIN_NAME ?? `localhost:${port}`;
	const config = await loadProjectConfig(projectDir);
	const httpServer = createServer();
	const hmr = getWorkspaceHmrConfig(httpServer);
	const resolveConditions = getNodeResolveConditions();
	const vite = await createServer$1({
		root: projectDir,
		...resolveConditions.length > 0 ? {
			resolve: { conditions: resolveConditions },
			optimizeDeps: { esbuildOptions: { conditions: resolveConditions } },
			ssr: { resolve: {
				conditions: resolveConditions,
				externalConditions: resolveConditions
			} }
		} : {},
		server: {
			middlewareMode: true,
			...hmr && { hmr }
		}
	});
	const app = await createServer$2({
		mode: "development",
		projectDirectory: projectDir,
		config,
		port,
		vite
	});
	httpServer.on("request", app);
	httpServer.listen(port, () => {
		printServerInfo("development", port, startTime, projectDir);
		printServerConfig({
			mode: "development",
			port,
			enableProxy: true,
			enableStaticServing: false,
			enableCompression: false,
			proxyPath: config.commerce.api.proxy,
			proxyHost: getCommerceCloudApiUrl(config.commerce.api.shortCode, config.commerce.api.proxyHost),
			shortCode: config.commerce.api.shortCode,
			organizationId: config.commerce.api.organizationId,
			clientId: config.commerce.api.clientId
		});
	});
	["SIGTERM", "SIGINT"].forEach((signal) => {
		process.once(signal, () => {
			printShutdownMessage();
			httpServer.close(() => {
				vite.close();
				process.exit(0);
			});
		});
	});
}

//#endregion
//#region src/commands/dev.ts
/**
* Dev server command - starts the Vite development server with SSR.
*/
var Dev = class Dev extends Command {
	static description = "Start Vite development server with SSR";
	static examples = ["<%= config.bin %> <%= command.id %>", "<%= config.bin %> <%= command.id %> -d ./my-project -p 3000"];
	static flags = {
		...commonFlags,
		port: Flags.integer({
			char: "p",
			description: "Port number (default: 5173)"
		})
	};
	async run() {
		const { flags } = await this.parse(Dev);
		await dev({
			projectDirectory: flags["project-directory"],
			port: flags.port
		});
	}
};

//#endregion
export { Dev as default };