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
import path from 'node:path';
import { Errors, Flags } from '@oclif/core';
import { PROJECT_DIRECTORY_FLAG } from '../flags';

/** A string flag that rejects an empty value (`--workspace ""` or `--workspace=`) instead of treating it as the
 * current directory. Like oclif's own parse errors, it exits 2. */
export const text = Flags.custom<string>({
    parse(value) {
        return value ? Promise.resolve(value) : Promise.reject(new Errors.CLIError('needs a value', { exit: 2 }));
    },
});

/** `--workspace`, for the verbs that act on an existing workspace. */
export const workspaceFlag = (description: string, options: { exclusive?: string[] } = {}) =>
    text({ ...options, helpValue: '<dir>', description: `${description} (default: <project-directory>/.site-audit)` });

/** The audit workspace: `--workspace`, else `.site-audit` in the project directory. */
export function workspaceFor(flags: { workspace?: string; [PROJECT_DIRECTORY_FLAG]: string }): string {
    return path.resolve(flags.workspace ?? path.join(flags[PROJECT_DIRECTORY_FLAG], '.site-audit'));
}
