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
import { describe, expect, it } from 'vitest';
import { AuditCommand } from './command';

class Audit extends AuditCommand {
    run(): Promise<void> {
        return Promise.resolve();
    }

    report(error: Error): Promise<unknown> {
        return this.catch(error);
    }
}

describe('AuditCommand', () => {
    it('sanitizes the error message before oclif prints it', async () => {
        const command = new Audit([], {} as never);

        await expect(
            command.report(new Error('fetch failed for https://example.com/?token=abc123secret'))
        ).rejects.toThrow(/^(?!.*abc123secret).*example\.com/);
    });
});
