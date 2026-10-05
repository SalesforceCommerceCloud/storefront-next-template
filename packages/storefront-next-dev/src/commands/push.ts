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

import { Flags } from '@oclif/core';
import { MrtCommand } from '@salesforce/b2c-tooling-sdk/cli';
import fs from 'fs-extra';
import { createBundle, getBundleDependencies } from '../bundle';
import {
    buildMrtConfig,
    CARTRIDGES_BASE_DIR,
    SFNEXT_BASE_CARTRIDGE_NAME,
    SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR,
    GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH,
} from '../config';
import { getDefaultBuildDir, getDefaultMessage } from '../utils';
import { withLegacyMrtShortFlags } from '../flags';
import { generateMetadata } from '../cartridge-services/generate-cartridge';
import { uploadCartridges, type CartridgeMapping } from '@salesforce/b2c-tooling-sdk/operations/code';
import {
    createBundleV2,
    createDeploymentScapi,
    mrtScapiUnavailableMessage,
    runMrtWithFallback,
    uploadBundle,
    uploadBundleScapi,
    waitForDeploymentScapi,
    waitForEnv,
    type MrtBackend,
    type ScapiMrtConnection,
} from '@salesforce/b2c-tooling-sdk/operations/mrt';
import { createMrtClient, DEFAULT_MRT_ORIGIN } from '@salesforce/b2c-tooling-sdk/clients';
import path from 'path';
import type { MrtSsrConfig } from '../types';

/** config.server.ts SSR parameter keys and their v2 bundle (PascalCase) equivalents. */
const V2_SSR_PARAMETER_KEYS: Record<string, string> = {
    ssrFunctionNodeVersion: 'SSRFunctionNodeVersion',
    envBasePath: 'EnvBasePath',
};

/** Rename known camelCase SSR parameters to the PascalCase keys the v2 bundle config expects. */
function toV2SsrParameters(params: MrtSsrConfig['ssrParameters']): Record<string, unknown> {
    return Object.fromEntries(Object.entries(params).map(([key, value]) => [V2_SSR_PARAMETER_KEYS[key] ?? key, value]));
}

interface PushBundleOptions {
    message: string;
    config: MrtSsrConfig;
    buildDirectory: string;
    projectDirectory: string;
    projectSlug: string;
    target?: string;
}

interface PushOutcome {
    backend: MrtBackend;
    bundleId: number;
    warnings: string[];
    /** SCAPI deployment ID, used to poll a SCAPI deploy with --wait. */
    deploymentId?: string;
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
export default class Push extends MrtCommand<typeof Push> {
    static description = 'Build and push bundle to Managed Runtime';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --project-directory ./my-project',
        '<%= config.bin %> <%= command.id %> --project my-project --environment staging',
        '<%= config.bin %> <%= command.id %> --wait',
        '<%= config.bin %> <%= command.id %> --mrt-backend scapi --environment staging --wait',
    ];

