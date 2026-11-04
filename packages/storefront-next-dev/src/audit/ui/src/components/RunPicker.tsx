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
import { useEffect, useState } from 'react';
import { Button } from '../lib/slds';
import { openRun, pinnedRun, runLabel, type RunEntry } from '../lib/run';

/**
 * Switches this tab between the workspace's runs and deletes older ones. The
 * latest run opens at `/`, so a tab left there moves on to each new run; an
 * older run opens at `?run=<id>`. Hidden until there is more than one run.
 */
export function RunPicker() {
    const [runs, setRuns] = useState<RunEntry[]>([]);
    useEffect(() => {
        void fetch('/api/runs')
            .then((response) => (response.ok ? (response.json() as Promise<RunEntry[]>) : []))
            .then(setRuns)
            .catch(() => setRuns([]));
    }, []);

    const [latestRun] = runs;
    if (runs.length < 2 || !latestRun) return null;
    const latest = latestRun.id;
    const shown = pinnedRun ?? latest;

    const remove = async () => {
        if (
            // oxlint-disable-next-line no-alert -- deleting a run from disk needs an explicit confirmation
            !window.confirm(
                `Delete the run from ${runLabel(shown)}? Its report and collected evidence are removed from disk.`
            )
        )
            return;
        const response = await fetch(`/api/runs/${encodeURIComponent(shown)}`, { method: 'DELETE' });
        if (response.ok) {
            openRun(undefined);
            return;
        }
        const { error } = (await response.json()) as { error?: string };
        // oxlint-disable-next-line no-alert -- the failure has to reach the user who asked for the delete
        window.alert(`The run could not be deleted: ${error ?? response.statusText}`);
    };

    return (
        <div className="slds-grid slds-grid_vertical-align-center audit-gap_x-small">
            <div className="slds-select_container">
                <select
                    className="slds-select"
                    aria-label="Run"
                    value={shown}
                    onChange={(event) => openRun(event.target.value === latest ? undefined : event.target.value)}>
                    {runs.map((run) => (
                        <option key={run.id} value={run.id}>
                            {runLabel(run.id)}
                            {run.id === latest ? ' (latest)' : run.complete ? '' : ' (unfinished)'}
                        </option>
                    ))}
                </select>
            </div>
            {shown === latest ? null : (
                <Button variant="destructive" label="Delete run" onClick={() => void remove()} />
            )}
        </div>
    );
}
