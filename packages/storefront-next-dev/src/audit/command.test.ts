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
import { CLIError } from '@oclif/core/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditCommand } from './command';
import { startAuditTelemetry } from './telemetry';

vi.mock('./telemetry', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./telemetry')>()),
    startAuditTelemetry: vi.fn(),
}));

class Audit extends AuditCommand {
    static override id = 'audit:test';

    run(): Promise<void> {
        return Promise.resolve();
    }

    report(error: Error): Promise<unknown> {
        return this.catch(error);
    }

    end(error?: Error): Promise<unknown> {
        return this.finally(error);
    }

    send(attributes: () => Promise<Record<string, number>>): Promise<void> {
        return this.track('AUDIT_TEST', attributes);
    }
}

class Quiet extends Audit {
    protected static override readonly reportsUsage = false;
}

function stubTelemetry() {
    return { sendEvent: vi.fn(), flush: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()) };
}

async function started(telemetry: ReturnType<typeof stubTelemetry> | undefined): Promise<Audit> {
    vi.mocked(startAuditTelemetry).mockResolvedValue(telemetry as never);
    const command = new Audit([], { userAgent: 'test' } as never);
    command.id = 'audit:test';
    await command.init();
    return command;
}

describe('AuditCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sanitizes the error message before oclif prints it', async () => {
        const command = new Audit([], {} as never);

        await expect(
            command.report(new Error('fetch failed for https://example.com/?token=abc123secret'))
        ).rejects.toThrow(/^(?!.*abc123secret).*example\.com/);
    });

    it('reports COMMAND_START and COMMAND_SUCCESS, then stops telemetry', async () => {
        const telemetry = stubTelemetry();
        const command = await started(telemetry);
        await command.end();

        expect(telemetry.sendEvent.mock.calls.map(([event]) => event)).toEqual(['COMMAND_START', 'COMMAND_SUCCESS']);
        expect(telemetry.sendEvent).toHaveBeenLastCalledWith('COMMAND_SUCCESS', {
            command: 'sfnext:audit:test',
            duration: expect.any(Number),
        });
        expect(telemetry.stop).toHaveBeenCalledOnce();
    });

    it('reports COMMAND_ERROR without the error message', async () => {
        const telemetry = stubTelemetry();
        const command = await started(telemetry);
        const error = new Error('Playhouse failed for https://shop.example.com/');

        await expect(command.report(error)).rejects.toThrow();
        await command.end(error);

        const [, attributes] = telemetry.sendEvent.mock.calls.find(([event]) => event === 'COMMAND_ERROR') ?? [];
        expect(attributes).toEqual({
            command: 'sfnext:audit:test',
            exitCode: 1,
            duration: expect.any(Number),
            errorName: 'Error',
        });
        expect(JSON.stringify(telemetry.sendEvent.mock.calls)).not.toContain('example.com');
        expect(telemetry.sendEvent.mock.calls.map(([event]) => event)).not.toContain('COMMAND_SUCCESS');
        expect(telemetry.stop).toHaveBeenCalledOnce();
    });

    it('sends COMMAND_START right away, so a killed run still counts', async () => {
        const telemetry = stubTelemetry();
        await started(telemetry);

        expect(telemetry.flush).toHaveBeenCalledOnce();
    });

    it('never fails the command when the first flush fails', async () => {
        const telemetry = stubTelemetry();
        telemetry.flush.mockRejectedValue(new Error('offline'));

        await expect(started(telemetry)).resolves.toBeDefined();
    });

    it('reports Error as the error type when an error name is not a class name', async () => {
        const telemetry = stubTelemetry();
        const command = await started(telemetry);
        const error = new Error('boom');
        error.name = 'failed for https://shop.example.com/';

        await expect(command.report(error)).rejects.toThrow();

        expect(telemetry.sendEvent).toHaveBeenCalledWith(
            'COMMAND_ERROR',
            expect.objectContaining({ errorName: 'Error' })
        );
        expect(JSON.stringify(telemetry.sendEvent.mock.calls)).not.toContain('example.com');
    });

    it("reports oclif's exit code, which a CLIError keeps in oclif.exit", async () => {
        const telemetry = stubTelemetry();
        const command = await started(telemetry);

        await expect(command.report(new CLIError('Invalid flag', { exit: 2 }))).rejects.toThrow();

        expect(telemetry.sendEvent).toHaveBeenCalledWith('COMMAND_ERROR', expect.objectContaining({ exitCode: 2 }));
    });

    it('does not start telemetry for commands that opt out, such as progress, catalog and serve', async () => {
        const command = new Quiet([], { userAgent: 'test' } as never);
        command.id = 'audit:progress';

        await command.init();
        await command.end();

        expect(startAuditTelemetry).not.toHaveBeenCalled();
    });

    it('sends tracked events with the command id', async () => {
        const telemetry = stubTelemetry();
        const command = await started(telemetry);

        await command.send(() => Promise.resolve({ pages: 3 }));

        expect(telemetry.sendEvent).toHaveBeenLastCalledWith('AUDIT_TEST', { command: 'sfnext:audit:test', pages: 3 });
    });

    it('never fails the command when building the attributes fails', async () => {
        const telemetry = stubTelemetry();
        const command = await started(telemetry);

        await expect(command.send(() => Promise.reject(new Error('unreadable')))).resolves.toBeUndefined();
        expect(telemetry.sendEvent.mock.calls.map(([event]) => event)).toEqual(['COMMAND_START']);
    });

    it('does nothing without telemetry, and never builds the attributes', async () => {
        const command = await started(undefined);
        const attributes = vi.fn(() => Promise.resolve({}));

        await command.send(attributes);
        await expect(command.end()).resolves.toBeUndefined();
        expect(attributes).not.toHaveBeenCalled();
    });
});
