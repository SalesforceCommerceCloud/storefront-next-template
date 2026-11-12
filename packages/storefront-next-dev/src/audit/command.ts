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
import { Command, type Interfaces } from '@oclif/core';
import type { Telemetry, TelemetryAttributes } from '@salesforce/b2c-tooling-sdk/telemetry';
import { sanitizeText } from './sanitize';
import { errorName, startAuditTelemetry, usageCommand } from './telemetry';

/**
 * Base for the audit commands: an error's message is sanitized before oclif prints it, so a token in a `--url` stays
 * out of the terminal. Each command also reports COMMAND_START, COMMAND_SUCCESS and COMMAND_ERROR
 * like the B2C CLI's own commands, but without the error message, which can hold a storefront URL.
 */
export abstract class AuditCommand extends Command {
    /** Whether the command reports COMMAND_* events. Off for the ones an agent calls repeatedly or that keep running. */
    protected static readonly reportsUsage: boolean = true;

    private telemetry?: Telemetry;
    private startedAt = Date.now();

    override async init(): Promise<void> {
        await super.init();
        this.startedAt = Date.now();
        if (!(this.constructor as typeof AuditCommand).reportsUsage) return;
        this.telemetry = await startAuditTelemetry(this.config, usageCommand(this.id));
        this.telemetry?.sendEvent('COMMAND_START', { command: usageCommand(this.id) });
        // Sent right away, in the background, so a prepare that is killed before its first 30 s flush still counts.
        void this.telemetry?.flush().catch(() => undefined);
    }

    /** Sends a usage event when telemetry is on. Building its attributes or sending it never fails the command. */
    protected async track(event: string, attributes: () => Promise<TelemetryAttributes>): Promise<void> {
        if (!this.telemetry) return;
        try {
            this.telemetry.sendEvent(event, { command: usageCommand(this.id), ...(await attributes()) });
        } catch {
            /* usage data is best-effort */
        }
    }

    protected override async catch(error: Interfaces.CommandError): Promise<unknown> {
        error.message = sanitizeText(error.message);
        this.telemetry?.sendEvent('COMMAND_ERROR', {
            command: usageCommand(this.id),
            exitCode: (error as { oclif?: { exit?: number } }).oclif?.exit ?? error.exitCode ?? 1,
            duration: Date.now() - this.startedAt,
            errorName: errorName(error),
        });
        return super.catch(error);
    }

    protected override async finally(error: Error | undefined): Promise<unknown> {
        if (!error)
            this.telemetry?.sendEvent('COMMAND_SUCCESS', {
                command: usageCommand(this.id),
                duration: Date.now() - this.startedAt,
            });
        await this.telemetry?.stop().catch(() => undefined);
        this.telemetry = undefined;
        return super.finally(error);
    }
}
