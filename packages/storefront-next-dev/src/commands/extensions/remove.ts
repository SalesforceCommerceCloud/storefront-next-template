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
import { manageExtensions } from '../../extensibility/manage-extensions';
import { commonFlags } from '../../flags';

/**
 * Remove extension command - removes one or more extensions from a storefront project.
 */
export default class Remove extends Command {
    static description = 'Remove one or more installed extensions from a storefront project';

    static examples = [
        '<%= config.bin %> <%= command.id %> -e SFDC_EXT_STORE_LOCATOR',
        '<%= config.bin %> <%= command.id %> -e SFDC_EXT_STORE_LOCATOR,SFDC_EXT_BOPIS',
    ];

    static flags = {
        ...commonFlags,
        extensions: Flags.string({
            char: 'e',
            description: 'Comma-separated list of extension marker values (e.g. SFDC_EXT_STORE_LOCATOR,SFDC_EXT_BOPIS)',
        }),
        yes: Flags.boolean({
            description: 'Confirm uninstalling dependent extensions without prompting',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Remove);

        // Split comma-separated extensions into array
        const extensions = flags.extensions ? flags.extensions.split(',').map((e) => e.trim()) : undefined;

        await manageExtensions({
            projectDirectory: flags['project-directory'],
            uninstall: true,
            extensions,
            yes: flags.yes,
        });
    }
}
