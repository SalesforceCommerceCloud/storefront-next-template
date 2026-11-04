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
 *
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../__fixtures__/audit-result.json';
import log from '../../../__fixtures__/progress/events.ndjson?raw';
import type { AuditResult } from '../types';
import { useAudit } from './useAudit';

const result = fixture as unknown as AuditResult;
const events: unknown[] = log
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const runId = (events[0] as { runId: string }).runId;
const runComplete = { type: 'run.complete', guidance: 'go-with-fixes', scores: [], at: '2026-09-27T16:31:00.000Z' };

/** An EventSource the test drives: `emit` dispatches to the hook's listeners. */
class FakeEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    static instances: FakeEventSource[] = [];
    readyState = FakeEventSource.CONNECTING;
    private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
    constructor(readonly url: string) {
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, listener: (event: { data?: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    close() {
        this.readyState = FakeEventSource.CLOSED;
    }
    emit(type: string, data?: unknown) {
        const frame = data === undefined ? {} : { data: typeof data === 'string' ? data : JSON.stringify(data) };
        for (const listener of this.listeners.get(type) ?? []) listener(frame);
    }
}
const source = () => {
    const latest = FakeEventSource.instances.at(-1);
    if (!latest) throw new Error('no EventSource opened');
    return latest;
};

type Reply = Response | Error | (() => Response | Error);
/** Serves each API path from a queue of replies; the last reply repeats. */
function serve(routes: Record<string, Reply[]>) {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const queue = routes[String(input)];
        if (!queue?.length) return Promise.resolve(new Response('not found', { status: 404 }));
        const next = queue.length > 1 ? queue.shift() : queue[0];
        const reply = typeof next === 'function' ? next() : next;
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve((reply as Response).clone());
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}
const json = (body: unknown, status = 200) => Response.json(body, { status });
const calls = (fetchMock: ReturnType<typeof serve>, path: string) =>
    fetchMock.mock.calls.filter(([input]) => String(input) === path).length;
/** Lets pending fetches and timers up to `ms` settle inside React's act. */
const settle = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('useAudit in view mode', () => {
    it('polls the status of a run it is not watching, then loads the result', async () => {
        const fetchMock = serve({
            '/api/status': [json({ status: 'running' }), json({ status: 'running' }), json({ status: 'complete' })],
            '/api/audit': [json(result)],
        });
        const { result: state } = renderHook(() => useAudit());
        expect(state.current.status).toBe('loading');
        expect(source().url).toBe('/api/events');

        // The server isn't watching a run, so the stream closes with nothing in it.
        source().readyState = FakeEventSource.CLOSED;
        act(() => source().emit('error'));
        await settle();
        expect(state.current.status).toBe('running');

        await settle(1000);
        expect(state.current).toMatchObject({
            status: 'complete',
            result: { project: { name: 'fixture-storefront' } },
        });
        expect(calls(fetchMock, '/api/audit')).toBe(1);
    });

    it('stays loading while a completed run has no result to fetch', async () => {
        serve({ '/api/status': [json({ status: 'complete' })], '/api/audit': [new Error('offline')] });
        const { result: state } = renderHook(() => useAudit());
        source().readyState = FakeEventSource.CLOSED;
        act(() => source().emit('error'));
        await settle();
        expect(state.current.status).toBe('loading');
    });

    it('reports a status request that fails', async () => {
        serve({ '/api/status': [new Error('connection refused')] });
        const { result: state } = renderHook(() => useAudit());
        source().readyState = FakeEventSource.CLOSED;
        act(() => source().emit('error'));
        await settle();
        expect(state.current).toEqual({ status: 'error', message: 'connection refused' });
    });
});

describe('useAudit in watch mode', () => {
    it('reduces the live stream, then loads the result when the run completes', async () => {
        const fetchMock = serve({ '/api/status': [json({ status: 'running', runId })], '/api/audit': [json(result)] });
        const { result: state } = renderHook(() => useAudit());
        act(() => {
            source().emit('open');
            for (const event of events) source().emit('message', event);
            source().emit('message', '{not json');
        });
        expect(state.current).toMatchObject({ status: 'running', connectionLost: false });
        if (state.current.status !== 'running') throw new Error('not running');
        expect(state.current.model.stepsComplete).toBe(4);
        expect(state.current.model.findings).toHaveLength(6);
        expect(calls(fetchMock, '/api/audit')).toBe(0);

        act(() => source().emit('message', runComplete));
        await settle();
        expect(state.current).toMatchObject({
            status: 'complete',
            model: { status: 'complete', guidance: 'go-with-fixes' },
        });
    });

    it('replays the stream from the top on every reconnect', () => {
        serve({ '/api/status': [json({ status: 'running', runId })] });
        const { result: state } = renderHook(() => useAudit());
        act(() => {
            for (const event of events) source().emit('message', event);
            source().emit('open');
            source().emit('message', events[0]);
        });
        if (state.current.status !== 'running') throw new Error('not running');
        expect(state.current.model.stepsComplete).toBe(0);
    });

    it('warns once a dropped stream has not come back, and clears it when it does', async () => {
        serve({ '/api/status': [json({ status: 'running', runId })] });
        const { result: state } = renderHook(() => useAudit());
        act(() => {
            source().emit('message', events[0]);
            source().emit('error');
        });
        await settle(3999);
        expect(state.current).toMatchObject({ connectionLost: false });
        // A second error inside the grace window doesn't restart it.
        act(() => source().emit('error'));
        await settle(1);
        expect(state.current).toMatchObject({ status: 'running', connectionLost: true });

        act(() => source().emit('open'));
        expect(state.current).toMatchObject({ connectionLost: false });

        // A blink that recovers within the grace window never warns.
        act(() => {
            source().emit('message', events[0]);
            source().emit('error');
            source().emit('open');
        });
        await settle(5000);
        expect(state.current).toMatchObject({ connectionLost: false });
    });

    it('ignores errors after the server ends the stream', async () => {
        const fetchMock = serve({ '/api/status': [json({ status: 'running', runId })] });
        const { result: state } = renderHook(() => useAudit());
        act(() => source().emit('end'));
        expect(source().readyState).toBe(FakeEventSource.CLOSED);
        act(() => source().emit('error'));
        await settle();
        expect(state.current.status).toBe('loading');
        // Only the follow-latest check asked for the status; nothing fell back to polling.
        expect(calls(fetchMock, '/api/status')).toBe(1);
    });

    it('keeps following the latest run and reloads when a new one starts', async () => {
        const fetchMock = serve({
            '/api/status': [
                json({ status: 'running', runId }),
                new Error('server restarting'),
                json({ status: 'running', runId: 'next-run' }),
            ],
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        renderHook(() => useAudit());
        act(() => source().emit('message', events[0]));
        await settle();
        expect(calls(fetchMock, '/api/status')).toBe(1);
        await settle(2000);
        expect(calls(fetchMock, '/api/status')).toBe(2);
        // The third check sees another run and reloads the page instead of checking again.
        await settle(2000);
        expect(calls(fetchMock, '/api/status')).toBe(3);
        await settle(10_000);
        expect(calls(fetchMock, '/api/status')).toBe(3);
    });

    it('stops listening and polling once unmounted', async () => {
        const fetchMock = serve({ '/api/status': [json({ status: 'running', runId })] });
        const { unmount } = renderHook(() => useAudit());
        act(() => {
            source().emit('message', events[0]);
            source().emit('error');
        });
        await settle();
        unmount();
        expect(source().readyState).toBe(FakeEventSource.CLOSED);
        const before = fetchMock.mock.calls.length;
        await settle(10_000);
        expect(fetchMock.mock.calls.length).toBe(before);
    });
});

describe('useAudit for a pinned run', () => {
    const pinned = '2026-10-14T10-26-00Z';
    const load = async () => {
        window.history.replaceState({}, '', `/?run=${pinned}`);
        vi.resetModules();
        return (await import('./useAudit')).useAudit;
    };
    afterEach(() => {
        window.history.replaceState({}, '', '/');
    });

    it('loads only that run’s result, without the live stream', async () => {
        const fetchMock = serve({ [`/api/audit?run=${pinned}`]: [json(result)] });
        const usePinned = await load();
        const { result: state } = renderHook(() => usePinned());
        expect(state.current.status).toBe('loading');
        await settle();
        expect(state.current).toMatchObject({ status: 'complete', connectionLost: false, model: { hasRun: false } });
        expect(FakeEventSource.instances).toHaveLength(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('says when the run never finished', async () => {
        serve({ [`/api/audit?run=${pinned}`]: [json({ error: 'unfinished' }, 409)] });
        const usePinned = await load();
        const { result: state } = renderHook(() => usePinned());
        await settle();
        expect(state.current).toEqual({ status: 'unfinished' });
    });

    it('reports a run that is missing or cannot be fetched', async () => {
        serve({ [`/api/audit?run=${pinned}`]: [json({ error: 'not found' }, 404)] });
        let usePinned = await load();
        const missing = renderHook(() => usePinned());
        await settle();
        expect(missing.result.current).toEqual({ status: 'error', message: `run ${pinned} was not found` });

        serve({ [`/api/audit?run=${pinned}`]: [new Error('connection refused')] });
        usePinned = await load();
        const offline = renderHook(() => usePinned());
        await settle();
        expect(offline.result.current).toEqual({ status: 'error', message: 'connection refused' });
    });

    it('ignores a reply that arrives after unmount', async () => {
        serve({ [`/api/audit?run=${pinned}`]: [json(result)] });
        const usePinned = await load();
        const { result: state, unmount } = renderHook(() => usePinned());
        unmount();
        await settle();
        expect(state.current.status).toBe('loading');
    });
});
