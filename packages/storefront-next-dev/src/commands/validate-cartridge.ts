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
import {
    assertValidCartridgeName,
    CARTRIDGES_BASE_DIR,
    SFNEXT_BASE_CARTRIDGE_NAME,
    cartridgeExperienceDir,
} from '../config';
import { commonFlags } from '../flags';
import { validateCartridgeMetadata } from '../cartridge-services/validate-cartridge';

/**
 * Validate cartridge metadata command.
 *
 * Validates all Page Designer metadata JSON files in the cartridge
 * directory against their metadefinition schemas.
 */
export default class ValidateCartridge extends Command {
    static description = 'Validate Page Designer metadata JSON files against schemas';

    static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -d ./my-project'];

    static flags = {
        ...commonFlags,
        'cartridge-name': Flags.string({
            description: 'Cartridge directory name under cartridges/ (defaults to app_storefrontnext_base)',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(ValidateCartridge);
        const projectDirectory = flags['project-directory'];

        if (!fs.existsSync(projectDirectory)) {
            this.error(`Project directory doesn't exist: ${projectDirectory}`);
        }

        const cartridgeName = flags['cartridge-name'] ?? SFNEXT_BASE_CARTRIDGE_NAME;
        try {
            assertValidCartridgeName(cartridgeName);
        } catch (error) {
            this.error(error instanceof Error ? error.message : String(error));
        }

        const metadataDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR, cartridgeExperienceDir(cartridgeName));

        if (!fs.existsSync(metadataDir)) {
            this.error(
                `Metadata directory doesn't exist: ${metadataDir}\nRun "sfnext generate-cartridge" first to generate metadata files.`
            );
        }

        this.log('Validating Page Designer metadata...\n');

        const summary = await validateCartridgeMetadata(metadataDir);

        if (summary.totalFiles === 0) {
            this.warn('No metadata files found to validate.');
            return;
        }

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
            this.error('Validation failed', { exit: 1 });
        }
    }
}
