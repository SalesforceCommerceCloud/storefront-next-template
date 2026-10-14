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
import { createBundleCommand } from '../lib/create-bundle';
import { BUNDLE_VERSIONS, commonFlags, type BundleVersion } from '../flags';

/**
 * Create bundle command - creates an MRT bundle without pushing.
 */
export default class Bundle extends Command {
    static description = 'Create an MRT bundle from the build directory without pushing';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> -d ./my-project',
        '<%= config.bin %> <%= command.id %> -o ./my-bundle',
        '<%= config.bin %> <%= command.id %> --bundle-version 2',
    ];

    static flags = {
        ...commonFlags,
        'build-directory': Flags.string({
            char: 'b',
            description: 'Build directory to bundle (default: auto-detected)',
        }),
        'output-directory': Flags.string({
            char: 'o',
            description: 'Output directory for bundle files (default: .bundle)',
        }),
        message: Flags.string({
            char: 'm',
            description: 'Bundle message (default: git branch:commit)',
        }),
        'project-slug': Flags.string({
            char: 's',
            description:
                'Project slug - the unique identifier for your project on Managed Runtime (default: from .env MRT_PROJECT or package.json name)',
        }),
        'bundle-version': Flags.string({
            description:
                'MRT bundle version. Use 1 for the legacy format and 2 for the new format. Default is 1. The SCAPI backend always uses version 2.',
            options: [...BUNDLE_VERSIONS],
            default: '1',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Bundle);

        await createBundleCommand({
            projectDirectory: flags['project-directory'],
            buildDirectory: flags['build-directory'],
            outputDirectory: flags['output-directory'],
            message: flags.message,
            projectSlug: flags['project-slug'],
            bundleVersion: flags['bundle-version'] as BundleVersion,
        });

        this.log('Bundle created successfully!');
    }
}
