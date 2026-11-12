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
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { eventsFileFor } from '../../audit/audit';
import { AuditCommand } from '../../audit/command';
import { text, workspaceFlag, workspaceFor } from '../../audit/flags';
import { appendEvent, progressEventSchema } from '../../audit/events';
import { latestRunDir } from '../../audit/runs';
import { commonFlags } from '../../flags';

export default class Progress extends AuditCommand {
    static override hidden = true;
    protected static override readonly reportsUsage = false;
    static override summary = 'Append one live-progress event to the run event log';
    static override examples = [
        '<%= config.bin %> <%= command.id %> --event \'{"type":"log","level":"info","message":"Checking SEO rules"}\'',
    ];
    static override flags = {
        ...commonFlags,
        workspace: workspaceFlag('The audit workspace; the event goes to its latest run'),
        event: text({
            required: true,
            helpValue: '<json>',
            description: 'The event, as a JSON object (not run.start, run.error or run.complete)',
        }),
        events: text({ helpValue: '<file>', description: 'Append to this file instead of the latest run' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Progress);
        let payload: unknown;
        try {
            payload = JSON.parse(flags.event);
        } catch (error) {
            throw new Error('--event must be a JSON object', { cause: error });
        }
        // run.start, run.error and run.complete decide whether the run is over, so only prepare and finalize write them.
        const type = typeof payload === 'object' && payload !== null ? (payload as { type?: unknown }).type : undefined;
        if (typeof type === 'string' && type.startsWith('run.'))
            throw new Error(`--event cannot be ${type}; prepare and finalize write the run events`);
        // Validate before creating the --events folder, so a rejected event leaves nothing behind.
        const event = progressEventSchema.parse(payload);
        const eventsFile =
            flags.events === undefined
                ? eventsFileFor(undefined, await latestRunDir(workspaceFor(flags)))
                : path.resolve(flags.events);
        await mkdir(path.dirname(eventsFile), { recursive: true });
        await appendEvent(eventsFile, event);
    }
}
