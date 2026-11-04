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
import { useEffect, useRef, useState } from 'react';
import type { AuditResult } from '../types';
import type { StoredProgressEvent } from '../../../events';
import { reduceEvents, type RunningModel } from './progress';
import { forRun, pinnedRun } from './run';

export type { RunningModel } from './progress';

export type AuditState =
    | { status: 'loading' }
    | { status: 'running'; model: RunningModel; connectionLost: boolean }
    | { status: 'complete'; model: RunningModel; result: AuditResult; connectionLost: boolean }
    /** An older run that never finished, so it has no report. */
    | { status: 'unfinished' }
    | { status: 'error'; message: string };

interface StatusResponse {
    status: 'preparing' | 'running' | 'complete' | 'error';
    runId?: string;
}

/**
 * The single data source for the dashboard. It tails /api/events (SSE) and
 * reduces the stream into the running view-model; once the run completes it
 * fetches the finalized result from /api/audit. If the server isn't watching a
 * run (view mode — /api/events 409s), it falls back to polling /api/status.
 * A tab pinned to an older run (`?run=<id>`) only loads that run's result.
 */
export function useAudit(): AuditState {
    const [events, setEvents] = useState<StoredProgressEvent[]>([]);
    const [result, setResult] = useState<AuditResult | null>(null);
    const [polledStatus, setPolledStatus] = useState<StatusResponse['status'] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [connectionLost, setConnectionLost] = useState(false);
    const [unfinished, setUnfinished] = useState(false);
    const buffer = useRef<StoredProgressEvent[]>([]);

    useEffect(() => {
        if (!pinnedRun) return;
        let active = true;
        void (async () => {
            try {
                const response = await fetch(forRun('/api/audit'));
                if (!active) return;
                if (response.status === 409) setUnfinished(true);
                else if (!response.ok) setError(`run ${pinnedRun} was not found`);
                else setResult((await response.json()) as AuditResult);
            } catch (caught) {
                if (active) setError(caught instanceof Error ? caught.message : String(caught));
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (pinnedRun) return;
        let active = true;
        let source: EventSource | undefined;
        let pollTimer: ReturnType<typeof setTimeout> | undefined;
        // Connection-loss tracking. Once a run is live, a dead server makes the
        // EventSource retry silently (readyState CONNECTING) — the page would just
        // freeze. Flag the loss (after a short grace so a blink doesn't flap) so the
        // UI can warn the user; clear it if the stream reconnects.
        let lost = false;
        let lostTimer: ReturnType<typeof setTimeout> | undefined;
        let terminated = false;
        const markLost = () => {
            lostTimer = undefined;
            lost = true;
            if (active && !terminated) setConnectionLost(true);
        };

        const loadResult = async () => {
            try {
                const response = await fetch('/api/audit');
                if (response.ok && active) setResult((await response.json()) as AuditResult);
            } catch {
                /* result not ready yet; a later status/event will retry */
            }
        };

        // View mode (no live run): poll status, then fetch the finished result.
        const poll = async () => {
            try {
                const status = (await (await fetch('/api/status')).json()) as StatusResponse;
                if (!active) return;
                setPolledStatus(status.status);
                if (status.status === 'complete') return void loadResult();
                pollTimer = setTimeout(() => void poll(), 1000);
            } catch (caught) {
                if (active) setError(caught instanceof Error ? caught.message : String(caught));
            }
        };

        const connect = () => {
            source = new EventSource('/api/events');
            // Every connection replays the whole log from the top, so reset on open
            // to stay idempotent across reconnects.
            source.addEventListener('open', () => {
                buffer.current = [];
                lost = false;
                if (lostTimer) {
                    clearTimeout(lostTimer);
                    lostTimer = undefined;
                }
                if (active) setConnectionLost(false);
            });
            source.addEventListener('message', (message) => {
                if (!active) return;
                try {
                    const event = JSON.parse(message.data) as StoredProgressEvent;
                    buffer.current = [...buffer.current, event];
                    setEvents(buffer.current);
                    if (event.type === 'run.complete') void loadResult();
                } catch {
                    /* ignore malformed frame */
                }
            });
            // The server sends `end` once the run is over (completed, or prepare failed). Until then the stream stays
            // open, so a finalize that failed and is run again streams into this tab.
            source.addEventListener('end', () => {
                terminated = true;
                source?.close();
            });
            source.addEventListener('error', () => {
                if (terminated) return;
                // A closed EventSource with no events means the server isn't watching a
                // run (409) — fall back to polling. Otherwise let it auto-reconnect.
                if (source?.readyState === EventSource.CLOSED && buffer.current.length === 0) {
                    source = undefined;
                    void poll();
                    return;
                }
                // A run is live but the stream dropped: the browser is auto-reconnecting.
                // If it doesn't recover within the grace window, warn the user — the
                // server (often an AI agent's terminal) may have stopped.
                if (buffer.current.length > 0 && !lost && !lostTimer) {
                    lostTimer = setTimeout(markLost, 4000);
                }
            });
        };

        // A new run takes over this tab: reload once the latest run is no longer the one streamed here.
        let followTimer: ReturnType<typeof setTimeout> | undefined;
        const followLatest = async () => {
            try {
                const { runId } = (await (await fetch('/api/status')).json()) as StatusResponse;
                const shown = buffer.current.findLast((event) => event.type === 'run.start');
                if (runId && shown?.type === 'run.start' && shown.runId !== runId) return void window.location.reload();
            } catch {
                /* the connection-loss banner covers a stopped server */
            }
            if (active) followTimer = setTimeout(() => void followLatest(), 2000);
        };

        connect();
        void followLatest();
        return () => {
            active = false;
            terminated = true;
            source?.close();
            if (followTimer) clearTimeout(followTimer);
            if (pollTimer) clearTimeout(pollTimer);
            if (lostTimer) clearTimeout(lostTimer);
        };
    }, []);

    if (error) return { status: 'error', message: error };
    if (unfinished) return { status: 'unfinished' };
    if (pinnedRun)
        return result
            ? { status: 'complete', model: reduceEvents([]), result, connectionLost: false }
            : { status: 'loading' };

    const model = reduceEvents(events);

    // Completion: prefer the reduced model (watch mode), fall back to a polled
    // complete (view mode). Either way we need the finalized result in hand.
    const complete = model.status === 'complete' || polledStatus === 'complete';
    if (complete) {
        if (!result) return { status: 'loading' };
        return { status: 'complete', model, result, connectionLost };
    }
    if (model.hasRun) return { status: 'running', model, connectionLost };
    // A non-complete polled status (view mode is preparing/running) still means live.
    if (polledStatus) return { status: 'running', model, connectionLost };
    return { status: 'loading' };
}
