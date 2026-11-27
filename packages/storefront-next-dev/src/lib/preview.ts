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
import fs from 'fs';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';
import type { ServerBuild } from 'react-router';
import { createServer, initBasePathEnv } from '../server/index';
import { loadProjectConfig } from '../server/config';
import { logger } from '../logger';
import { printServerInfo, printServerConfig, printShutdownMessage } from '../utils/logger';

export interface ServeOptions {
    projectDirectory?: string;
    port?: number;
}

/**
 * Start the preview server with production build
 */
export async function preview(options: ServeOptions = {}): Promise<void> {
    // Enable source maps for readable stack traces in production builds.
    // Must be called before importing the build module so V8 processes sourceMappingURL comments.
    // Also set NODE_OPTIONS so the server can detect source maps are enabled and unsanitize errors.
    process.setSourceMapsEnabled(true);
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--enable-source-maps'].filter(Boolean).join(' ');

    const startTime = Date.now();
    const projectDir = path.resolve(options.projectDirectory || process.cwd());
    const port = options.port || 3000;

    // Set NODE_ENV to production for preview mode
    process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
    process.env.EXTERNAL_DOMAIN_NAME = process.env.EXTERNAL_DOMAIN_NAME ?? `localhost:${port}`;

    // Set MRT_ENV_BASE_PATH from config.server.ts before importing the build module.
    // The server build contains renderBuiltUrl runtime code that evaluates
    // process.env.MRT_ENV_BASE_PATH at module import time (top-level const assignments).
    await initBasePathEnv(projectDir);

    // Check if build exists, todo: read build dir from react-router config
    const buildPath = path.join(projectDir, 'build', 'server', 'index.js');

    if (!fs.existsSync(buildPath)) {
        logger.warn('Production build not found. Building project...');
        logger.info('Running: pnpm build');

        try {
            // Run build command
            execSync('pnpm build', {
                cwd: projectDir,
                stdio: 'inherit',
            });

            logger.info('Build completed successfully');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error(`Build failed: ${errorMsg}`);
            process.exit(1);
        }

        // Verify build was created
        if (!fs.existsSync(buildPath)) {
            logger.error(`Build still not found at ${buildPath} after running build command`);
            process.exit(1);
        }
    }

    // Load production build (env vars already loaded above)
    logger.info(`Loading production build from ${buildPath}`);
    const buildModule = (await import(pathToFileURL(buildPath).href)) as { default: ServerBuild };
    const build = buildModule.default;

    // TODO: this should load the config from /build
    const config = await loadProjectConfig(projectDir);

    // Create unified server in serve mode
    const app = await createServer({
        mode: 'preview',
        projectDirectory: projectDir,
        port,
        build,
    });

    // Start server
    const server = app.listen(port, () => {
        printServerInfo('preview', port, startTime, projectDir);

        // Print server configuration after startup banner
        printServerConfig({
            mode: 'preview',
            port,
            enableStaticServing: true,
            enableCompression: true,
            shortCode: config.commerce.api.shortCode,
            organizationId: config.commerce.api.organizationId,
            clientId: config.commerce.api.clientId,
        });
    });

    // Graceful shutdown
    ['SIGTERM', 'SIGINT'].forEach((signal) => {
        process.once(signal, () => {
            printShutdownMessage();
            server?.close(() => {
                process.exit(0);
            });
        });
    });
}
