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
import { sanitizeText } from './sanitize';

/** Base for the audit commands: an error's message is sanitized before oclif prints it, so a token in a `--url` stays out of the terminal. */
export abstract class AuditCommand extends Command {
    protected override async catch(error: Interfaces.CommandError): Promise<unknown> {
        error.message = sanitizeText(error.message);
        return super.catch(error);
    }
}
