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
import { finalize } from '../../audit/audit';
import { AuditCommand } from '../../audit/command';
import { text, workspaceFlag, workspaceFor } from '../../audit/flags';
import { finalizedAttributes } from '../../audit/telemetry';
import { commonFlags } from '../../flags';

export default class Finalize extends AuditCommand {
    static override hidden = true;
    static override summary = 'Merge script results and ai-analysis/ into audit-result.json';
    static override description =
        "Validates the latest run's ai-analysis/ files, writes its audit-result.json, and prints its path. A failed finalize can be fixed and run again.";
    static override examples = ['<%= config.bin %> <%= command.id %> -d ./my-storefront'];
    static override flags = {
        ...commonFlags,
        workspace: workspaceFlag('The audit workspace; its latest run is finalized'),
        categories: text({ helpValue: '<dir>', description: 'The categories directory prepare used' }),
        events: text({ helpValue: '<file>', description: 'Write progress events here instead of the run folder' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Finalize);
        const resultPath = await finalize({
            workspace: workspaceFor(flags),
            categories: flags.categories,
            events: flags.events,
        });
        await this.track('AUDIT_FINALIZED', () => finalizedAttributes(resultPath));
        this.log(resultPath);
    }
}
