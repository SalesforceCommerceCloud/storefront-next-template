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
import { readdir } from 'node:fs/promises';
import path from 'node:path';

// An audit workspace holds one folder per run under runs/. A run's id is its
// start time, so ids sort by name and the newest one is the latest run. Every
// file a run reads or writes lives in its folder; nothing points across runs.

const RUNS_DIR = 'runs';
export const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

/** `2026-10-14T10:26:00.123Z` → `2026-10-14T10-26-00Z`, safe as a folder name. */
export function runIdFor(startedAt: string): string {
    return startedAt.replace(/\.\d+Z$/, 'Z').replaceAll(':', '-');
}

export function runDir(workspace: string, id: string): string {
    if (!RUN_ID.test(id)) throw new Error(`Invalid run id: ${id}`);
    return path.join(workspace, RUNS_DIR, id);
}

/** Run ids in the workspace, newest first. */
export async function listRuns(workspace: string): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(path.join(workspace, RUNS_DIR), { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    return entries
        .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse();
}

/** The latest run's folder; throws when the workspace has no runs yet. */
export async function latestRunDir(workspace: string): Promise<string> {
    const [latest] = await listRuns(workspace);
    if (!latest) throw new Error(`${workspace} has no audit runs; run prepare first`);
    return runDir(workspace, latest);
}
