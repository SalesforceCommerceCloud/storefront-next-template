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
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Flags } from '@oclif/core';
import { AuditCommand } from '../../audit/command';
import { text, workspaceFlag, workspaceFor } from '../../audit/flags';
import { commonFlags } from '../../flags';

export default class Serve extends AuditCommand {
    static override hidden = true;
    protected static override readonly reportsUsage = false;
    static override summary = 'Serve the dashboard for a finalized audit-result.json or a live run';
    static override examples = ['<%= config.bin %> <%= command.id %> -d ./my-storefront --no-open'];
    static override flags = {
        ...commonFlags,
        workspace: workspaceFlag('An audit workspace: follow its latest run live, and list earlier runs', {
            exclusive: ['input'],
        }),
        input: text({
            exclusive: ['workspace'],
            helpValue: '<file>',
            description: 'A finished audit-result.json, served on its own',
        }),
        port: Flags.integer({
            min: 1,
            max: 65_535,
            default: 8787,
            helpValue: '<n>',
            description: 'The port to listen on',
        }),
        open: Flags.boolean({ default: true, allowNo: true, description: 'Open the dashboard in a browser' }),
        ui: text({ helpValue: '<dir>', description: 'Serve another built UI directory' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Serve);
        const source =
            flags.input === undefined ? { workspace: workspaceFor(flags) } : { input: path.resolve(flags.input) };
        const { startServer } = await import('../../audit/server');
        const { url } = await startServer({
            ...source,
            uiDir: flags.ui === undefined ? undefined : path.resolve(flags.ui),
            port: flags.port,
        });
        this.log(`Site audit dashboard: ${url}`);
        if (flags.open) openBrowser(url);
        // The server keeps the process alive.
    }
}

function openBrowser(url: string): void {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try {
        spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
    } catch {
        /* headless: URL already printed */
    }
}
