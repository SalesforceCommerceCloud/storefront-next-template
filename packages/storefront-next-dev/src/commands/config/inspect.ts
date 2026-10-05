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
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { ux } from '@oclif/core';
import fs from 'fs-extra';
import { MrtCommand } from '@salesforce/b2c-tooling-sdk/cli';
import { listEnvVarsWithBackend } from '@salesforce/b2c-tooling-sdk/operations/mrt';
import { commonFlags, withLegacyMrtShortFlags } from '../../flags.js';
import { flattenObject } from '../../utils/objects.js';
import { getValueSources, formatInspectOutput } from './inspect-utils.js';

/**
 * Show which config.server.ts values are overridden by .env or MRT.
 * When MRT is configured, each override is marked [local only] or [MRT only] as applicable.
 *
 * Environment variables read:
 *   MRT_PROJECT      (optional) - MRT project slug, overridden by --project flag
 *   MRT_ENVIRONMENT  (optional) - MRT target environment, overridden by --environment flag (MRT_TARGET also accepted)
 *   MRT_BACKEND      (optional) - legacy (default), scapi, or auto; overridden by --mrt-backend flag
 */
export default class ConfigInspect extends MrtCommand<typeof ConfigInspect> {
    static description = 'Show which config.server.ts values are overridden by .env or MRT';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --project my-project --environment staging',
        '<%= config.bin %> <%= command.id %> -d /path/to/my-storefront',
    ];

    static flags = {
        ...withLegacyMrtShortFlags(MrtCommand.baseFlags),
        ...commonFlags,
    };

    protected operations = {
        readEnvFile: (projectDirectory: string): Record<string, string> => {
            const envPath = join(projectDirectory, '.env');
            try {
                return parseEnv(fs.readFileSync(envPath, 'utf8')) as Record<string, string>;
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
                throw err;
            }
        },
        loadConfig: async (projectDirectory: string): Promise<Record<string, unknown>> => {
            // storefront-next-runtime is not a direct dep of storefront-next-dev, so we load
            // loadConfig from the customer's installed copy to use their exact version.
            // Path matches the ./config/load-config export entry in storefront-next-runtime's package.json.
            const loadConfigPath = join(
                projectDirectory,
                'node_modules/@salesforce/storefront-next-runtime/dist/config-load.js'
            );
            const mod = await import(pathToFileURL(loadConfigPath).href);
            return mod.loadConfig();
        },
        listEnvVarsWithBackend,
    };

    protected override supportsScapiMrt(): boolean {
        return true;
    }

    async run(): Promise<void> {
        const { flags, raw } = await this.parse(ConfigInspect);
        const projectDirectory = resolve(flags['project-directory']);
        // Flags oclif explicitly set from the command line (as opposed to auto-populated from process.env).
        const explicitFlags = new Set(raw.filter((t) => t.type === 'flag').map((t) => t.flag));

        const rawEnvVars = this.operations.readEnvFile(projectDirectory);

        if (Object.keys(rawEnvVars).length === 0) {
            this.warn(`No .env file found in ${projectDirectory}. Showing config.server.ts defaults only.`);
        }

        // loadConfig() resolves config.server.ts from process.cwd(), so we chdir temporarily.
        // .env vars are already in process.env — the oclif init hook loaded them before this
        // command ran, so no manual injection is needed here.
        let config: Record<string, unknown> = {};
        const originalCwd = process.cwd();
        try {
            process.chdir(projectDirectory);
            config = await this.operations.loadConfig(projectDirectory);
        } catch (err) {
            this.warn(`Could not load storefront config: ${(err as Error).message}`);
        } finally {
            process.chdir(originalCwd);
        }

        const flatConfig = flattenObject(config);
        const envKeys = new Set(Object.keys(rawEnvVars).filter((k) => k.startsWith('PUBLIC__')));
        const sources = getValueSources(
            flatConfig.map((e) => e.key),
            envKeys
        );

        // flags.project/flags.environment may be auto-populated by oclif from process.env
        // (MRT_PROJECT/MRT_ENVIRONMENT). Only treat them as explicit when the user actually typed them.
        const project =
            (explicitFlags.has('project') ? flags.project : undefined) ||
            rawEnvVars.MRT_PROJECT ||
            this.resolvedConfig.values.mrtProject;
        const environment =
            (explicitFlags.has('environment') ? flags.environment : undefined) ||
            rawEnvVars.MRT_ENVIRONMENT ||
            rawEnvVars.MRT_TARGET ||
            this.resolvedConfig.values.mrtEnvironment;
        let mrtVars: Map<string, string> | null = null;

        if (project && environment) {
            try {
                const { preference, scapiConnection, legacyAuth } = this.getMrtBackendContext();
                const { variables } = await this.operations.listEnvVarsWithBackend({
                    preference,
                    scapiConnection,
                    legacyAuth,
                    projectSlug: project,
                    environment,
                    origin: this.resolvedConfig.values.mrtOrigin,
                    onFallback: (reason) => this.warn(reason),
                });
                mrtVars = new Map(variables.map((v) => [v.name, v.value]));
            } catch (err) {
                this.warn(`Could not fetch MRT env vars for ${project}/${environment}: ${(err as Error).message}`);
            }
        } else {
            ux.stdout(
                'ℹ MRT project/environment not configured. Skipping MRT comparison.\n' +
                    '  Use --project and --environment flags or set MRT_PROJECT/MRT_ENVIRONMENT.\n'
            );
        }

        const localVars = new Map(Object.entries(rawEnvVars));

        const output = formatInspectOutput({ flatConfig, sources, localVars, mrtVars });
        ux.stdout(output);
    }
}
