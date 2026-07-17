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
import { createStorefront } from '../create-storefront';

/**
 * Create storefront command - creates a new storefront project from template.
 */
export default class CreateStorefront extends Command {
    static description = 'Create a storefront project';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> -n my-storefront -V cosmetic',
        '<%= config.bin %> <%= command.id %> -n my-storefront -t https://github.com/org/template -b release-0.2.x',
        '<%= config.bin %> <%= command.id %> -n my-storefront -t /path/to/local/template',
        '<%= config.bin %> <%= command.id %> -l /path/to/monorepo/packages',
    ];

    static flags = {
        name: Flags.string({
            char: 'n',
            description: 'Storefront project name',
        }),
        template: Flags.string({
            char: 't',
            description: 'Template repository to use for the storefront (GitHub URL or local path)',
        }),
        vertical: Flags.string({
            char: 'V',
            description:
                'Vertical template to generate from. Selects the matching published template repository. Ignored if --template is provided.',
            options: ['fashion', 'cosmetic', 'foundations'],
        }),
        'template-branch': Flags.string({
            char: 'b',
            description: 'Branch or tag to clone from the template repository',
        }),
        'local-packages-dir': Flags.string({
            char: 'l',
            description: 'Local monorepo packages directory for file:// templates (pre-fills dependency paths)',
        }),
        defaults: Flags.boolean({
            char: 'd',
            description: 'Accept all defaults without prompting (for CI/automation)',
            default: false,
        }),
        'output-dir': Flags.string({
            char: 'o',
            description: 'Directory where the storefront project will be created',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(CreateStorefront);

        await createStorefront({
            name: flags.name,
            template: flags.template,
            vertical: flags.vertical,
            templateBranch: flags['template-branch'],
            localPackagesDir: flags['local-packages-dir'],
            defaults: flags.defaults,
            outputDir: flags['output-dir'],
        });
    }
}
