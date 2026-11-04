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
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../__fixtures__/audit-result.json';
import log from '../../__fixtures__/progress/events.ndjson?raw';
import type { AuditResult } from './types';
import { App } from './App';

const base = fixture as unknown as AuditResult;
// One rule the audit could not verify, so the overview links to a manual review.
const result: AuditResult = {
    ...base,
    evaluations: [
        ...base.evaluations,
        {
            ruleId: 'accessibility/focus-order',
            disposition: 'not-verified',
            title: 'Focus order follows the layout',
            summary: 'The agent could not drive the keyboard.',
            evidence: [],
        },
    ],
};
const events: unknown[] = log
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const runId = (events[0] as { runId: string }).runId;

class FakeEventSource {
    static readonly CLOSED = 2;
    static latest: FakeEventSource | undefined;
    readyState = 0;
    private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
    constructor() {
        FakeEventSource.latest = this;
    }
    addEventListener(type: string, listener: (event: { data?: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    close() {
        this.readyState = FakeEventSource.CLOSED;
    }
    emit(type: string, data?: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
    }
}
const stream = () => FakeEventSource.latest as FakeEventSource;

/** Serves fixed JSON per API path; a path mapped to an Error fails. */
function serve(routes: Record<string, unknown>) {
    vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
            const body = routes[String(input)];
            if (body instanceof Error) return Promise.reject(body);
            return Promise.resolve(
                body === undefined ? new Response('not found', { status: 404 }) : Response.json(body)
            );
        })
    );
}
const settle = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
/** The server isn't watching a run: the event stream closes empty and the tab polls instead. */
async function viewMode() {
    stream().readyState = FakeEventSource.CLOSED;
    act(() => stream().emit('error'));
    await settle();
}
const nav = (label: string) =>
    fireEvent.click(screen.getAllByRole('link').find((link) => link.getAttribute('title') === label) as HTMLElement);
const projectTitle = () => screen.getByTitle('fixture-storefront');

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('App', () => {
    it('shows a spinner until it knows what to show', () => {
        serve({});
        render(<App />);
        expect(screen.getByText('Loading audit')).toBeTruthy();
    });

    it('opens a finished run straight into the dashboard', async () => {
        serve({ '/api/status': { status: 'complete' }, '/api/audit': result, '/api/runs': [] });
        render(<App />);
        await viewMode();
        expect(projectTitle()).toBeTruthy();
        expect(screen.getByText('2026-09-16 00:00:00 UTC')).toBeTruthy();
        expect(screen.getByText('v0.2.0')).toBeTruthy();
        expect(screen.getAllByRole('link').flatMap((link) => link.getAttribute('title') ?? [])).toEqual([
            'Overview',
            'Performance (2)',
            'Accessibility (1)',
            'All Findings (3)',
        ]);
        const highlight = (label: string) => screen.getByText(label, { selector: '.slds-page-header__detail-row *' });
        expect(highlight('High').parentElement?.textContent).toContain('2');
        expect(highlight('Medium').parentElement?.textContent).toContain('1');
    });

    it('moves between the overview, each category and all findings', async () => {
        serve({ '/api/status': { status: 'complete' }, '/api/audit': result, '/api/runs': [] });
        render(<App />);
        await viewMode();

        nav('Performance (2)');
        expect(screen.getByText('Performance findings (2)')).toBeTruthy();
        expect(screen.queryByTitle('fixture-storefront')).toBeNull();

        nav('Accessibility (1)');
        expect(screen.getByText('1 codified rule; 1 finding, 1 needs a manual review.')).toBeTruthy();

        nav('All Findings (3)');
        expect(screen.getByText('All findings (5)')).toBeTruthy();
        expect(screen.getByText('Showing 5 of 5')).toBeTruthy();

        nav('Overview');
        fireEvent.click(screen.getByText('Accessibility', { selector: '.audit-tile *' }));
        expect(screen.getByText('Missing accessible name')).toBeTruthy();
        expect(screen.queryByText('Slow product-page LCP')).toBeNull();
    });

    it('deep-links the manual review count to All Findings, filtered', async () => {
        serve({ '/api/status': { status: 'complete' }, '/api/audit': result, '/api/runs': [] });
        render(<App />);
        await viewMode();
        fireEvent.click(screen.getByRole('button', { name: 'View in All Findings' }));
        expect(screen.getByText('Showing 1 of 5')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Focus order follows the layout' })).toBeTruthy();

        // Plain navigation opens the table unfiltered.
        nav('All Findings (3)');
        expect(screen.getByText('Showing 5 of 5')).toBeTruthy();
    });

    it('follows a live run and holds on the completion screen until the report is opened', async () => {
        serve({ '/api/status': { status: 'running', runId }, '/api/audit': result, '/api/runs': [] });
        render(<App />);
        act(() => {
            stream().emit('open');
            for (const event of events) stream().emit('message', event);
        });
        expect(screen.getByText('Step 5 of 7')).toBeTruthy();

        act(() =>
            stream().emit('message', {
                type: 'run.complete',
                guidance: 'go-with-fixes',
                scores: [],
                at: '2026-09-27T16:31:00.000Z',
            })
        );
        await settle();
        expect(screen.getByText('Launch with fixes', { selector: 'h2' })).toBeTruthy();
        fireEvent.click(screen.getByText('Open report'));
        expect(projectTitle()).toBeTruthy();
    });

    it('warns on the live screen when the server stops answering', async () => {
        serve({ '/api/status': { status: 'running', runId } });
        render(<App />);
        act(() => {
            for (const event of events) stream().emit('message', event);
            stream().emit('error');
        });
        await settle(4000);
        expect(screen.getByText(/Connection to the audit server lost/)).toBeTruthy();
    });

    it('reports a dashboard that cannot load', async () => {
        serve({ '/api/status': new Error('connection refused') });
        render(<App />);
        await viewMode();
        expect(screen.getByText('Failed to load audit: connection refused')).toBeTruthy();
    });

    it('says a pinned run never finished and keeps the run picker', async () => {
        window.history.replaceState({}, '', '/?run=old');
        vi.resetModules();
        const { App: PinnedApp } = await import('./App');
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) =>
                Promise.resolve(
                    String(input) === '/api/runs'
                        ? Response.json([
                              { id: 'new', complete: true },
                              { id: 'old', complete: false },
                          ])
                        : new Response('unfinished', { status: 409 })
                )
            )
        );
        try {
            render(<PinnedApp />);
            await settle();
            expect(screen.getByText('This run did not finish, so it has no report.')).toBeTruthy();
            const picker = screen.getByRole('combobox', { name: 'Run' }) as HTMLSelectElement;
            expect(picker.value).toBe('old');
            expect(
                within(picker)
                    .getAllByRole('option')
                    .map((option) => option.textContent)
            ).toEqual(['new (latest)', 'old (unfinished)']);
        } finally {
            window.history.replaceState({}, '', '/');
        }
    });
});
