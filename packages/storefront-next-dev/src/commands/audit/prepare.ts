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
import { prepare } from '../../audit/audit';
import { AuditCommand } from '../../audit/command';
import { text } from '../../audit/flags';
import { commonFlags, PROJECT_DIRECTORY_FLAG } from '../../flags';

export default class Prepare extends AuditCommand {
    static override hidden = true;
    static override summary = 'Validate catalog, inventory source, and run Playhouse collection';
    static override description =
        "Collects Playhouse evidence for each page, builds the project for the bundle analysis, runs the rule scripts, and prints the path of the run's prepared.json. Measuring needs Playwright's Chromium; if the Playwright browser cache lacks the revision Playhouse is built for, prepare downloads it once (about 180 MB).";
    static override examples = [
        '<%= config.bin %> <%= command.id %> --url home=https://example.com/ --url plp=https://example.com/shoes',
        '<%= config.bin %> <%= command.id %> -d ./my-storefront --url home=https://example.com/',
    ];
    static override flags = {
        ...commonFlags,
        url: text({
            multiple: true,
            multipleNonGreedy: true,
            helpValue: '<label>=<url>',
            description: 'A page to audit, such as home=https://example.com/ (repeat for each page)',
        }),
        archive: text({
            multiple: true,
            multipleNonGreedy: true,
            helpValue: '<label>=<dir>',
            description: 'Reuse a completed Playhouse archive (absolute path) for the --url with this label',
        }),
        'expected-page': text({
            multiple: true,
            multipleNonGreedy: true,
            helpValue: '<label>',
            description: 'A page the audit should cover (repeat; default home, plp and pdp)',
        }),
        workspace: text({
            helpValue: '<dir>',
            description: 'The audit workspace (default: <project-directory>/.site-audit)',
        }),
        runs: Flags.integer({
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            default: 1,
            helpValue: '<n>',
            description: 'Playhouse runs per page',
        }),
        'allow-http': Flags.boolean({ description: 'Allow http:// URLs' }),
        categories: text({
            helpValue: '<dir>',
            description: 'Use another categories directory; its rule scripts are not run',
        }),
        events: text({ helpValue: '<file>', description: 'Write progress events here instead of the run folder' }),
        build: Flags.boolean({
            default: true,
            allowNo: true,
            description:
                "Build the project (its build script, twice) to break down each page's JavaScript; rewrites the gitignored build/ folder",
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Prepare);
        this.log(
            await prepare({
                urls: flags.url,
                archives: flags.archive,
                expectedPages: flags['expected-page'],
                project: flags[PROJECT_DIRECTORY_FLAG],
                workspace: flags.workspace,
                runs: flags.runs,
                allowHttp: flags['allow-http'],
                categories: flags.categories,
                events: flags.events,
                build: flags.build,
            })
        );
    }
}
