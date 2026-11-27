/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import path from 'path';
import { createServer as createNodeHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createServer, initBasePathEnv } from '../server/index';
import { loadProjectConfig } from '../server/config';
import { printServerInfo, printServerConfig, printShutdownMessage } from '../utils/logger';
import { getWorkspaceHmrConfig } from '../plugins/workspace';

export interface DevOptions {
    projectDirectory?: string;
    port?: number;
}

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
function getNodeResolveConditions(): string[] {
    const conditions: string[] = [];
    const args = [...process.execArgv];
    const nodeOptions = process.env.NODE_OPTIONS ?? '';
    if (nodeOptions.trim()) {
        args.push(...nodeOptions.split(/\s+/).filter(Boolean));
    }

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg.startsWith('--conditions=')) {
            const value = arg.slice('--conditions='.length).trim();
            if (value) {
                conditions.push(value);
            }
            continue;
        }
        if (arg === '--conditions') {
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
export async function dev(options: DevOptions = {}): Promise<void> {
    const startTime = Date.now();
    const projectDir = path.resolve(options.projectDirectory || process.cwd());
    const port = options.port || 5173;

    // Set NODE_ENV to development
    process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';

    // Set MRT_ENV_BASE_PATH from config.server.ts before Vite starts, since the
    // React Router preset reads getBasePath() at config time to set the basename.
    await initBasePathEnv(projectDir);

    // Set fallback only after .env has been loaded
    process.env.EXTERNAL_DOMAIN_NAME = process.env.EXTERNAL_DOMAIN_NAME ?? `localhost:${port}`;

    const config = await loadProjectConfig(projectDir);

    // Create the HTTP server before Vite so it can be passed to the workspace
    // HMR config (which attaches the WebSocket to the same port).
    const httpServer = createNodeHttpServer();

    const hmr = getWorkspaceHmrConfig(httpServer);
    const resolveConditions = getNodeResolveConditions();

    const vite = await createViteServer({
        root: projectDir,
        ...(resolveConditions.length > 0
            ? {
                  resolve: { conditions: resolveConditions },
                  optimizeDeps: {
                      esbuildOptions: {
                          conditions: resolveConditions,
                      },
                  },
                  ssr: {
                      resolve: {
                          conditions: resolveConditions,
                          externalConditions: resolveConditions,
                      },
                  },
              }
            : {}),
        server: {
            middlewareMode: true,
            ...(hmr && { hmr }),
        },
    });

    // Create unified server in development mode
    const app = await createServer({
        mode: 'development',
        projectDirectory: projectDir,
        port,
        vite,
    });

    // Attach Express to the HTTP server and start listening
    httpServer.on('request', app);
    httpServer.listen(port, () => {
        printServerInfo('development', port, startTime, projectDir);

        // Print server configuration after startup banner
        printServerConfig({
            mode: 'development',
            port,
            enableStaticServing: false,
            enableCompression: false,
            shortCode: config.commerce.api.shortCode,
            organizationId: config.commerce.api.organizationId,
            clientId: config.commerce.api.clientId,
        });
    });

    // Graceful shutdown
    ['SIGTERM', 'SIGINT'].forEach((signal) => {
        process.once(signal, () => {
            printShutdownMessage();
            httpServer.close(() => {
                void vite.close();
                process.exit(0);
            });
        });
    });
}