    static flags = {
        ...withLegacyMrtShortFlags(MrtCommand.baseFlags),
        'build-directory': Flags.string({
            char: 'b',
            description: 'Build directory to push (default: auto-detected)',
        }),
        message: Flags.string({
            char: 'm',
            description: 'Bundle message (default: git branch:commit)',
        }),
        wait: Flags.boolean({
            char: 'w',
            description: 'Wait for deployment to complete',
            default: false,
        }),
        // MrtCommand aliases `-s`/--storefront to --project and --target to --environment.
        'project-slug': Flags.string({
            description: 'DEPRECATED: Use --project instead',
            hidden: true,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Push);
        // Absolute so SDK bundling (which loads config.server.ts and resolves paths from cwd) works with `-d .`
        const projectDirectory = path.resolve(flags['project-directory'] || process.cwd());

        // Deprecated alias handling
        if (flags['project-slug']) {
            this.warn('Flag --project-slug is deprecated. Use --project instead.');
        }

        // Precedence: CLI flag > MRT_* env > SFCC_MRT_* env (fallback) > dw.json
        // flags.environment includes all oclif-resolved sources; resolvedConfig adds dw.json
        const target = flags.environment || this.resolvedConfig.values.mrtEnvironment;

        // Input validation
        if (flags.wait && !target) {
            this.error(
                'You must provide a target environment when using --wait (via --environment flag, MRT_ENVIRONMENT env var, or dw.json)'
            );
        }

        // Validate project directory exists
        if (!fs.existsSync(projectDirectory)) {
            this.error(`Project directory "${projectDirectory}" does not exist!`);
        }

        // Precedence: CLI flag > MRT_* env > SFCC_MRT_* env (fallback) > dw.json
        const projectSlug = flags.project || flags['project-slug'] || this.resolvedConfig.values.mrtProject;
        if (!projectSlug || projectSlug.trim() === '') {
            this.error(
                'Project slug is required. Provide --project, set MRT_PROJECT env var, or configure mrtProject in dw.json'
            );
        }

        // Set default build directory and validate it exists
        const buildDirectory = flags['build-directory'] ?? getDefaultBuildDir(projectDirectory);
        if (!fs.existsSync(buildDirectory)) {
            this.error(`Build directory "${buildDirectory}" does not exist!`);
        }

        // Optionally generate and deploy cartridge metadata before MRT push
        if (GENERATE_AND_DEPLOY_CARTRIDGE_ON_MRT_PUSH) {
            await this.generateAndDeployCartridge(projectDirectory);
        }

        // Set deployment target environment variable
        if (target) {
            process.env.DEPLOY_TARGET = target;
        }

        // Resolves --mrt-backend and errors early when the selected backend has no credentials
        const { preference, scapiConnection, legacyAuth } = this.getMrtBackendContext();

        // Build SSR configuration for MRT bundle
        const config = await buildMrtConfig(buildDirectory, projectDirectory);

        // Set default message
        const message = flags.message ?? getDefaultMessage(projectDirectory);

        this.log(`Creating bundle for project: ${projectSlug}`);
        if (target) {
            this.log(`Target environment: ${target}`);
        }

        const pushOptions = { message, config, buildDirectory, projectDirectory, projectSlug, target };
        const { value: result } = await runMrtWithFallback<PushOutcome>(
            {
                preference,
                hasScapiConfig: Boolean(scapiConnection),
                canFallbackToLegacy: Boolean(legacyAuth),
                onFallback: (reason) => this.warn(`SCAPI MRT backend unavailable, using legacy MRT API: ${reason}`),
                onResolve: (backend) => this.logger.debug({ backend }, '[MRT] Pushing bundle via backend'),
            },
            {
                scapi: () => this.pushScapi(scapiConnection, pushOptions),
                legacy: () => this.pushLegacy(pushOptions),
            }
        );
        this.log(`Bundle ${result.bundleId} uploaded`);

        // Surface any non-blocking warnings the MRT backend returned for this deploy
        // (e.g. the x86 environment deprecation notice). `this.warn` prints to stderr in
        // yellow and does not throw, so the push still succeeds.
        for (const w of result.warnings) {
            this.warn(w);
        }

        if (flags.wait && target) {
            this.log(`Waiting for deployment to ${target}...`);
            if (result.backend === 'scapi') {
                if (!scapiConnection || !result.deploymentId) {
                    this.warn('SCAPI did not return a deployment ID; cannot wait for the deployment to complete.');
                    return;
                }
                await waitForDeploymentScapi(scapiConnection, {
                    storefrontId: projectSlug,
                    environmentId: target,
                    deploymentId: result.deploymentId,
                    onPoll: (info) => this.log(`  ${target}: ${info.status} (${info.elapsedSeconds}s)`),
                });
            } else {
                await this.waitLegacy(projectSlug, target);
            }
            this.log(`Deployment complete — bundle ${result.bundleId} is live on ${target}`);
        }
    }

    protected override supportsScapiMrt(): boolean {
        return true;
    }

    /** Upload a v1 bundle through the legacy MRT Cloud API (API key auth). */
    private async pushLegacy(options: PushBundleOptions): Promise<PushOutcome> {
        const { message, config, buildDirectory, projectDirectory, projectSlug, target } = options;
        const bundle = await createBundle({
            message,
            ssr_parameters: config.ssrParameters,
            ssr_only: config.ssrOnly,
            ssr_shared: config.ssrShared,
            buildDirectory,
            projectDirectory,
            projectSlug,
        });

        const origin = this.resolvedConfig.values.mrtOrigin || DEFAULT_MRT_ORIGIN;
        const client = createMrtClient({ origin }, this.getMrtAuth());

        this.log(`Uploading bundle to ${origin}`);
        const result = await uploadBundle(client, projectSlug, bundle, target);
        return { backend: 'legacy', bundleId: result.bundleId, warnings: result.warnings ?? [] };
    }

    /**
     * Upload a v2 bundle through the SCAPI Storefront Deployments API (OAuth), then
     * deploy it when a target is given (the SCAPI upload endpoint is upload-only).
     */
    private async pushScapi(conn: ScapiMrtConnection | undefined, options: PushBundleOptions): Promise<PushOutcome> {
        // runMrtWithFallback only selects SCAPI when a connection exists
        if (!conn) {
            throw new Error(mrtScapiUnavailableMessage());
        }
        const { message, config, buildDirectory, projectDirectory, projectSlug, target } = options;
        const bundle = await createBundleV2({
            message,
            ssrParameters: toV2SsrParameters(config.ssrParameters),
            ssrOnly: config.ssrOnly,
            ssrShared: config.ssrShared,
            bundleMetadata: { dependencies: getBundleDependencies(projectDirectory) },
            buildDirectory,
            projectDirectory,
            // The default SSR patterns cover optional asset types that may not exist in every build.
            matchMode: 'ignore_missing',
        });

        this.log(`Uploading bundle via SCAPI (${conn.shortCode})`);
        const uploaded = await uploadBundleScapi(conn, { storefrontId: projectSlug, bundle });
        if (!target) {
            return { backend: 'scapi', bundleId: uploaded.bundleId, warnings: uploaded.warnings };
        }

        // The bundle now exists on SCAPI; rethrow deploy failures as plain errors so
        // runMrtWithFallback does not fall back to legacy and upload a second bundle.
        try {
            const deployment = await createDeploymentScapi(conn, {
                storefrontId: projectSlug,
                environmentId: target,
                bundleId: uploaded.bundleId,
            });
            return {
                backend: 'scapi',
                bundleId: uploaded.bundleId,
                warnings: uploaded.warnings,
                deploymentId: deployment.deploymentId,
            };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Bundle ${uploaded.bundleId} uploaded but the deployment to ${target} failed: ${reason}`);
        }
    }

    private async waitLegacy(projectSlug: string, target: string): Promise<void> {
        let lastState = '';
        await waitForEnv(
            {
                projectSlug,
                slug: target,
                origin: this.resolvedConfig.values.mrtOrigin || DEFAULT_MRT_ORIGIN,
                onPoll: (info) => {
                    if (info.state !== lastState) {
                        lastState = info.state;
                        this.log(`  ${target}: ${info.state} (${info.elapsedSeconds}s)`);
                    }
                },
            },
            this.getMrtAuth()
        );
    }

    /**
     * Generate and deploy cartridge metadata to B2C instance.
     * This is a pre-MRT-push step that ensures Page Designer metadata is current.
     */
    private async generateAndDeployCartridge(projectDirectory: string): Promise<void> {
        const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);

        try {
            this.log('Generating cartridge metadata before MRT push...');

            // Ensure the metadata directory exists
            if (!fs.existsSync(metadataDir)) {
                fs.mkdirSync(metadataDir, { recursive: true });
            }

            await generateMetadata(projectDirectory, metadataDir);
            this.log('Cartridge metadata generated successfully!');

            this.log('Deploying cartridge to Commerce Cloud...');

            if (!this.resolvedConfig.hasB2CInstanceConfig()) {
                this.warn('B2C instance not configured, skipping cartridge deployment');
                return;
            }

            if (!this.resolvedConfig.values.codeVersion) {
                this.warn('Code version not configured, skipping cartridge deployment');
                return;
            }

            const instance = this.resolvedConfig.createB2CInstance();
            const cartridgeSrc = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_NAME);
            const cartridges: CartridgeMapping[] = [
                {
                    name: SFNEXT_BASE_CARTRIDGE_NAME,
                    src: cartridgeSrc,
                    dest: SFNEXT_BASE_CARTRIDGE_NAME,
                },
            ];

            await uploadCartridges(instance, cartridges);
            this.log('Cartridge deployed successfully!');
        } catch (cartridgeError) {
            // Don't fail the push if cartridge generation/deployment fails
            this.warn(`Failed to generate or deploy cartridge: ${(cartridgeError as Error).message}`);
        }
    }
}
