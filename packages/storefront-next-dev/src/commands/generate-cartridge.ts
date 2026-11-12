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

import { Command, Flags } from '@oclif/core';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { generateMetadata } from '../cartridge-services/generate-cartridge';
import { validateCartridgeMetadata } from '../cartridge-services/validate-cartridge';
import { initializeNamedCartridge } from '../cartridge-services/initialize-cartridge';
import {
    assertValidCartridgeName,
    CARTRIDGES_BASE_DIR,
    SFNEXT_BASE_CARTRIDGE_NAME,
    cartridgeExperienceDir,
} from '../config';
import { commonFlags } from '../flags';

/**
 * Generate cartridge metadata command.
 *
 * Scans the project for decorated components and generates Page Designer
 * metadata files in the cartridge directory.
 */
export default class Generate extends Command {
    static description = 'Generate Page Designer component metadata from decorated components';

    static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -d ./my-project'];

    static flags = {
        ...commonFlags,
        'site-id': Flags.string({
            description:
                'Site ID to use for site-specific configuration, such as SEO route prefixes (defaults to app.defaultSiteId)',
        }),
        'cartridge-name': Flags.string({
            description:
                'Cartridge directory name under cartridges/ (defaults to app_storefrontnext_base). A new name scaffolds identity files once, then generates metadata there.',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Generate);
        const projectDirectory = flags['project-directory'];

        // Validate project directory exists
        if (!fs.existsSync(projectDirectory)) {
            this.error(`Project directory doesn't exist: ${projectDirectory}`);
        }

        const cartridgeName = flags['cartridge-name'] ?? SFNEXT_BASE_CARTRIDGE_NAME;
        try {
            assertValidCartridgeName(cartridgeName);
            if (cartridgeName !== SFNEXT_BASE_CARTRIDGE_NAME) {
                await initializeNamedCartridge(projectDirectory, cartridgeName);
            }
        } catch (error) {
            this.error(error instanceof Error ? error.message : String(error));
        }

        // Full path where metadata files are generated
        const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, cartridgeExperienceDir(cartridgeName));

        // Ensure the full metadata directory path exists
        if (!fs.existsSync(metadataDir)) {
            this.log(`Creating metadata directory: ${metadataDir}`);
            fs.mkdirSync(metadataDir, { recursive: true });
        }

        this.log('Generating Page Designer metadata...');

        await generateMetadata(projectDirectory, metadataDir, { siteId: flags['site-id'] });

        this.log('Page Designer metadata generated successfully!\n');

        this.log('Validating generated metadata...\n');

        const summary = await validateCartridgeMetadata(metadataDir);

        for (const skipped of summary.skippedFiles) {
            this.warn(`Skipping unrecognized file: ${skipped}`);
        }

        for (const result of summary.results) {
            const relativePath = path.relative(metadataDir, result.filePath ?? '');
            const typeInfo = result.schemaType ? ` (${result.schemaType})` : '';

            if (result.valid) {
                this.log(`${chalk.green('PASS')}: ${relativePath}${typeInfo}`);
            } else {
                this.log(`${chalk.red('FAIL')}: ${relativePath}${typeInfo}`);
                for (const error of result.errors) {
                    const location = error.path && error.path !== '/' ? ` at ${error.path}` : '';
                    this.log(`  ${chalk.red('ERROR')}${location}: ${error.message}`);
                }
            }
        }

        this.log(`\n${summary.validFiles}/${summary.totalFiles} file(s) valid, ${summary.totalErrors} error(s)`);

        if (summary.totalErrors > 0) {
            this.error('Generated metadata has validation errors', { exit: 1 });
        }
    }
}
