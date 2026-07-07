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
import express, { type Express } from 'express';
import { createRequestHandler } from '@react-router/express';
import { type ServerBuild } from 'react-router';
import type { ViteDevServer } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfigFromEnv, type ServerConfig } from './config';
import { loadRuntimeConfig } from '../config';
import { importTypescript } from './ts-import';
import { createCommerceProxyMiddleware } from './middleware/proxy';
import { createStaticMiddleware } from './middleware/static';
import { createCompressionMiddleware } from './middleware/compression';
import { createLoggingMiddleware } from './middleware/logging';
import { createHostHeaderMiddleware } from './middleware/host-header';
import { patchReactRouterBuild } from './utils';
import { ServerModeFeatureMap, type ServerMode, type ServerModeFeatures } from './modes';
import { getBundlePath, getBasePath } from '../utils/paths';
import { createOtelExpressMiddleware } from '../otel/express/middleware';
import { createHealthCheckHandler, HEALTH_ENDPOINT_PATH } from './handlers/health-check';

/** Relative path to the middleware registry TypeScript source (development). Must match appDirectory + server dir + filename used by buildMiddlewareRegistry plugin. */
const RELATIVE_MIDDLEWARE_REGISTRY_SOURCE = 'src/server/middleware-registry.ts';

/** Extensions to try for the built middlewares module (ESM first, then CJS for backwards compatibility). */
const MIDDLEWARE_REGISTRY_BUILT_EXTENSIONS = ['.mjs', '.js', '.cjs'] as const;

/** Base relative paths for the built middleware registry (production). Order: MRT bundle path, then local build path. */
const RELATIVE_MIDDLEWARE_REGISTRY_BUILT_BASES: readonly [string, string] = [
    'bld/server/middleware-registry',
    'build/server/middleware-registry',
];

/** All paths to try when loading the built middlewares (base + extension). */
const RELATIVE_MIDDLEWARE_REGISTRY_BUILT_PATHS: readonly string[] = RELATIVE_MIDDLEWARE_REGISTRY_BUILT_BASES.flatMap(
    (base) => MIDDLEWARE_REGISTRY_BUILT_EXTENSIONS.map((ext) => `${base}${ext}`)
);

const DEFAULT_BUNDLE_ID = 'local';
export interface ServerOptions extends Partial<ServerModeFeatures> {
    /** Server mode: development (with Vite), preview (preview), or production (minimal) */
    mode: ServerMode;

    /** Project root directory (optional, defaults to process.cwd()) */
    projectDirectory?: string;

    /** Server configuration (optional, will load from env vars if not provided) */
    config?: ServerConfig;

    /** Server port (optional, for logging) */
    port?: number;

    /** Vite dev server instance (required for development mode) */
    vite?: ViteDevServer;

    /** React Router server build (required for preview/production modes) */
    build?: ServerBuild;

    /** Enable streaming of responses */
    streaming?: boolean;
}

/**
 * Load MRT_ENV_BASE_PATH from config.server.ts so getBasePath() works in local dev/preview.
 * On MRT production, this env var is already set by the Lambda from ssrParameters.envBasePath.
 *
 * In dev mode this must be called before Vite starts, since the React Router preset
 * reads getBasePath() at config time to set the basename.
 *
 * @param projectDirectory - Project root directory
 */
export async function initBasePathEnv(projectDirectory: string): Promise<void> {
    const runtimeConfig = await loadRuntimeConfig(projectDirectory);
    if (runtimeConfig?.ssrParameters?.envBasePath) {
        process.env.MRT_ENV_BASE_PATH = String(runtimeConfig.ssrParameters.envBasePath);
    }
}

/**
 * Create a unified Express server for development, preview, or production mode
 */
