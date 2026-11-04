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
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export type ProjectIdentity = { root: string; packageName?: string };

// Resolves and validates the audited project's identity. Source discovery and search are intentionally
// left to the analyzing agent's own filesystem tools (skills) rather than a bespoke inventory layer.
export async function resolveProject(root: string): Promise<ProjectIdentity> {
    const requested = path.resolve(root);
    if ((await lstat(requested)).isSymbolicLink()) throw new Error(`Project root must not be a symlink: ${requested}`);
    const resolved = await realpath(requested);
    if (!(await lstat(resolved)).isDirectory()) throw new Error(`Project is not a directory: ${resolved}`);
    let packageName: string | undefined;
    try {
        packageName = JSON.parse(await readFile(path.join(resolved, 'package.json'), 'utf8')).name;
    } catch {
        /* optional metadata */
    }
    return { root: resolved, ...(packageName ? { packageName } : {}) };
}
