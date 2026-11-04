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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const RUNS = [
    { id: '2026-10-14T10-26-00Z', complete: true },
    { id: '2026-10-13T09-00-00Z', complete: false },
    { id: '2026-10-12T08-00-00Z', complete: true },
];

type Reply = { ok: boolean; status?: number; statusText?: string; body?: unknown } | Error;

function serve(runs: Reply, remove?: Reply) {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        const reply = init?.method === 'DELETE' ? remove : runs;
        if (!reply) return Promise.reject(new Error(`unexpected ${url}`));
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve({
            ok: reply.ok,
            status: reply.status ?? (reply.ok ? 200 : 500),
            statusText: reply.statusText ?? '',
            json: () => Promise.resolve(reply.body),
        } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

/** Loads RunPicker and the mocked run module for a tab opened at `search`. */
async function load(search = '') {
    window.history.replaceState({}, '', `/${search}`);
    vi.resetModules();
    // vi.resetModules() keeps mocked modules, so each load() registers a fresh one that reads the new URL.
    vi.doMock('../lib/run', async (importOriginal) => ({
        ...(await importOriginal<typeof import('../lib/run')>()),
        openRun: vi.fn(),
    }));
    const run = await import('../lib/run');
    const { RunPicker } = await import('./RunPicker');
    return { RunPicker, openRun: vi.mocked(run.openRun) };
}

const settle = () => act(async () => {});
const picker = () => screen.getByRole('combobox', { name: 'Run' }) as HTMLSelectElement;

afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('RunPicker', () => {
    it.each([
        ['there is only one run', { ok: true, body: [RUNS[0]] }],
        ['the run list cannot be read', { ok: false, status: 500 }],
        ['the request fails', new Error('offline')],
    ] satisfies [string, Reply][])('stays hidden when %s', async (_, reply) => {
        serve(reply);
        const { RunPicker } = await load();
        const { container } = render(<RunPicker />);
        await settle();
        expect(container.innerHTML).toBe('');
    });

    it('lists every run with readable labels and no delete for the latest', async () => {
        const fetchMock = serve({ ok: true, body: RUNS });
        const { RunPicker } = await load();
        render(<RunPicker />);
        await settle();
        expect(fetchMock).toHaveBeenCalledWith('/api/runs');
        expect([...picker().options].map((option) => option.textContent)).toEqual([
            '2026-10-14 10:26:00 UTC (latest)',
            '2026-10-13 09:00:00 UTC (unfinished)',
            '2026-10-12 08:00:00 UTC',
        ]);
        expect(picker().value).toBe('2026-10-14T10-26-00Z');
        expect(screen.queryByRole('button', { name: 'Delete run' })).toBeNull();
    });

    it('opens an older run by id and the latest run at the root', async () => {
        serve({ ok: true, body: RUNS });
        const { RunPicker, openRun } = await load('?run=2026-10-12T08-00-00Z');
        render(<RunPicker />);
        await settle();
        expect(picker().value).toBe('2026-10-12T08-00-00Z');
        fireEvent.change(picker(), { target: { value: '2026-10-13T09-00-00Z' } });
        expect(openRun).toHaveBeenLastCalledWith('2026-10-13T09-00-00Z');
        fireEvent.change(picker(), { target: { value: '2026-10-14T10-26-00Z' } });
        expect(openRun).toHaveBeenLastCalledWith(undefined);
    });

    it('asks before deleting a pinned run and does nothing when declined', async () => {
        const fetchMock = serve({ ok: true, body: RUNS }, { ok: true });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const { RunPicker, openRun } = await load('?run=2026-10-12T08-00-00Z');
        render(<RunPicker />);
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));
        await settle();
        expect(confirm).toHaveBeenCalledWith(
            'Delete the run from 2026-10-12 08:00:00 UTC? Its report and collected evidence are removed from disk.'
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(openRun).not.toHaveBeenCalled();
    });

    it('deletes the pinned run and returns to the latest', async () => {
        const fetchMock = serve({ ok: true, body: RUNS }, { ok: true });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { RunPicker, openRun } = await load('?run=2026-10-12T08-00-00Z');
        render(<RunPicker />);
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));
        await settle();
        expect(fetchMock).toHaveBeenLastCalledWith('/api/runs/2026-10-12T08-00-00Z', { method: 'DELETE' });
        expect(openRun).toHaveBeenCalledWith(undefined);
    });

    it.each([
        [
            'the server reason',
            { ok: false, statusText: 'Conflict', body: { error: 'the run is still open' } },
            'the run is still open',
        ],
        ['the status text without a reason', { ok: false, statusText: 'Conflict', body: {} }, 'Conflict'],
    ] satisfies [string, Reply, string][])('reports a failed delete with %s', async (_, reply, reason) => {
        serve({ ok: true, body: RUNS }, reply);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const { RunPicker, openRun } = await load('?run=2026-10-12T08-00-00Z');
        render(<RunPicker />);
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));
        await settle();
        expect(alert).toHaveBeenCalledWith(`The run could not be deleted: ${reason}`);
        expect(openRun).not.toHaveBeenCalled();
    });
});