export async function createServer(options: ServerOptions): Promise<Express> {
    const {
        mode,
        projectDirectory = process.cwd(),
        config: providedConfig,
        vite,
        build,
        streaming = false,
        enableProxy = ServerModeFeatureMap[mode].enableProxy,
        enableStaticServing = ServerModeFeatureMap[mode].enableStaticServing,
        enableCompression = ServerModeFeatureMap[mode].enableCompression,
        enableLogging = ServerModeFeatureMap[mode].enableLogging,
        enableAssetUrlPatching = ServerModeFeatureMap[mode].enableAssetUrlPatching,
    } = options;

    if (mode === 'development' && !vite) {
        throw new Error('Vite dev server instance is required for development mode');
    }

    if ((mode === 'preview' || mode === 'production') && !build) {
        throw new Error('React Router server build is required for preview/production mode');
    }

    // Use provided config or load from environment variables
    // TODO: move the config implementation from the template to the SDK.
    const config = providedConfig ?? loadConfigFromEnv();

    // Load bundle ID from environment
    const bundleId = process.env.BUNDLE_ID ?? DEFAULT_BUNDLE_ID;

    // Create Express app
    const app = express();
    app.disable('x-powered-by');
    // Trust X-Forwarded-{Host,Proto} so req.hostname/req.protocol (and therefore
    // request.url seen by loaders) reflect the public origin on MRT. Safe because
    // the eCDN is the sole proxy layer before Lambda, it strips client-supplied
    // forwarded headers, and the Lambda function URL is not directly reachable.
    app.set('trust proxy', true);

    // OTel server + streaming spans — must be first to wrap the entire request lifecycle
    if (process.env.SFNEXT_OTEL_ENABLED === 'true') {
        app.use(createOtelExpressMiddleware());
    }

    app.get(HEALTH_ENDPOINT_PATH, createHealthCheckHandler({ projectDirectory, bundleId }));

    // Apply middleware based on mode
    if (enableLogging) {
        app.use(createLoggingMiddleware());
    }
    // If streaming is enabled then compression needs to be handled by the streaming handler
    // in the streamingHandler file
    if (enableCompression && !streaming) {
        app.use(createCompressionMiddleware());
    }

    if (enableStaticServing && build) {
        const bundlePath = getBundlePath(bundleId);
        app.use(bundlePath, createStaticMiddleware(bundleId, projectDirectory));
    }

    // Load and apply custom middlewares from the middleware registry.
    // In development, import the TypeScript source via jiti; in production/preview,
    // dynamically import the pre-built JS from the build output directory.
    interface MiddlewareRegistry {
        customMiddlewares?: Array<{ handler: express.RequestHandler }>;
    }

    let registry: MiddlewareRegistry | null = null;

    if (mode === 'development') {
        const middlewareRegistryPath = resolve(projectDirectory, RELATIVE_MIDDLEWARE_REGISTRY_SOURCE);
        if (existsSync(middlewareRegistryPath)) {
            registry = await importTypescript<MiddlewareRegistry>(middlewareRegistryPath, {
                projectDirectory,
            });
        }
    } else {
        const possiblePaths = RELATIVE_MIDDLEWARE_REGISTRY_BUILT_PATHS.map((p) => resolve(projectDirectory, p));

        let builtRegistryPath: string | null = null;
        for (const path of possiblePaths) {
            if (existsSync(path)) {
                builtRegistryPath = path;
                break;
            }
        }

        if (builtRegistryPath) {
            registry = (await import(pathToFileURL(builtRegistryPath).href)) as MiddlewareRegistry;
        }
    }

    if (registry?.customMiddlewares && Array.isArray(registry.customMiddlewares)) {
        registry.customMiddlewares.forEach((entry: { handler: express.RequestHandler }) => {
            app.use(entry.handler);
        });
    }

    if (mode === 'development' && vite) {
        // In development, Vite middleware handles HMR, transforms, and proxy
        app.use(vite.middlewares);
    }

    if (enableProxy) {
        app.use(config.commerce.api.proxy, createCommerceProxyMiddleware(config));
    }

    // In dev/preview, redirect non-prefixed page requests to the prefixed path.
    // When a base path is configured, redirect non-prefixed requests to the prefixed path.
    // In dev/preview this improves DX (e.g., /category/womens → /shop/category/womens).
    // In production on MRT, requests arriving at the environment domain without the base path
    // (e.g., mrt-env.mobify-storefront.com/category/womens) are redirected to the prefixed URL,
    // since the CDN routes by base path on the vanity domain but direct MRT access skips it.
    const basePath = getBasePath();
    if (basePath) {
        app.use((req, res, next) => {
            if (req.path.startsWith(`${basePath}/`) || req.path === basePath) {
                return next();
            }
            // Don't redirect infrastructure paths
            if (req.path.startsWith('/mobify/')) {
                return next();
            }
            res.redirect(`${basePath}${req.originalUrl}`);
        });
    }

    // Normalize the Host header for React Router's CSRF validation features
    app.use(createHostHeaderMiddleware());
    // SSR request handler

    app.all('*splat', await createSSRHandler(mode, bundleId, vite, build, enableAssetUrlPatching));

    return app;
}

/**
 * Create the SSR request handler based on mode
 */
async function createSSRHandler(
    mode: ServerMode,
    bundleId: string,
    vite: ViteDevServer | undefined,
    build: ServerBuild | undefined,
    enableAssetUrlPatching: boolean
) {
    if (mode === 'development' && vite) {
        // The vite package is not designed to be bundlable via build tools
        // You will run into a lot of build errors if you try to bundle it.
        // So, we dynamically import it here to avoid bundling it in production.
        const { isRunnableDevEnvironment } = await import('vite');

        return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const ssrEnvironment = vite.environments.ssr;

                // Check if the environment is runnable (has a module runner)
                if (!isRunnableDevEnvironment(ssrEnvironment)) {
                    const error = new Error(
                        'SSR environment is not runnable. Please ensure:\n' +
                            '  1. "@salesforce/storefront-next-dev" plugin is added to vite.config.ts\n' +
                            '  2. React Router config uses the Storefront Next preset'
                    );
                    next(error);
                    return;
                }

                // Load server build using Vite Environment API
                // This gets the latest build with HMR updates
                const devBuild = await ssrEnvironment.runner.import('virtual:react-router/server-build');

                // Use the same request handler pattern as production
                const handler = createRequestHandler({
                    build: devBuild,
                    mode: process.env.NODE_ENV,
                });

                await handler(req, res, next);
            } catch (error) {
                // Let Vite handle SSR errors with nice error overlay
                vite.ssrFixStacktrace(error as Error);
                next(error);
            }
        };
    } else if (build) {
        // Serve/Production mode: static build
        let patchedBuild = build;

        if (enableAssetUrlPatching) {
            patchedBuild = patchReactRouterBuild(build, bundleId);
        }

        // When source maps are enabled (via MRT's enable_source_maps toggle or local preview),
        // use 'development' mode so React Router sends unsanitized errors to the browser.
        const sourceMapsEnabled = process.env.NODE_OPTIONS?.includes('--enable-source-maps');
        const requestHandlerMode = sourceMapsEnabled ? 'development' : process.env.NODE_ENV;

        return createRequestHandler({
            build: patchedBuild,
            mode: requestHandlerMode,
        });
    } else {
        throw new Error('Invalid server configuration: no vite or build provided');
    }
}

// Re-export config and types
export { loadProjectConfig, loadConfigFromEnv, type ServerConfig } from './config';
