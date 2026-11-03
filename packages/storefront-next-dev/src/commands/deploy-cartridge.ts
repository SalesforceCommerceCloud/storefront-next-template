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
import { CartridgeCommand } from '@salesforce/b2c-tooling-sdk/cli';
import {
    uploadCartridges,
    deleteCartridges,
    reloadCodeVersion,
    type ScriptsBackend,
} from '@salesforce/b2c-tooling-sdk/operations/code';
import path from 'path';
import fs from 'fs-extra';
import { CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR } from '../config';

/**
 * Deploy cartridge command - deploys cartridges to a B2C instance.
 *
 * Extends CartridgeCommand which provides:
 * - All B2C instance flags (--server, --code-version, --username, --password, etc.)
 * - Cartridge filtering flags (-c/--cartridge, -x/--exclude-cartridge)
 * - Cartridge discovery with plugin provider support
 * - Config-driven cartridge filtering via dw.json `cartridges` option
 *
 * Additional flags:
 * - --delete: Delete existing cartridges before upload
 * - --reload/-r: Reload (re-activate) code version after deploy (requires OAuth)
 * - --cartridge-ignore-dirs: Directory names to skip inside cartridges, replacing the SDK default
 *   (node_modules, .git, coverage, .cache, tmp, temp)
 *
 * Environment variables:
 * - SFCC_CARTRIDGE_IGNORE_DIRS (optional): comma-separated equivalent of --cartridge-ignore-dirs,
 *   e.g. `node_modules,.git`. Also settable as `cartridge-ignore-dirs` in dw.json.
 * - SFCC_DEFAULT_CLIENT (optional): `true` is equivalent to --default-client (inherited from the SDK),
 *   which ignores any configured API client and uses browser sign-in.
 *
 * With only a server configured (no WebDAV access key or API client), or with --default-client,
 * uploads sign in to Account Manager in a browser and the user's Business Manager role authorizes
 * WebDAV access. --default-client cannot be combined with --reload, which needs an API client.
 *
 * Code version discovery and reload use SCAPI (scopes `sfcc.scripts` / `sfcc.scripts.rw`) when
 * SFCC_SHORTCODE and SFCC_TENANT_ID are set with client-credentials auth, falling back to OCAPI.
 * Override with --api-backend (env: SFCC_API_BACKEND): auto (default), scapi, or ocapi.
 * Without an API client, the active code version is read over WebDAV; reload still needs one.
 */
export default class Deploy extends CartridgeCommand<typeof Deploy> {
    static description = 'Deploy cartridges to B2C Commerce Cloud instance';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --project-directory ./my-project',
        '<%= config.bin %> <%= command.id %> -s my-sandbox.dx.commercecloud.salesforce.com',
        '<%= config.bin %> <%= command.id %> --code-version staging',
        '<%= config.bin %> <%= command.id %> --delete',
        '<%= config.bin %> <%= command.id %> --delete --reload',
        '<%= config.bin %> <%= command.id %> -c app_storefrontnext_base',
        '<%= config.bin %> <%= command.id %> -x test_cartridge',
    ];

    static flags = {
        ...CartridgeCommand.baseFlags,
        ...CartridgeCommand.cartridgeFlags,
        reload: Flags.boolean({
            char: 'r',
            description: 'Reload (re-activate) code version after deploy',
            default: false,
        }),
        delete: Flags.boolean({
            description: 'Delete existing cartridges before upload',
            default: false,
        }),
        'cartridge-ignore-dirs': Flags.string({
            description:
                'Directory names to skip inside cartridges, replacing the default list (node_modules,.git,coverage,.cache,tmp,temp); pass an empty value to skip nothing (env: SFCC_CARTRIDGE_IGNORE_DIRS)',
            multiple: true,
            multipleNonGreedy: true,
            delimiter: ',',
        }),
    };

    private _scriptsBackend?: ScriptsBackend;

    /** SCAPI-first code version backend with OCAPI fallback (or WebDAV without an API client), honoring --api-backend. */
    protected get scriptsBackend(): ScriptsBackend {
        this._scriptsBackend ??= this.createScriptsBackend();
        return this._scriptsBackend;
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(Deploy);
        const projectDirectory = flags['project-directory'] || process.cwd();

        // Validate project directory exists
        if (!fs.existsSync(projectDirectory)) {
            this.error(`Project directory doesn't exist: ${projectDirectory}`);
        }

        // Build cartridge paths
        const cartridgesDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR);
        const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, SFNEXT_BASE_CARTRIDGE_OUTPUT_DIR);

        // Verify metadata directory exists within cartridge base
        if (!fs.existsSync(metadataDir)) {
            this.error(`Metadata directory doesn't exist: ${metadataDir}. Run 'sfnext generate-cartridge' first.`);
        }

        // Validate required configuration
        this.requireServer();
        this.requireWebDavCredentials();

        let version = this.resolvedConfig.values.codeVersion;

        // Reloading needs an API client. Without one, the active version is still found over WebDAV.
        if (flags.reload && !this.hasOAuthCredentials()) {
            this.error(
                'The --reload flag requires OAuth credentials to reload the code version via SCAPI or OCAPI.\n\nDeploy without --reload to use WebDAV only, or configure OAuth credentials (--client-id and --client-secret).'
            );
        }

        // If no code version specified, discover the active one
        if (!version) {
            this.warn('No code version specified, discovering active code version...');
            let activeVersion;
            try {
                activeVersion = await this.scriptsBackend.getActiveCodeVersion();
            } catch (error) {
                this.error(
                    `Failed to discover active code version: ${error instanceof Error ? error.message : String(error)}\n\nSpecify one explicitly with --code-version or in your dw.json config.`
                );
            }
            if (!activeVersion?.id) {
                this.error('No active code version found. Specify one with --code-version or in your dw.json config.');
            }
            version = activeVersion.id;
            this.instance.config.codeVersion = version;
        }

        // Discover cartridges in the cartridges directory
        const cartridges = await this.findCartridgesWithProviders(cartridgesDir);

        if (cartridges.length === 0) {
            this.error(`No cartridges found in ${cartridgesDir}`);
        }

        this.log(`Deploying to code version "${version}"...`);
        for (const c of cartridges) {
            this.log(`  ${c.name} (${c.src})`);
        }

        // Optionally delete existing cartridges first
        if (flags.delete) {
            this.log('Deleting existing cartridges...');
            await deleteCartridges(this.instance, cartridges);
        }

        // Deploy using SDK - this.instance is provided by InstanceCommand
        await uploadCartridges(this.instance, cartridges, {
            ignoreDirs: this.resolvedConfig.values.cartridgeIgnoreDirs,
        });

        // Optionally reload code version
        if (flags.reload) {
            try {
                await reloadCodeVersion(this.scriptsBackend, version);
                this.log('Code version reloaded.');
            } catch (error) {
                this.warn(`Could not reload code version: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.log(`Deployed ${cartridges.length} cartridge(s) to version "${version}" successfully!`);
    }
}
